import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import { ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/** Minimum and maximum scale factors to keep the body humanoid */
const MIN_SCALE = 0.65;
const MAX_SCALE = 1.55;

/**
 * Smooth sensitivity profile. Returns how much a region changes per 1% BF.
 * Uses overlapping Gaussians with a base floor so the entire body responds.
 * Increased peaks for more dramatic, realistic deformation at high BF%.
 */
function sensitivity(y: number): number {
  const BASE = 0.18;

  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));

  return BASE
    + g(0.54, 0.09, 0.88)   // waist/belly (wider + stronger)
    + g(0.43, 0.08, 0.65)   // hips (wider + stronger)
    + g(0.64, 0.07, 0.50)   // bust/chest
    + g(0.32, 0.09, 0.50)   // upper thighs (wider)
    + g(0.15, 0.10, 0.20)   // calves
    + g(0.74, 0.08, 0.30);  // upper chest/shoulders
}

/**
 * Gaussian-blended segment override at normalized Y height.
 * Shoulders override now blends into torso region (they share influence).
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
 * Laplacian smoothing pass. Moves each vertex toward the average of its
 * mesh neighbors, preserving surface continuity and eliminating artifacts.
 * Smooths X, Y, and Z to better handle hip/leg boundary tears.
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

      // Move toward average (X and Z, preserve Y to maintain height)
      positions[i * 3] = temp[i * 3] + lambda * (avgX - temp[i * 3]);
      positions[i * 3 + 1] = temp[i * 3 + 1]; // preserve Y
      positions[i * 3 + 2] = temp[i * 3 + 2] + lambda * (avgZ - temp[i * 3 + 2]);
    }
  }
}

/**
 * Main deformation function with physiological constraints.
 *
 * Key changes from earlier versions:
 * - Higher scale range (0.65–1.55) for realistic high-BF deformation
 * - Stronger sensitivity peaks so 55% BF looks dramatically different
 * - Shoulders override automatically applied to arms (they scale together)
 * - Arms scale volumetrically (both lateral and front-to-back)
 * - Much wider Gaussian blending at segment boundaries to prevent holes
 * - Aggressive Laplacian smoothing to eliminate tears
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
  // (increasing shoulders should make the whole upper body including arms larger)
  const armOverrideCombined = overrides.arms + overrides.shoulders * 0.5;
  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (armOverrideCombined / 100);
  const armScaleBase = Math.max(MIN_SCALE, Math.min(MAX_SCALE, armGlobal * armRegional));

  // Phase 1: Radial displacement with clamped scaling
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
      // Arms: scale volumetrically from arm center (both X and Z expansion)
      if (ox < axisCX) { cx = leftCX; cz = leftCZ; }
      else { cx = rightCX; cz = rightCZ; }
      combinedScale = armScaleBase;
    } else {
      cx = axisCX;
      cz = axisCZ;

      const sens = sensitivity(oy);
      const globalScale = 1 + (deltaBodyFat * sens / 100);
      const overrideValue = blendedSegmentOverride(oy, overrides);
      const regionalScale = 1 + overrideValue / 100;
      combinedScale = globalScale * regionalScale;

      // Clamp to physiological range
      combinedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, combinedScale));
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

  // Phase 2: Laplacian smoothing to eliminate artifacts and tears
  if (adjacency && adjacency.length === vertexCount) {
    const deformMagnitude = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 4;
    // More aggressive smoothing: 3-6 iterations based on deformation
    const iterations = deformMagnitude > 15 ? 6 : deformMagnitude > 8 ? 5 : deformMagnitude > 3 ? 4 : 3;
    const lambda = 0.50;
    laplacianSmooth(positions, originalPositions, adjacency, iterations, lambda);
  }
}
