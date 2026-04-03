import type { LandmarkRing, VertexBinding, SegmentOverrides, SegmentId } from '@/types/scan';
import { RING_SENSITIVITY, ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/**
 * Build a continuous sensitivity curve from discrete ring samples.
 * Returns a function: normalizedY → sensitivity value.
 *
 * Uses linear interpolation between ring heights for smooth results.
 * Rings must be sorted by height (descending).
 */
function buildSensitivityCurve(rings: LandmarkRing[]): (y: number) => number {
  if (rings.length === 0) return () => 0;

  // Build sorted (ascending) height→sensitivity pairs
  const samples: { y: number; s: number }[] = [];
  for (const ring of rings) {
    const s = RING_SENSITIVITY[ring.name] ?? 0;
    samples.push({ y: ring.height, s });
  }
  samples.sort((a, b) => a.y - b.y);

  return (y: number): number => {
    if (samples.length === 0) return 0;
    if (y <= samples[0].y) return samples[0].s;
    if (y >= samples[samples.length - 1].y) return samples[samples.length - 1].s;

    // Find bounding samples
    for (let i = 0; i < samples.length - 1; i++) {
      if (y >= samples[i].y && y <= samples[i + 1].y) {
        const range = samples[i + 1].y - samples[i].y;
        const t = range > 0 ? (y - samples[i].y) / range : 0;
        // Smooth step interpolation
        const st = t * t * (3 - 2 * t);
        return samples[i].s + (samples[i + 1].s - samples[i].s) * st;
      }
    }
    return 0;
  };
}

/**
 * Compute per-segment Gaussian influence at a given normalized Y height.
 * Returns an object mapping segment ID to its influence weight (0-1).
 * Segment with the strongest influence gets the most override effect.
 */
function segmentInfluence(y: number): Record<SegmentId, number> {
  const result: Record<string, number> = {};
  for (const seg of SEGMENTS) {
    if (seg.isLateral) continue;
    const dist = y - seg.yCenter;
    const weight = Math.exp(-(dist * dist) / (2 * seg.sigma * seg.sigma));
    result[seg.id] = weight;
  }
  return result as Record<SegmentId, number>;
}

/**
 * Compute the angular scaling multiplier based on radial direction.
 * Front (anterior, +Z) gets 1.15x, back (posterior, -Z) gets 0.90x.
 *
 * @param dx - X displacement from center
 * @param dz - Z displacement from center
 * @param scale - Base scale factor
 */
function directionalScale(dx: number, dz: number, scale: number): number {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.0001) return scale;

  // Z component of normalized direction: positive = front, negative = back
  const zNorm = dz / dist;

  let multiplier: number;
  if (zNorm >= 0) {
    multiplier = 1.0 + 0.15 * zNorm; // up to 1.15 at pure front
  } else {
    multiplier = 1.0 + 0.10 * zNorm; // down to 0.90 at pure back
  }

  return scale * multiplier;
}

/**
 * Main deformation function. Uses continuous height-based scaling with
 * Gaussian segment influence — no discrete rings or banding.
 *
 * For each vertex:
 *  1. Sample the continuous sensitivity curve at vertex Y height
 *  2. Compute global scale from sensitivity * deltaBodyFat
 *  3. Blend ALL segment overrides using Gaussian influence at vertex height
 *  4. Apply directional scaling (front bias)
 *  5. Displace radially from center axis
 *
 * @param positions - Float32Array to modify
 * @param originalPositions - Undeformed vertex positions
 * @param bindings - Per-vertex classification data
 * @param rings - Landmark rings in normalized space
 * @param deltaBodyFat - Current BF minus original BF
 * @param overrides - Per-segment slider values (-50 to +50)
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides
): void {
  if (rings.length === 0) return;

  // Build continuous sensitivity curve
  const getSensitivity = buildSensitivityCurve(rings);

  // Compute center axis (average of ring centers X, Z)
  let axisCX = 0, axisCZ = 0;
  for (const ring of rings) {
    axisCX += ring.center.x;
    axisCZ += ring.center.z;
  }
  axisCX /= rings.length;
  axisCZ /= rings.length;

  // Precompute arm centers
  const vertexCount = originalPositions.length / 3;
  let lArmX = 0, lArmZ = 0, lCount = 0;
  let rArmX = 0, rArmZ = 0, rCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) {
      lArmX += ox; lArmZ += originalPositions[i * 3 + 2]; lCount++;
    } else {
      rArmX += ox; rArmZ += originalPositions[i * 3 + 2]; rCount++;
    }
  }
  const leftCX = lCount > 0 ? lArmX / lCount : axisCX - 0.12;
  const leftCZ = lCount > 0 ? lArmZ / lCount : axisCZ;
  const rightCX = rCount > 0 ? rArmX / rCount : axisCX + 0.12;
  const rightCZ = rCount > 0 ? rArmZ / rCount : axisCZ;

  // Arm global scale
  const armGlobalScale = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegionalScale = 1 + (overrides.arms / 100);
  const armScale = armGlobalScale * armRegionalScale;

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
      // Arms: scale from local arm center axis
      if (ox < axisCX) { cx = leftCX; cz = leftCZ; }
      else { cx = rightCX; cz = rightCZ; }
      combinedScale = armScale;
    } else {
      // Body: continuous height-based scaling
      cx = axisCX;
      cz = axisCZ;

      // 1. Global scale from sensitivity curve
      const sensitivity = getSensitivity(oy);
      const globalScale = 1 + (deltaBodyFat * sensitivity / 100);

      // 2. Regional overrides with Gaussian influence blending
      // Each segment contributes proportionally to its Gaussian weight
      const influence = segmentInfluence(oy);
      let totalWeight = 0;
      let blendedOverride = 0;

      for (const seg of SEGMENTS) {
        if (seg.isLateral) continue;
        const w = influence[seg.id] ?? 0;
        if (w > 0.001) {
          blendedOverride += overrides[seg.id] * w;
          totalWeight += w;
        }
      }

      const regionalScale = totalWeight > 0
        ? 1 + (blendedOverride / totalWeight) / 100
        : 1;

      combinedScale = globalScale * regionalScale;
    }

    // Radial displacement from center
    const dx = ox - cx;
    const dz = oz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.0001) {
      const finalScale = directionalScale(dx, dz, combinedScale);
      const ratio = finalScale;
      positions[i * 3] = cx + dx * ratio;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = cz + dz * ratio;
    } else {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
    }
  }
}
