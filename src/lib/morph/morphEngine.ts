import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

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
// Sensitivity — how much each body height changes per 1% BF
// ════════════════════════════════════════════════════════════════

function sensitivity(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.08, 1.00)   // waist/belly — peak fat depot
    + g(0.44, 0.07, 0.72)   // lower abdomen / hips
    + g(0.62, 0.06, 0.50)   // bust/chest
    + g(0.34, 0.08, 0.58)   // upper thighs
    + g(0.22, 0.10, 0.22)   // calves
    + g(0.72, 0.07, 0.30);  // upper chest/shoulders
}

// ════════════════════════════════════════════════════════════════
// Directional control — front/back/lateral scaling per region
// ════════════════════════════════════════════════════════════════

/**
 * Computes a directional multiplier that makes fat distribution realistic.
 *
 * Instead of uniform radial inflation, this makes:
 *   - Belly protrude forward at waist height
 *   - Hips expand laterally
 *   - Bust push forward slightly
 *   - Thighs expand outward
 *   - Back expand less than front
 *
 * This is the key difference between "balloon" and "realistic".
 *
 * @param y    - Normalized height (0=feet, 1=head)
 * @param zDir - Normalized Z direction (-1=back, +1=front)
 * @param xDir - Normalized X direction (absolute, 0=center, 1=lateral)
 * @param scale - Base radial scale factor
 * @returns Directionally-adjusted scale factor
 */
function directionalScale(y: number, zDir: number, xDir: number, scale: number): number {
  // If scale is near 1 (no deformation), skip directional modulation
  const delta = scale - 1;
  if (Math.abs(delta) < 0.005) return scale;

  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  // Front bias: how much MORE the front expands vs sides (multiplied by delta)
  // Waist/belly: strong forward protrusion
  const bellyBias = g(0.53, 0.07, 0.35) + g(0.48, 0.06, 0.25);
  // Bust: moderate forward protrusion
  const bustBias = g(0.62, 0.05, 0.18);
  // Thighs: slight forward + lateral
  const thighBias = g(0.34, 0.06, 0.12);

  const frontBias = bellyBias + bustBias + thighBias;

  // Lateral bias: how much MORE sides expand (for hips, thighs)
  const hipLateral = g(0.44, 0.06, 0.20);
  const thighLateral = g(0.33, 0.07, 0.12);
  const lateralBias = hipLateral + thighLateral;

  // Back dampening: back generally expands less than front
  const backDamp = g(0.53, 0.10, 0.15);

  let mult = 1.0;

  if (zDir > 0) {
    // Front: boost expansion proportional to front bias
    mult += frontBias * zDir;
  } else {
    // Back: dampen expansion
    mult += backDamp * zDir; // zDir is negative, so this reduces mult
  }

  // Lateral boost (applies to both sides equally)
  mult += lateralBias * xDir;

  // Apply: the directional mult only affects the DELTA from 1.0
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
 *   - Per-height sensitivity (how much each region responds to BF change)
 *   - Directional control (belly forward, hips lateral, back dampened)
 *   - Per-limb centers (arms scale from arm center, legs from leg center)
 *   - Segment overrides with Gaussian blending and damping
 *   - Light Laplacian smoothing for mesh quality
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[]
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
      const tSens = sensitivity(oy);
      const tOv = blendedSegmentOverride(oy, overrides);
      const torsoS = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        (1 + deltaBodyFat * tSens / 100) * (1 + tOv / 100)));
      baseScale = armScale + jb * (torsoS - armScale);
    } else {
      // ── NON-ARM ── scale from body center or per-leg center
      const sens = sensitivity(oy);
      const ov = blendedSegmentOverride(oy, overrides);
      baseScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
        (1 + deltaBodyFat * sens / 100) * (1 + ov / 100)));

      // Choose scaling center based on height
      if (oy < LEG_BLEND_LOW) {
        // Full leg zone — per-leg center
        const isLeft = ox < axisCX;
        cx = isLeft ? legs.leftCX : legs.rightCX;
        cz = isLeft ? legs.leftCZ : legs.rightCZ;
      } else if (oy < LEG_BLEND_HIGH) {
        // Blend from leg center to body center
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
      const zDir = dz / dist;  // -1 (back) to +1 (front)
      const xDir = Math.abs(dx / dist); // 0 (center) to 1 (lateral)

      // Apply directional modulation — the key to realistic deformation
      const finalScale = directionalScale(oy, zDir, xDir, baseScale);

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
