import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import type { BodyGender } from '@/lib/stores/genderStore';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.65;

/** Segment overrides are damped: +25 slider → ~8.75% change */
const SEGMENT_OVERRIDE_STRENGTH = 0.35;

/**
 * Arm sensitivity gradient: upper arm gets fatter (near shoulder),
 * forearm gets slightly less rounding, wrist/hand minimal.
 * This is a gentle monotonic gradient — shape is preserved because
 * the change is smooth, unlike the wild swings of the body Y-curve.
 *
 * At Y≈0.50 (upper arm): ~0.42
 * At Y≈0.35 (elbow):     ~0.32
 * At Y≈0.25 (forearm):   ~0.26
 * At Y≈0.12 (wrist):     ~0.19
 */
const ARM_SENS_BASE = 0.18;
const ARM_SENS_BOOST = 0.27;
const ARM_Y_LOW = 0.10;   // wrist/hand level
const ARM_Y_HIGH = 0.56;  // shoulder junction

/**
 * Per-leg center activation zone (normalized Y).
 * Below LEG_SPLIT_LOW: full per-leg center (each calf scales from its own axis).
 * LEG_SPLIT_LOW → LEG_SPLIT_HIGH: smoothstep blend from per-leg to body center.
 * Above LEG_SPLIT_HIGH: body center (thighs scale from body center to avoid
 * inner-thigh pinching that per-leg centers cause).
 */
const LEG_SPLIT_LOW = 0.20;
const LEG_SPLIT_HIGH = 0.28;

/**
 * Arm shoulder junction blend zone.
 * Arms blend their radial center from arm-center to body-center here.
 */
const ARM_JUNCTION_LOW = 0.56;
const ARM_JUNCTION_HIGH = 0.70;

// ════════════════════════════════════════════════════════════════
// Gender-aware sensitivity — how much each body height changes per 1% BF
//
// EVERY region uses this — arms, legs, torso, everything.
// The curve is continuous so there are no shelf artifacts.
// ════════════════════════════════════════════════════════════════

function sensitivityMale(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.09, 1.10)   // waist/belly — strong (android)
    + g(0.44, 0.09, 0.58)   // hips — wider sigma for smooth transition
    + g(0.62, 0.07, 0.38)   // chest
    + g(0.34, 0.10, 0.45)   // upper thighs — wider to overlap with hips
    + g(0.20, 0.10, 0.30)   // calves — moderate scaling
    + g(0.72, 0.08, 0.32)   // upper chest/shoulders
    + g(0.07, 0.05, 0.15);  // ankles
}

function sensitivityFemale(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.09, 0.82)   // waist/belly — less than male
    + g(0.44, 0.09, 0.90)   // hips — strong, wider sigma
    + g(0.62, 0.11, 0.82)   // bust — wide sigma, strong for female chest
    + g(0.34, 0.10, 0.75)   // upper thighs — wider to overlap with hips
    + g(0.20, 0.10, 0.42)   // calves — substantial scaling
    + g(0.72, 0.08, 0.26)   // upper chest/shoulders
    + g(0.07, 0.05, 0.22);  // ankles — cankles at high BF%
}

function sensitivityNeutral(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.09, 1.00)   // waist/belly
    + g(0.44, 0.09, 0.72)   // hips — wider sigma
    + g(0.62, 0.07, 0.50)   // bust/chest
    + g(0.34, 0.10, 0.58)   // upper thighs — wider to overlap
    + g(0.20, 0.10, 0.28)   // calves
    + g(0.72, 0.08, 0.30)   // upper chest/shoulders
    + g(0.07, 0.05, 0.18);  // ankles
}

function sensitivity(y: number, gender: BodyGender): number {
  switch (gender) {
    case 'male': return sensitivityMale(y);
    case 'female': return sensitivityFemale(y);
    default: return sensitivityNeutral(y);
  }
}

// ════════════════════════════════════════════════════════════════
// Gender-aware directional control — front/back/lateral scaling
// ════════════════════════════════════════════════════════════════

function directionalScale(y: number, zDir: number, xDir: number, scale: number, gender: BodyGender): number {
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
    hipLateral = g(0.44, 0.08, 0.12);
    thighLateral = g(0.33, 0.08, 0.08);
    backDamp = g(0.53, 0.10, 0.18);
  } else if (gender === 'female') {
    bellyBias = g(0.53, 0.07, 0.25) + g(0.48, 0.06, 0.18);
    bustBias = g(0.62, 0.08, 0.40);
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

  if (zDir > 0) {
    mult += frontBias * zDir;
  } else {
    mult += backDamp * zDir;
  }

  mult += lateralBias * xDir;

  return 1.0 + delta * mult;
}

// ════════════════════════════════════════════════════════════════
// Segment override blending
// ════════════════════════════════════════════════════════════════

function blendedSegmentOverride(y: number, overrides: SegmentOverrides): number {
  let totalWeight = 0;
  let blendedValue = 0;
  for (const seg of SEGMENTS) {
    if (seg.isLateral) continue;
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
  lambda: number
): void {
  const vertexCount = positions.length / 3;
  const temp = new Float32Array(positions.length);

  for (let iter = 0; iter < iterations; iter++) {
    temp.set(positions);
    for (let i = 0; i < vertexCount; i++) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) continue;
      let avgX = 0, avgZ = 0;
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
// Center computation helpers
// ════════════════════════════════════════════════════════════════

function computeArmCenters(
  originalPositions: Float32Array, bindings: VertexBinding[], vertexCount: number, axisCX: number, axisCZ: number
) {
  let lX = 0, lZ = 0, lN = 0, rX = 0, rZ = 0, rN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lX += ox; lZ += originalPositions[i * 3 + 2]; lN++; }
    else { rX += ox; rZ += originalPositions[i * 3 + 2]; rN++; }
  }
  return {
    leftCX: lN > 0 ? lX / lN : axisCX - 0.12, leftCZ: lN > 0 ? lZ / lN : axisCZ,
    rightCX: rN > 0 ? rX / rN : axisCX + 0.12, rightCZ: rN > 0 ? rZ / rN : axisCZ,
  };
}

