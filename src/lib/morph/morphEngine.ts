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

/** Per-leg center activation zone (normalized Y) — active BELOW the knee only. */
const LEG_SPLIT_LOW = 0.20;
const LEG_SPLIT_HIGH = 0.28;

/** Arm → shoulder-junction radial-center blend zone (normalized Y). */
const ARM_JUNCTION_LOW = 0.56;
const ARM_JUNCTION_HIGH = 0.70;

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
// Ring-interpolated radial sensitivity
//
// Source of truth: sex-specific ring table in sensitivityModel.ts. The same
// table drives metric projection, so mesh circumference growth and the
// metrics panel always agree.
// ════════════════════════════════════════════════════════════════

function ringInterpolatedSensitivity(
  binding: VertexBinding,
  rings: LandmarkRing[],
  sex: Sex,
): number {
  if (rings.length === 0) return 0;
  const above = rings[binding.ringAboveIdx];
  const below = rings[binding.ringBelowIdx];
  const sAbove = above ? getRingSensitivity(above.name, sex) : 0;
  const sBelow = below ? getRingSensitivity(below.name, sex) : 0;
  return sBelow * (1 - binding.ringWeight) + sAbove * binding.ringWeight;
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
    if (oy > 0.30) continue; // only use below-knee vertices for leg centers
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

    const armSegment = isArmSegment(binding.segmentId);

    // Global BF response — arms use flat per-sub-segment sensitivity;
    // everything else uses ring-interpolated sensitivity from the sex-specific
    // ring table (same source of truth as the metrics panel).
    let sens: number;
    if (binding.segmentId === 'upper_arms') sens = upperArmSens;
    else if (binding.segmentId === 'forearms') sens = forearmSens;
    else sens = ringInterpolatedSensitivity(binding, rings, sex);

    const ov = blendedSegmentOverride(oy, overrides, armSegment);
    const baseScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (1 + (deltaBodyFat * sens) / 100) * (1 + ov / 100)),
    );

    // Determine radial center.
    let cx: number;
    let cz: number;

    if (armSegment) {
      const isLeft = ox < axisCX;
      const armCX = isLeft ? arms.leftCX : arms.rightCX;
      const armCZ = isLeft ? arms.leftCZ : arms.rightCZ;
      const jb = Math.min(
        1,
        Math.max(0, (oy - ARM_JUNCTION_LOW) / (ARM_JUNCTION_HIGH - ARM_JUNCTION_LOW)),
      );
      const jbs = jb * jb * (3 - 2 * jb); // smoothstep
      cx = armCX + jbs * (axisCX - armCX);
      cz = armCZ + jbs * (axisCZ - armCZ);
    } else if (oy < LEG_SPLIT_LOW) {
      const isLeft = ox < axisCX;
      cx = isLeft ? legs.leftCX : legs.rightCX;
      cz = isLeft ? legs.leftCZ : legs.rightCZ;
    } else if (oy < LEG_SPLIT_HIGH) {
      const t = (oy - LEG_SPLIT_LOW) / (LEG_SPLIT_HIGH - LEG_SPLIT_LOW);
      const bl = t * t * (3 - 2 * t); // smoothstep
      const isLeft = ox < axisCX;
      const legCX = isLeft ? legs.leftCX : legs.rightCX;
      const legCZ = isLeft ? legs.leftCZ : legs.rightCZ;
      cx = legCX + bl * (axisCX - legCX);
      cz = legCZ + bl * (axisCZ - legCZ);
    } else {
      cx = axisCX;
      cz = axisCZ;
    }

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
