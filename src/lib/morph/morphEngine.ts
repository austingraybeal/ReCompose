import type { LandmarkRing, VertexBinding, SegmentOverrides, SegmentId } from '@/types/scan';
import { RING_SENSITIVITY, ARM_SENSITIVITY } from './sensitivityModel';
import { cubicInterpolate, angularScale } from './ringInterpolation';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/**
 * Compute the combined scale for a given ring.
 *
 * @param ringName - Ring identifier
 * @param segmentId - Owning segment
 * @param deltaBodyFat - Current BF minus original BF
 * @param overrides - Per-segment slider values
 * @returns Scale factor (1.0 = no change)
 */
function ringScale(
  ringName: string,
  segmentId: SegmentId,
  deltaBodyFat: number,
  overrides: SegmentOverrides
): number {
  const sensitivity = RING_SENSITIVITY[ringName] ?? 0;
  const global = 1 + (deltaBodyFat * sensitivity / 100);
  const regional = 1 + (overrides[segmentId] / 100);
  return global * regional;
}

/**
 * Get the segment that owns a ring by checking segment definitions.
 */
function ringOwnerSegment(ring: LandmarkRing): SegmentId {
  for (const seg of SEGMENTS) {
    if (seg.rings.includes(ring.name)) return seg.id;
  }
  // Fallback by normalized height (0-1 range, assuming ~1800mm body)
  if (ring.height >= 0.66) return 'shoulders';
  if (ring.height >= 0.59) return 'torso';
  if (ring.height >= 0.48) return 'waist';
  if (ring.height >= 0.39) return 'hips';
  return 'legs';
}

/**
 * Main deformation function. Modifies vertex positions in-place.
 *
 * For each vertex:
 *  1. Look up its bounding rings and segment
 *  2. Compute global + regional scale for those rings
 *  3. Interpolate between rings
 *  4. Apply angular scaling (front bias)
 *  5. Displace radially from ring center
 *
 * @param positions - The Float32Array of current vertex positions to modify
 * @param originalPositions - The original (undeformed) vertex positions
 * @param bindings - Per-vertex classification data
 * @param rings - Landmark rings sorted by height
 * @param deltaBodyFat - Global slider delta (currentBF - originalBF)
 * @param overrides - Per-segment override values (-50 to +50)
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

  // Precompute per-ring scale factors
  const ringScales = rings.map(ring => {
    const segId = ringOwnerSegment(ring);
    return ringScale(ring.name, segId, deltaBodyFat, overrides);
  });

  // Arm scale
  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (overrides.arms / 100);
  const armScaleFactor = armGlobal * armRegional;

  const vertexCount = originalPositions.length / 3;

  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    if (!binding) {
      // No binding: copy original
      positions[i * 3] = originalPositions[i * 3];
      positions[i * 3 + 1] = originalPositions[i * 3 + 1];
      positions[i * 3 + 2] = originalPositions[i * 3 + 2];
      continue;
    }

    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    let combinedScale: number;

    if (binding.segmentId === 'arms') {
      combinedScale = armScaleFactor;
    } else {
      // Interpolate between bounding rings
      const scaleAbove = ringScales[binding.ringAboveIdx] ?? 1;
      const scaleBelow = ringScales[binding.ringBelowIdx] ?? 1;
      combinedScale = cubicInterpolate(binding.ringWeight, scaleBelow, scaleAbove);

      // Blend with adjacent segment in transition zone
      if (binding.blendWeight > 0 && binding.blendSegmentId) {
        const blendSeg = binding.blendSegmentId as SegmentId;
        // Compute representative scale for blend segment
        const blendIdx = binding.ringWeight >= 0.5 ? binding.ringAboveIdx : binding.ringBelowIdx;
        const blendRingScale = ringScales[blendIdx] ?? 1;
        // Recompute with the blend segment's override
        const blendRegional = 1 + (overrides[blendSeg] / 100);
        const adjustedBlendScale = blendRingScale / (1 + (overrides[binding.segmentId as SegmentId] / 100)) * blendRegional;
        combinedScale = cubicInterpolate(binding.blendWeight, combinedScale, adjustedBlendScale);
      }
    }

    // Apply angular scaling
    const directionalScale = angularScale(binding.radialAngle, combinedScale);

    // Compute ring center for this vertex (interpolate between bounding ring centers)
    const ringAbove = rings[binding.ringAboveIdx];
    const ringBelow = rings[binding.ringBelowIdx];
    const cx = cubicInterpolate(binding.ringWeight, ringBelow?.center.x ?? 0, ringAbove?.center.x ?? 0);
    const cz = cubicInterpolate(binding.ringWeight, ringBelow?.center.z ?? 0, ringAbove?.center.z ?? 0);

    // Radial displacement from ring center
    const dx = ox - cx;
    const dz = oz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.001) {
      // Displace radially
      const newDist = dist * directionalScale;
      const ratio = newDist / dist;
      positions[i * 3] = cx + dx * ratio;
      positions[i * 3 + 1] = oy; // Y unchanged
      positions[i * 3 + 2] = cz + dz * ratio;
    } else {
      // Vertex is on the center axis — no radial displacement
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
    }
  }
}
