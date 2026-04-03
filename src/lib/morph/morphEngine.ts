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
  // Fallback by normalized height (0-1 range)
  if (ring.height >= 0.66) return 'shoulders';
  if (ring.height >= 0.59) return 'torso';
  if (ring.height >= 0.48) return 'waist';
  if (ring.height >= 0.39) return 'hips';
  return 'legs';
}

/**
 * Main deformation function. Modifies vertex positions in-place.
 *
 * Uses a center-axis approach instead of per-ring-center displacement to
 * eliminate banding artifacts. All vertices are displaced radially from a
 * smooth center axis, scaled by interpolated ring sensitivity.
 *
 * For arm vertices, displacement is computed from a local arm center axis
 * so arms scale volumetrically (thicken + lengthen) rather than just widening.
 *
 * @param positions - The Float32Array of current vertex positions to modify
 * @param originalPositions - The original (undeformed) vertex positions
 * @param bindings - Per-vertex classification data
 * @param rings - Landmark rings sorted by height (in normalized space)
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

  // Compute a smooth center axis (average of all ring centers)
  let axisCenterX = 0;
  let axisCenterZ = 0;
  for (const ring of rings) {
    axisCenterX += ring.center.x;
    axisCenterZ += ring.center.z;
  }
  axisCenterX /= rings.length;
  axisCenterZ /= rings.length;

  // Precompute per-ring scale factors
  const ringScales = rings.map(ring => {
    const segId = ringOwnerSegment(ring);
    return ringScale(ring.name, segId, deltaBodyFat, overrides);
  });

  // Arm scale
  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (overrides.arms / 100);
  const armScaleFactor = armGlobal * armRegional;

  // Precompute arm center axes (left and right) from arm vertices
  let leftArmSumX = 0, leftArmSumZ = 0, leftArmCount = 0;
  let rightArmSumX = 0, rightArmSumZ = 0, rightArmCount = 0;
  const vertexCount = originalPositions.length / 3;

  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    if (!binding || binding.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCenterX) {
      leftArmSumX += ox;
      leftArmSumZ += originalPositions[i * 3 + 2];
      leftArmCount++;
    } else {
      rightArmSumX += ox;
      rightArmSumZ += originalPositions[i * 3 + 2];
      rightArmCount++;
    }
  }

  const leftArmCX = leftArmCount > 0 ? leftArmSumX / leftArmCount : axisCenterX - 0.15;
  const leftArmCZ = leftArmCount > 0 ? leftArmSumZ / leftArmCount : axisCenterZ;
  const rightArmCX = rightArmCount > 0 ? rightArmSumX / rightArmCount : axisCenterX + 0.15;
  const rightArmCZ = rightArmCount > 0 ? rightArmSumZ / rightArmCount : axisCenterZ;

  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    if (!binding) {
      positions[i * 3] = originalPositions[i * 3];
      positions[i * 3 + 1] = originalPositions[i * 3 + 1];
      positions[i * 3 + 2] = originalPositions[i * 3 + 2];
      continue;
    }

    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    let combinedScale: number;
    let cx: number;
    let cz: number;

    if (binding.segmentId === 'arms') {
      combinedScale = armScaleFactor;
      // Use local arm center for volumetric scaling
      if (ox < axisCenterX) {
        cx = leftArmCX;
        cz = leftArmCZ;
      } else {
        cx = rightArmCX;
        cz = rightArmCZ;
      }
    } else {
      // Interpolate scale between bounding rings
      const scaleAbove = ringScales[binding.ringAboveIdx] ?? 1;
      const scaleBelow = ringScales[binding.ringBelowIdx] ?? 1;
      combinedScale = cubicInterpolate(binding.ringWeight, scaleBelow, scaleAbove);

      // Blend with adjacent segment in transition zone
      if (binding.blendWeight > 0 && binding.blendSegmentId) {
        const blendSeg = binding.blendSegmentId as SegmentId;
        const blendIdx = binding.ringWeight >= 0.5 ? binding.ringAboveIdx : binding.ringBelowIdx;
        const blendRingScale = ringScales[blendIdx] ?? 1;
        const blendRegional = 1 + (overrides[blendSeg] / 100);
        const primaryRegional = 1 + (overrides[binding.segmentId as SegmentId] / 100);
        const adjustedBlendScale = primaryRegional > 0
          ? blendRingScale / primaryRegional * blendRegional
          : blendRingScale;
        combinedScale = cubicInterpolate(binding.blendWeight, combinedScale, adjustedBlendScale);
      }

      // Use the smooth center axis for all body vertices
      cx = axisCenterX;
      cz = axisCenterZ;
    }

    // Radial displacement from center axis
    const dx = ox - cx;
    const dz = oz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.0001) {
      // Apply angular scaling (front bias)
      const directionalScale = angularScale(binding.radialAngle, combinedScale);
      const newDist = dist * directionalScale;
      const ratio = newDist / dist;
      positions[i * 3] = cx + dx * ratio;
      positions[i * 3 + 1] = oy; // Y unchanged
      positions[i * 3 + 2] = cz + dz * ratio;
    } else {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
    }
  }
}
