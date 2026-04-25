import type { LandmarkRing, VertexBinding, SegmentOverrides, SegmentId } from '@/types/scan';
import type { BodyGender } from '@/lib/stores/genderStore';
import { SEGMENTS } from '@/lib/constants/segmentDefs';
import { getArmSensitivity, getRingSensitivity, type Sex } from './sensitivityModel';

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.65;

/** Segment-override damping: +25 slider → ~8.75% scale change. */
const SEGMENT_OVERRIDE_STRENGTH = 0.35;

/**
 * Inner-thigh midline-pull Y window (normalized Y).
 * The thigh region between top-of-calves (LEG_SPLIT_LOW) and bottom-of-hips
 * (LEG_SPLIT_HIGH). All non-arm vertices scale radially from the body axis
 * — that gives a continuous lateral lever arm from calf to hip, so no
 * lateral kink. To restore the medial-merge behavior that the old per-leg
 * radial center provided, the post-pass below pulls inner-thigh vertices
 * toward the midline (on upscale) / away from the midline (on downscale)
 * within this Y window.
 */
const LEG_SPLIT_LOW = 0.22;
const LEG_SPLIT_HIGH = 0.40;

/**
 * Inner-thigh midline-pull strength (unit-height space).
 * 0.03 → ~5cm peak on a 1750mm person at finalScale 1.4. Tune down if
 * thighs over-fuse, up if they still gap.
 */
const INNER_THIGH_PULL = 0.03;

/** Arm → shoulder-junction radial-center blend zone (normalized Y). */
const ARM_JUNCTION_LOW = 0.56;
const ARM_JUNCTION_HIGH = 0.70;

/**
 * Smooth-blend band half-widths (unit-height space).
 *  - ARM_BAND:  arm vs torso x-distance softening (~40mm on a 1750mm scan).
 *  - ELBOW_BAND: upper-arm vs forearm Y softening (~85mm). Wide enough that
 *    the upper-arm ↔ forearm sensitivity step doesn't show as a kink at
 *    high SENSITIVITY_GAIN.
 */
const ARM_BAND = 0.025;
const ELBOW_BAND = 0.05;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

// ════════════════════════════════════════════════════════════════
// Gender-aware directional (front/back/lateral) control
// ════════════════════════════════════════════════════════════════

function directionalScale(
  y: number,
  zDir: number,
  xDir: number,
  scale: number,
  gender: BodyGender,
): number {
  const delta = scale - 1;
  if (Math.abs(delta) < 0.005) return scale;

  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  let bellyBias: number, bustBias: number, thighBias: number;
  let hipLateral: number, thighLateral: number;
  let backDamp: number;

  if (gender === 'male') {
    bellyBias = g(0.53, 0.07, 0.42) + g(0.48, 0.06, 0.30);
    bustBias = g(0.62, 0.05, 0.10);
    thighBias = g(0.34, 0.06, 0.08);
    // Narrow hips in males: keep lateral hip bulge minimal
    hipLateral = g(0.44, 0.08, 0.06);
    thighLateral = g(0.33, 0.08, 0.05);
    backDamp = g(0.53, 0.10, 0.18);
  } else if (gender === 'female') {
    bellyBias = g(0.53, 0.07, 0.25) + g(0.48, 0.06, 0.18);
    bustBias = g(0.62, 0.05, 0.28);
    thighBias = g(0.34, 0.06, 0.18);
    hipLateral = g(0.44, 0.08, 0.30);
    thighLateral = g(0.33, 0.08, 0.18);
    backDamp = g(0.53, 0.10, 0.12);
  } else {
    bellyBias = g(0.53, 0.07, 0.35) + g(0.48, 0.06, 0.25);
    bustBias = g(0.62, 0.05, 0.18);
    thighBias = g(0.34, 0.06, 0.12);
    hipLateral = g(0.44, 0.08, 0.20);
    thighLateral = g(0.33, 0.08, 0.12);
    backDamp = g(0.53, 0.10, 0.15);
  }

  const frontBias = bellyBias + bustBias + thighBias;
  const lateralBias = hipLateral + thighLateral;

  let mult = 1.0;
  if (zDir > 0) mult += frontBias * zDir;
  else mult += backDamp * zDir;
  mult += lateralBias * xDir;

  return 1.0 + delta * mult;
}

