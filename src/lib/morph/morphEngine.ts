import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import type { SMPLConstraints } from '@/lib/smpl/constraints';
import { smplSensitivity, smplScaleLimits } from '@/lib/smpl/constraints';
import { ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/** Fallback minimum and maximum scale factors (used when no SMPL constraints) */
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.55;

/**
 * Fallback sensitivity profile (hand-tuned Gaussians).
 * Used when no SMPL model is loaded.
 */
function fallbackSensitivity(y: number): number {
  const BASE = 0.18;

  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));

  return BASE
    + g(0.54, 0.09, 0.88)   // waist/belly
    + g(0.43, 0.08, 0.65)   // hips
    + g(0.64, 0.07, 0.50)   // bust/chest
    + g(0.32, 0.09, 0.50)   // upper thighs
    + g(0.15, 0.10, 0.20)   // calves
    + g(0.74, 0.08, 0.30);  // upper chest/shoulders
}

/**
 * Get sensitivity at height y, using SMPL constraints if available.
 * SMPL sensitivity is scaled to match the same units as fallback.
 */
function getSensitivity(y: number, constraints: SMPLConstraints | null): number {
  if (!constraints) return fallbackSensitivity(y);

  // SMPL sensitivity is fractional change per unit beta.
  // Scale it so the overall deformation magnitude matches Phase 1.
  // The fallback peaks at ~1.06, SMPL peaks at ~0.03-0.05.
  // We multiply SMPL values to bring them into the same range.
  const smplSens = smplSensitivity(constraints, y);
  const scaled = smplSens * 20; // Scale up to match Phase 1 sensitivity units

  // Blend with a base floor so the entire body responds
  return Math.max(0.15, scaled);
}

/**
 * Get scale limits at height y, using SMPL constraints if available.
 */
function getScaleLimits(y: number, constraints: SMPLConstraints | null): [number, number] {
  if (!constraints) return [MIN_SCALE, MAX_SCALE];
  return smplScaleLimits(constraints, y);
}

/**
 * Gaussian-blended segment override at normalized Y height.
 */
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

  return totalWeight > 0 ? blendedValue / totalWeight : 0;
}

/**
 * Directional scaling: front expands slightly more than back.
 */
function directionalScale(dx: number, dz: number, scale: number): number {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.0001) return scale;
  const zNorm = dz / dist;
  const mult = zNorm >= 0 ? 1.0 + 0.08 * zNorm : 1.0 + 0.06 * zNorm;
  return scale * mult;
}

/**
 * Laplacian smoothing pass.
 */
function laplacianSmooth(
  positions: Float32Array,
  originalPositions: Float32Array,
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
        const ni = neighbors[j];
        avgX += temp[ni * 3];
        avgZ += temp[ni * 3 + 2];
      }
      avgX /= neighbors.length;
      avgZ /= neighbors.length;

      positions[i * 3] = temp[i * 3] + lambda * (avgX - temp[i * 3]);
      positions[i * 3 + 1] = temp[i * 3 + 1]; // preserve Y
      positions[i * 3 + 2] = temp[i * 3 + 2] + lambda * (avgZ - temp[i * 3 + 2]);
    }
  }
}

/**
 * Main deformation function.
 *
 * When SMPL constraints are provided, uses SMPL-learned sensitivity curves
 * and per-height scale limits instead of hand-tuned values. This ensures
 * the user's scan mesh deforms anatomically — SMPL provides the "rules",
 * the scan mesh is what's actually rendered.
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[],
  constraints?: SMPLConstraints | null
): void {
  // Compute center axis
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  const vertexCount = originalPositions.length / 3;

  // Compute arm centers (left and right separately)
  let lArmX = 0, lArmZ = 0, lCount = 0;
  let rArmX = 0, rArmZ = 0, rCount = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lArmX += ox; lArmZ += originalPositions[i * 3 + 2]; lCount++; }
    else { rArmX += ox; rArmZ += originalPositions[i * 3 + 2]; rCount++; }
  }
  const leftCX = lCount > 0 ? lArmX / lCount : axisCX - 0.12;
  const leftCZ = lCount > 0 ? lArmZ / lCount : axisCZ;
  const rightCX = rCount > 0 ? rArmX / rCount : axisCX + 0.12;
  const rightCZ = rCount > 0 ? rArmZ / rCount : axisCZ;

  // Arms are influenced by BOTH the arms override AND the shoulders override
  const armOverrideCombined = overrides.arms + overrides.shoulders * 0.5;
  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (armOverrideCombined / 100);
  const [armMin, armMax] = getScaleLimits(0.65, constraints ?? null);
  const armScaleBase = Math.max(armMin, Math.min(armMax, armGlobal * armRegional));

  // Phase 1: Radial displacement with SMPL-informed scaling
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

    let cx: number, cz: number, combinedScale: number;

    if (binding.segmentId === 'arms') {
      const armCX = ox < axisCX ? leftCX : rightCX;
      const armCZ = ox < axisCX ? leftCZ : rightCZ;

      const junctionBlend = Math.min(1, Math.max(0, (oy - 0.58) / 0.10));
      cx = armCX + junctionBlend * (axisCX - armCX);
      cz = armCZ + junctionBlend * (axisCZ - armCZ);

      const torsoSens = getSensitivity(oy, constraints ?? null);
      const torsoGlobalScale = 1 + (deltaBodyFat * torsoSens / 100);
      const torsoOverride = blendedSegmentOverride(oy, overrides);
      const torsoRegionalScale = 1 + torsoOverride / 100;
      const [tMin, tMax] = getScaleLimits(oy, constraints ?? null);
      const torsoScale = Math.max(tMin, Math.min(tMax, torsoGlobalScale * torsoRegionalScale));

      combinedScale = armScaleBase + junctionBlend * (torsoScale - armScaleBase);
    } else {
      cx = axisCX;
      cz = axisCZ;

      const sens = getSensitivity(oy, constraints ?? null);
      const globalScale = 1 + (deltaBodyFat * sens / 100);
      const overrideValue = blendedSegmentOverride(oy, overrides);
      const regionalScale = 1 + overrideValue / 100;
      combinedScale = globalScale * regionalScale;

      // Clamp to SMPL-derived limits (or fallback)
      const [sMin, sMax] = getScaleLimits(oy, constraints ?? null);
      combinedScale = Math.max(sMin, Math.min(sMax, combinedScale));
    }

    const dx = ox - cx;
    const dz = oz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.0001) {
      const finalScale = directionalScale(dx, dz, combinedScale);
      positions[i * 3] = cx + dx * finalScale;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = cz + dz * finalScale;
    } else {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
    }
  }

  // Phase 2: Laplacian smoothing
  if (adjacency && adjacency.length === vertexCount) {
    const deformMagnitude = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 4;
    const iterations = deformMagnitude > 15 ? 6 : deformMagnitude > 8 ? 5 : deformMagnitude > 3 ? 4 : 3;
    const lambda = 0.50;
    laplacianSmooth(positions, originalPositions, adjacency, iterations, lambda);
  }
}
