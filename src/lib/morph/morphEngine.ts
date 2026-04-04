import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export type BodyGender = 'male' | 'female' | 'neutral';

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.65;

/** Segment overrides are damped: +25 slider → ~8.75% change */
const SEGMENT_OVERRIDE_STRENGTH = 0.35;

/** Arm flat sensitivity (per 1% BF) */
const ARM_SENSITIVITY = 0.55;

/** Leg center blend zone (normalized Y) */
const LEG_BLEND_LOW = 0.32;
const LEG_BLEND_HIGH = 0.44;

// ════════════════════════════════════════════════════════════════
// Gender-aware sensitivity — how much each body height changes per 1% BF
// ════════════════════════════════════════════════════════════════

/**
 * Male fat pattern: belly-dominant, less hips/thighs.
 * Android (apple-shaped) fat distribution.
 */
function sensitivityMale(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.08, 1.10)   // waist/belly — strong (android pattern)
    + g(0.44, 0.07, 0.55)   // hips — lower than female
    + g(0.62, 0.06, 0.38)   // chest — less than female bust
    + g(0.34, 0.08, 0.42)   // upper thighs — lower than female
    + g(0.22, 0.10, 0.20)   // calves
    + g(0.72, 0.07, 0.32);  // upper chest/shoulders — slightly more
}

/**
 * Female fat pattern: hips/thighs/bust-dominant, less belly.
 * Gynoid (pear-shaped) fat distribution.
 */
function sensitivityFemale(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.08, 0.82)   // waist/belly — less than male
    + g(0.44, 0.07, 0.88)   // hips — strong (gynoid pattern)
    + g(0.62, 0.06, 0.62)   // bust — stronger than male
    + g(0.34, 0.08, 0.72)   // upper thighs — much stronger
    + g(0.22, 0.10, 0.22)   // calves
    + g(0.72, 0.07, 0.26);  // upper chest/shoulders — less
}

/**
 * Neutral: average of male/female patterns (original tuning).
 */
function sensitivityNeutral(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.08, 1.00)   // waist/belly
    + g(0.44, 0.07, 0.72)   // hips
    + g(0.62, 0.06, 0.50)   // bust/chest
    + g(0.34, 0.08, 0.58)   // upper thighs
    + g(0.22, 0.10, 0.22)   // calves
    + g(0.72, 0.07, 0.30);  // upper chest/shoulders
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

/**
 * Directional multiplier for realistic fat distribution.
 *
 * Male: stronger belly forward protrusion, less hip lateral.
 * Female: stronger hip lateral expansion, more bust forward, more thigh.
 */
function directionalScale(y: number, zDir: number, xDir: number, scale: number, gender: BodyGender): number {
  const delta = scale - 1;
  if (Math.abs(delta) < 0.005) return scale;

  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  let bellyBias: number, bustBias: number, thighBias: number;
  let hipLateral: number, thighLateral: number;
  let backDamp: number;

  if (gender === 'male') {
    // Male: stronger belly, less hip/thigh lateral
    bellyBias = g(0.53, 0.07, 0.42) + g(0.48, 0.06, 0.30);
    bustBias = g(0.62, 0.05, 0.10);
    thighBias = g(0.34, 0.06, 0.08);
    hipLateral = g(0.44, 0.06, 0.12);
    thighLateral = g(0.33, 0.07, 0.08);
    backDamp = g(0.53, 0.10, 0.18);
  } else if (gender === 'female') {
    // Female: stronger hips/thighs lateral, more bust, less belly
    bellyBias = g(0.53, 0.07, 0.25) + g(0.48, 0.06, 0.18);
    bustBias = g(0.62, 0.05, 0.28);
    thighBias = g(0.34, 0.06, 0.18);
    hipLateral = g(0.44, 0.06, 0.30);
    thighLateral = g(0.33, 0.07, 0.18);
    backDamp = g(0.53, 0.10, 0.12);
  } else {
    // Neutral: original values
    bellyBias = g(0.53, 0.07, 0.35) + g(0.48, 0.06, 0.25);
    bustBias = g(0.62, 0.05, 0.18);
    thighBias = g(0.34, 0.06, 0.12);
    hipLateral = g(0.44, 0.06, 0.20);
    thighLateral = g(0.33, 0.07, 0.12);
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
      // Y preserved
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
    if (oy > 0.36) continue;
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
 * Uses radial scaling with:
 *   - Gender-aware per-height sensitivity (male=belly, female=hips/bust)
 *   - Gender-aware directional control (belly forward, hips lateral, etc.)
 *   - Per-limb centers (arms scale from arm center, legs from leg center)
 *   - Segment overrides with Gaussian blending and damping
 *   - Light Laplacian smoothing for mesh quality
 *
 * Global slider moves all regions proportionally via sensitivity curves.
 * Segment sliders then adjust incrementally on top of that baseline.
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

  // Pre-compute arm scale
  const armOvDamped = (overrides.arms + overrides.shoulders * 0.5) * SEGMENT_OVERRIDE_STRENGTH;
  const armScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
    (1 + deltaBodyFat * ARM_SENSITIVITY / 100) * (1 + armOvDamped / 100)));

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

    let cx: number, cz: number, baseScale: number;

    if (binding.segmentId === 'arms') {
      // ── ARM ── scale from per-arm center, blend at shoulder junction
      const isLeft = ox < axisCX;
      const armCX = isLeft ? arms.leftCX : arms.rightCX;
      const armCZ = isLeft ? arms.leftCZ : arms.rightCZ;
      const jb = Math.min(1, Math.max(0, (oy - 0.58) / 0.10));
      cx = armCX + jb * (axisCX - armCX);
      cz = armCZ + jb * (axisCZ - armCZ);

      // Blend to torso scale at shoulder junction
      const tSens = sensitivity(oy, gender);
      const tOv = blendedSegmentOverride(oy, overrides);
      const torsoS = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        (1 + deltaBodyFat * tSens / 100) * (1 + tOv / 100)));
      baseScale = armScale + jb * (torsoS - armScale);
    } else {
      // ── NON-ARM ── scale from body center or per-leg center
      const sens = sensitivity(oy, gender);
      const ov = blendedSegmentOverride(oy, overrides);
      baseScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        (1 + deltaBodyFat * sens / 100) * (1 + ov / 100)));

      // Choose scaling center based on height
      if (oy < LEG_BLEND_LOW) {
        const isLeft = ox < axisCX;
        cx = isLeft ? legs.leftCX : legs.rightCX;
        cz = isLeft ? legs.leftCZ : legs.rightCZ;
      } else if (oy < LEG_BLEND_HIGH) {
        const t = (oy - LEG_BLEND_LOW) / (LEG_BLEND_HIGH - LEG_BLEND_LOW);
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
    }

    // Compute direction from center
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