// ════════════════════════════════════════════════════════════════
// Gaussian-weighted ring sensitivity
//
// Source of truth: sex-specific ring table in sensitivityModel.ts. The same
// table drives metric projection, so mesh circumference growth and the
// metrics panel agree. Each ring contributes via a Gaussian kernel centered
// on its actual scan Y so the radial expansion varies smoothly with height,
// with no band/cliff artifacts at ring boundaries.
// ════════════════════════════════════════════════════════════════

/**
 * Gaussian sigma for ring sensitivity averaging, in the same unit-height
 * normalized space as ring.height / vertex Y. Body height = 1.0, so 0.04
 * ≈ 70mm on a 1750mm person. Tune lower for sharper waist emphasis, higher
 * for smoother transitions.
 */
const RING_KERNEL_SIGMA = 0.04;
const RING_KERNEL_MIN_WEIGHT = 0.001;

/** Ring names that are arm-only and must be excluded from torso/leg sampling. */
const ARM_RING_NAMES: ReadonlySet<string> = new Set([
  'ElbowLeftArm',
  'ElbowRightArm',
  'WristLeftArm',
  'WristRightArm',
]);

function gaussianRingSensitivity(
  y: number,
  rings: readonly LandmarkRing[],
  sex: Sex,
): number {
  const twoSigmaSq = 2 * RING_KERNEL_SIGMA * RING_KERNEL_SIGMA;
  let sum = 0;
  let weightSum = 0;
  for (const ring of rings) {
    if (ARM_RING_NAMES.has(ring.name)) continue;
    const d = y - ring.height;
    const w = Math.exp(-(d * d) / twoSigmaSq);
    if (w < RING_KERNEL_MIN_WEIGHT) continue;
    sum += getRingSensitivity(ring.name, sex) * w;
    weightSum += w;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

// ════════════════════════════════════════════════════════════════
// Segment-override Gaussian blending
// ════════════════════════════════════════════════════════════════

/**
 * Blend segment-override values by Gaussian Y-distance.
 * Lateral segments (arms) and non-lateral segments are blended against their
 * own vertex population so an arm override only affects arm vertices and a
 * torso override only affects torso vertices.
 */
function blendedSegmentOverride(
  y: number,
  overrides: SegmentOverrides,
  isArm: boolean,
): number {
  let totalWeight = 0;
  let blendedValue = 0;
  for (const seg of SEGMENTS) {
    if (Boolean(seg.isLateral) !== isArm) continue;
    const dist = y - seg.yCenter;
    const w = Math.exp(-(dist * dist) / (2 * seg.sigma * seg.sigma));
    if (w > 0.001) {
      blendedValue += overrides[seg.id] * w;
      totalWeight += w;
    }
  }
  return totalWeight > 0 ? (blendedValue / totalWeight) * SEGMENT_OVERRIDE_STRENGTH : 0;
}

// ════════════════════════════════════════════════════════════════
// Laplacian smoothing
// ════════════════════════════════════════════════════════════════

function laplacianSmooth(
  positions: Float32Array,
  adjacency: Uint32Array[],
  iterations: number,
  lambda: number,
): void {
  const vertexCount = positions.length / 3;
  const temp = new Float32Array(positions.length);

  for (let iter = 0; iter < iterations; iter++) {
    temp.set(positions);
    for (let i = 0; i < vertexCount; i++) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) continue;
      let avgX = 0;
      let avgZ = 0;
      for (let j = 0; j < neighbors.length; j++) {
        avgX += temp[neighbors[j] * 3];
        avgZ += temp[neighbors[j] * 3 + 2];
      }
      avgX /= neighbors.length;
      avgZ /= neighbors.length;
      positions[i * 3] += lambda * (avgX - positions[i * 3]);
      positions[i * 3 + 2] += lambda * (avgZ - positions[i * 3 + 2]);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// Per-side center computation helpers
// ════════════════════════════════════════════════════════════════

function isArmSegment(id: SegmentId | undefined): boolean {
  return id === 'upper_arms' || id === 'forearms';
}

function computeArmCenters(
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  vertexCount: number,
  axisCX: number,
  axisCZ: number,
) {
  let lX = 0, lZ = 0, lN = 0, rX = 0, rZ = 0, rN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (!isArmSegment(bindings[i]?.segmentId)) continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) {
      lX += ox;
      lZ += originalPositions[i * 3 + 2];
      lN++;
    } else {
      rX += ox;
      rZ += originalPositions[i * 3 + 2];
      rN++;
    }
  }
  return {
    leftCX: lN > 0 ? lX / lN : axisCX - 0.12,
    leftCZ: lN > 0 ? lZ / lN : axisCZ,
    rightCX: rN > 0 ? rX / rN : axisCX + 0.12,
    rightCZ: rN > 0 ? rZ / rN : axisCZ,
  };
}

function computeLegCenters(
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  vertexCount: number,
  axisCX: number,
  axisCZ: number,
) {
  let lX = 0, lZ = 0, lN = 0, rX = 0, rZ = 0, rN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (isArmSegment(bindings[i]?.segmentId)) continue;
    const oy = originalPositions[i * 3 + 1];
    // Include the full leg (calves + thighs) so the per-leg center reflects
    // the full leg mass, matching the extended LEG_SPLIT blend region.
    if (oy > 0.40) continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) {
      lX += ox;
      lZ += originalPositions[i * 3 + 2];
      lN++;
    } else {
      rX += ox;
      rZ += originalPositions[i * 3 + 2];
      rN++;
    }
  }
  return {
    leftCX: lN > 0 ? lX / lN : axisCX - 0.06,
    leftCZ: lN > 0 ? lZ / lN : axisCZ,
    rightCX: rN > 0 ? rX / rN : axisCX + 0.06,
    rightCZ: rN > 0 ? rZ / rN : axisCZ,
  };
}

