import type { LandmarkRing, VertexBinding, SegmentOverrides, SegmentId } from '@/types/scan';
import { ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/** Minimum and maximum scale factors to keep the body humanoid */
const MIN_SCALE = 0.80;
const MAX_SCALE = 1.25;

/**
 * Smooth sensitivity profile. Returns how much a region changes per 1% BF.
 * Uses overlapping Gaussians with a base floor so the entire body responds.
 */
function sensitivity(y: number): number {
  const BASE = 0.12;

  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));

  return BASE
    + g(0.54, 0.07, 0.65)   // waist/belly
    + g(0.43, 0.05, 0.45)   // hips
    + g(0.64, 0.05, 0.35)   // bust/chest
    + g(0.32, 0.07, 0.35)   // upper thighs
    + g(0.15, 0.08, 0.12)   // calves
    + g(0.75, 0.05, 0.18);  // shoulders
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
 * Laplacian smoothing pass. Moves each vertex toward the average of its
 * mesh neighbors, preserving surface continuity and eliminating artifacts.
 *
 * @param positions - Vertex positions to smooth (modified in-place)
 * @param adjacency - Per-vertex neighbor indices
 * @param iterations - Number of smoothing passes (more = smoother)
 * @param lambda - Smoothing strength per iteration (0-1, higher = stronger)
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

      // Average neighbor positions
      let avgX = 0, avgY = 0, avgZ = 0;
      for (let j = 0; j < neighbors.length; j++) {
        const ni = neighbors[j];
        avgX += temp[ni * 3];
        avgY += temp[ni * 3 + 1];
        avgZ += temp[ni * 3 + 2];
      }
      avgX /= neighbors.length;
      avgY /= neighbors.length;
      avgZ /= neighbors.length;

      // Move toward average (only X and Z, preserve Y to maintain height)
      positions[i * 3] = temp[i * 3] + lambda * (avgX - temp[i * 3]);
      // Keep Y from the deformation (don't smooth vertically)
      positions[i * 3 + 1] = temp[i * 3 + 1];
      positions[i * 3 + 2] = temp[i * 3 + 2] + lambda * (avgZ - temp[i * 3 + 2]);
    }
  }
}

/**
 * Main deformation function with physiological constraints.
 *
 * 1. Compute scale per vertex from smooth sensitivity + clamped regional overrides
 * 2. Clamp all scales to physiologically plausible range
 * 3. Apply radial displacement
 * 4. Run Laplacian smoothing to eliminate artifacts and maintain surface continuity
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

  // Compute arm centers
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

  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (overrides.arms / 100);
  const armScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, armGlobal * armRegional));

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
      if (ox < axisCX) { cx = leftCX; cz = leftCZ; }
      else { cx = rightCX; cz = rightCZ; }
      combinedScale = armScale;
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

  // Phase 2: Laplacian smoothing to eliminate artifacts
  if (adjacency && adjacency.length === vertexCount) {
    // More smoothing for larger deformations
    const deformMagnitude = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 6;
    const iterations = deformMagnitude > 10 ? 4 : deformMagnitude > 3 ? 3 : 2;
    const lambda = 0.45;
    laplacianSmooth(positions, originalPositions, adjacency, iterations, lambda);
  }
}