function computeLegCenters(
  originalPositions: Float32Array, bindings: VertexBinding[], vertexCount: number, axisCX: number, axisCZ: number
) {
  let lX = 0, lZ = 0, lN = 0, rX = 0, rZ = 0, rN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId === 'arms') continue;
    const oy = originalPositions[i * 3 + 1];
    if (oy > 0.30) continue; // only below-knee vertices for stable leg centers
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lX += ox; lZ += originalPositions[i * 3 + 2]; lN++; }
    else { rX += ox; rZ += originalPositions[i * 3 + 2]; rN++; }
  }
  return {
    leftCX: lN > 0 ? lX / lN : axisCX - 0.06, leftCZ: lN > 0 ? lZ / lN : axisCZ,
    rightCX: rN > 0 ? rX / rN : axisCX + 0.06, rightCZ: rN > 0 ? rZ / rN : axisCZ,
  };
}

// ════════════════════════════════════════════════════════════════
// Main deformation entry point
// ════════════════════════════════════════════════════════════════

/**
 * Deform the scan mesh based on body fat % change and segment overrides.
 *
 * Key design:
 *   - Arms use gentle gradient sensitivity (upper arm fatter, forearm less)
 *   - Body regions use continuous gender-aware sensitivity curve
 *   - Per-leg centers below knee (Y<0.28), body center above (thighs, hips)
 *   - Gender-aware directional control (belly forward, bust forward, hips lateral)
 *   - Segment overrides adjust incrementally on top of the global baseline
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[],
  gender: BodyGender = 'neutral'
): void {
  const vertexCount = originalPositions.length / 3;

  // Body center axis
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  const arms = computeArmCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);
  const legs = computeLegCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);

  // ── Per-vertex deformation ──
  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    if (!binding) {
      positions[i * 3] = ox; positions[i * 3 + 1] = oy; positions[i * 3 + 2] = oz;
      continue;
    }

    // ── Arms: flat sensitivity, uniform radial scale, no directional bias ──
    // Arms should only change volume, never shape. Using the body Y-curve
    // would give arm vertices at hip/waist height those regions' high
    // sensitivity, stretching the arm non-uniformly along its length.
    if (binding.segmentId === 'arms') {
      // Gentle gradient: upper arm fatter, forearm less, wrist minimal
      const armT = Math.min(1, Math.max(0, (oy - ARM_Y_LOW) / (ARM_Y_HIGH - ARM_Y_LOW)));
      const armSens = ARM_SENS_BASE + ARM_SENS_BOOST * armT;
      const armOv = (overrides.arms ?? 0) * SEGMENT_OVERRIDE_STRENGTH;
      const armScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        (1 + deltaBodyFat * armSens / 100) * (1 + armOv / 100)));

      const isLeft = ox < axisCX;
      const armCX = isLeft ? arms.leftCX : arms.rightCX;
      const armCZ = isLeft ? arms.leftCZ : arms.rightCZ;
      const jb = Math.min(1, Math.max(0, (oy - ARM_JUNCTION_LOW) / (ARM_JUNCTION_HIGH - ARM_JUNCTION_LOW)));
      const jbs = jb * jb * (3 - 2 * jb);
      const cx = armCX + jbs * (axisCX - armCX);
      const cz = armCZ + jbs * (axisCZ - armCZ);

      const dx = ox - cx;
      const dz = oz - cz;
      // Uniform radial scale — no directional bias for arms
      positions[i * 3] = cx + dx * armScale;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = cz + dz * armScale;
      continue;
    }

    // ── Body (torso, waist, hips, legs, shoulders) ──
    const sens = sensitivity(oy, gender);
    const ov = blendedSegmentOverride(oy, overrides);
    const baseScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
      (1 + deltaBodyFat * sens / 100) * (1 + ov / 100)));

    // Determine radial center based on body region
    let cx: number, cz: number;

    if (oy < LEG_SPLIT_LOW) {
      // Below knee: per-leg center
      const isLeft = ox < axisCX;
      cx = isLeft ? legs.leftCX : legs.rightCX;
      cz = isLeft ? legs.leftCZ : legs.rightCZ;
    } else if (oy < LEG_SPLIT_HIGH) {
      // Knee blend zone: smoothly transition from per-leg to body center.
      const t = (oy - LEG_SPLIT_LOW) / (LEG_SPLIT_HIGH - LEG_SPLIT_LOW);
      const bl = t * t * (3 - 2 * t); // smoothstep
      const isLeft = ox < axisCX;
      const legCX = isLeft ? legs.leftCX : legs.rightCX;
      const legCZ = isLeft ? legs.leftCZ : legs.rightCZ;
      cx = legCX + bl * (axisCX - legCX);
      cz = legCZ + bl * (axisCZ - legCZ);
    } else {
      // Hips, torso, shoulders: body center
      cx = axisCX;
      cz = axisCZ;
    }

    // Compute direction from center and apply directional scale
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
      positions[i * 3] = ox; positions[i * 3 + 1] = oy; positions[i * 3 + 2] = oz;
    }
  }

  // ── Laplacian smoothing ── light pass to prevent sharp edges
  if (adjacency && adjacency.length === vertexCount) {
    const mag = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 6;
    const iters = mag > 20 ? 3 : 2;
    laplacianSmooth(positions, adjacency, iters, 0.30);
  }
}