// ════════════════════════════════════════════════════════════════
// Main deformation entry point
// ════════════════════════════════════════════════════════════════

/**
 * Deform the scan mesh based on body fat % change and segment overrides.
 *
 * Key design:
 *   - Non-arm vertices derive global BF response from the sex-specific ring
 *     table, linearly interpolated between the vertex's bounding rings —
 *     guarantees mesh circumference matches the metrics panel.
 *   - Arm vertices (upper_arms / forearms) use sex-specific sub-segment
 *     sensitivity from {@link getArmSensitivity}.
 *   - Arms scale from per-arm radial centers, blending to body center at the
 *     shoulder junction.
 *   - Hips and upper thighs scale from body center (no per-leg split above knee).
 *   - Per-leg centers activate only below the knee.
 *   - Gender-aware directional control (belly forward, hips lateral, etc.).
 *   - Segment overrides adjust incrementally on top of the global baseline.
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[],
  gender: BodyGender = 'neutral',
  armThreshold?: number,
): void {
  const vertexCount = originalPositions.length / 3;
  const sex: Sex = gender;

  // Body center axis
  let axisCX = 0;
  let axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) {
      axisCX += ring.center.x;
      axisCZ += ring.center.z;
    }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  const arms = computeArmCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);
  const legs = computeLegCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);

  // Pre-compute sex-specific arm sub-segment global BF response
  const upperArmSens = getArmSensitivity('upper_arm', sex);
  const forearmSens = getArmSensitivity('forearm', sex);

  // Arm/torso soft boundary. armThreshold is in unit-height space. Fall back
  // to Bust-ring-based estimate if the caller didn't supply one.
  let effectiveArmThreshold = armThreshold;
  if (effectiveArmThreshold === undefined || effectiveArmThreshold <= 0) {
    const bust = rings.find((r) => r.name === 'Bust');
    if (bust) {
      effectiveArmThreshold = ((bust.radius.left + bust.radius.right) / 2) * 1.05;
    } else {
      effectiveArmThreshold = 0.08; // sane default in unit-height space
    }
  }
  const armEdge0 = effectiveArmThreshold - ARM_BAND;
  const armEdge1 = effectiveArmThreshold + ARM_BAND;

  // Elbow Y for upper-arm ↔ forearm smoothing. Use per-side ring height when
  // present; fall back to whichever is available; else a mid-arm default.
  const leftElbowRing = rings.find((r) => r.name === 'ElbowLeftArm');
  const rightElbowRing = rings.find((r) => r.name === 'ElbowRightArm');
  const fallbackElbowY =
    (leftElbowRing?.height ?? rightElbowRing?.height) ?? 0.44;
  const leftElbowY = leftElbowRing?.height ?? fallbackElbowY;
  const rightElbowY = rightElbowRing?.height ?? fallbackElbowY;

  // ── Per-vertex deformation ──
  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    if (!binding) {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
      continue;
    }

    // ─── Continuous arm-ness / upper-arm-ness weights ───
    const xDist = Math.abs(ox - axisCX);
    const armness = smoothstep(armEdge0, armEdge1, xDist);
    // Body-left arm vs body-right arm: engine convention uses ox < axisCX as
    // one bucket (matches computeArmCenters). Pick the matching elbow Y.
    const isNegativeX = ox < axisCX;
    const elbowY = isNegativeX ? rightElbowY : leftElbowY;
    const upperArmness = smoothstep(elbowY - ELBOW_BAND, elbowY + ELBOW_BAND, oy);

    // ─── Sensitivity: smooth blend between torso Gaussian and arm sub-segment ───
    const torsoSens = gaussianRingSensitivity(oy, rings, sex);
    const armSens = mix(forearmSens, upperArmSens, upperArmness);
    const sens = mix(torsoSens, armSens, armness);

    // Segment-override pool is still binary (arm vs non-arm) — it's a UI
    // concept, not a deformation-time concept. Route via armness >= 0.5.
    const ov = blendedSegmentOverride(oy, overrides, armness >= 0.5);
    const baseScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (1 + (deltaBodyFat * sens) / 100) * (1 + ov / 100)),
    );

    // ─── Radial center: blend body axis ↔ per-arm center by armness ───
    // Non-arm vertices use the body axis so the lateral lever arm grows
    // monotonically with |ox - axisCX| from calf to hip — no kink at the
    // knee. Inner-thigh medial-merge behavior is restored by the post-pass
    // below.
    const bodyCX = axisCX;
    const bodyCZ = axisCZ;
    // Per-arm center with shoulder-junction smoothstep back to axis.
    const rawArmCX = isNegativeX ? arms.leftCX : arms.rightCX;
    const rawArmCZ = isNegativeX ? arms.leftCZ : arms.rightCZ;
    const jb = Math.min(
      1,
      Math.max(0, (oy - ARM_JUNCTION_LOW) / (ARM_JUNCTION_HIGH - ARM_JUNCTION_LOW)),
    );
    const jbs = jb * jb * (3 - 2 * jb);
    const armCX = rawArmCX + jbs * (axisCX - rawArmCX);
    const armCZ = rawArmCZ + jbs * (axisCZ - rawArmCZ);

    const cx = mix(bodyCX, armCX, armness);
    const cz = mix(bodyCZ, armCZ, armness);

    // Compute direction from center and apply scale.
    const dx = ox - cx;
    const dz = oz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.0001) {
      const zDir = dz / dist;
      const xDir = Math.abs(dx / dist);

      const finalScale = directionalScale(oy, zDir, xDir, baseScale, gender);

      positions[i * 3] = cx + dx * finalScale;
      positions[i * 3 + 1] = oy; // preserve Y
      positions[i * 3 + 2] = cz + dz * finalScale;

      // Inner-thigh midline pull. Y window peaks across the thigh and tapers
      // at the calves and hips. X window restricts to the medial surface
      // (between the body axis and the leg centroid X on this side). Pull
      // sign follows (finalScale - 1): thighs merge on upscale, separate on
      // downscale. Gated by (1 - armness) so arms are unaffected.
      const yWindow =
        smoothstep(LEG_SPLIT_LOW, LEG_SPLIT_LOW + 0.04, oy) *
        (1 - smoothstep(LEG_SPLIT_HIGH - 0.04, LEG_SPLIT_HIGH, oy));
      if (yWindow > 0 && armness < 1) {
        const legCX = isNegativeX ? legs.leftCX : legs.rightCX;
        const legHalfWidth = Math.abs(legCX - axisCX);
        // X window: 1 from axis out to ~75% of legCX, ramps to 0 by legCX.
        const innerEdge = axisCX + (isNegativeX ? -1 : 1) * legHalfWidth * 0.75;
        const outerEdge = legCX;
        // smoothstep with edge0 > edge1 (positive side) or edge0 < edge1
        // (negative side) both produce 1 inside the inner band, 0 outside.
        const innerX = smoothstep(outerEdge, innerEdge, ox);
        const innerThighWeight = yWindow * innerX * (1 - armness);
        const pull = innerThighWeight * (finalScale - 1) * INNER_THIGH_PULL;
        const pullDir = isNegativeX ? 1 : -1;
        positions[i * 3] += pullDir * pull;
      }
    } else {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
    }
  }

  // ── Laplacian smoothing ── light pass to prevent sharp edges
  if (adjacency && adjacency.length === vertexCount) {
    const overrideCount = Object.keys(overrides).length || 1;
    const overrideAvg =
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / overrideCount;
    const mag = Math.abs(deltaBodyFat) + overrideAvg;
    const iters = mag > 20 ? 3 : 2;
    laplacianSmooth(positions, adjacency, iters, 0.30);
  }
}
