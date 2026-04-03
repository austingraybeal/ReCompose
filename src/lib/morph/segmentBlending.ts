import type { SegmentId, SegmentOverrides, LandmarkRing } from '@/types/scan';
import { RING_SENSITIVITY, ARM_SENSITIVITY } from './sensitivityModel';
import { cubicInterpolate } from './ringInterpolation';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/**
 * Compute the combined scale factor for a ring given global and regional inputs.
 *
 * @param ringName - Name of the landmark ring
 * @param segmentId - Which segment this ring belongs to
 * @param deltaBodyFat - Global BF delta (currentBF - originalBF)
 * @param segmentOverrides - Per-segment override values (-50 to +50)
 * @returns Combined scale factor
 */
export function computeRingScale(
  ringName: string,
  segmentId: SegmentId,
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides
): number {
  const sensitivity = RING_SENSITIVITY[ringName] ?? 0;
  const globalScale = 1 + (deltaBodyFat * sensitivity / 100);
  const regionalScale = 1 + (segmentOverrides[segmentId] / 100);
  return globalScale * regionalScale;
}

/**
 * Compute the scale factor for an arm vertex.
 *
 * @param deltaBodyFat - Global BF delta
 * @param segmentOverrides - Per-segment override values
 * @returns Combined scale factor for arm vertices
 */
export function computeArmScale(
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides
): number {
  const globalScale = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const regionalScale = 1 + (segmentOverrides.arms / 100);
  return globalScale * regionalScale;
}

/**
 * Blend scale factors between two segments in a transition zone.
 *
 * @param primaryScale - Scale from the primary segment
 * @param blendSegmentId - ID of the adjacent segment to blend toward
 * @param blendWeight - How much to blend (0 = fully primary, 1 = fully blend)
 * @param deltaBodyFat - Global BF delta
 * @param segmentOverrides - Per-segment override values
 * @param rings - Ring data for looking up the blend segment's scale
 * @returns Blended scale factor
 */
export function blendSegmentScales(
  primaryScale: number,
  blendSegmentId: string | null,
  blendWeight: number,
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides,
  rings: LandmarkRing[]
): number {
  if (!blendSegmentId || blendWeight === 0) return primaryScale;

  // Compute a representative scale for the blend segment
  // Use the average sensitivity of rings belonging to that segment
  const blendRings = rings.filter(r => {
    const seg = SEGMENTS.find(s => s.id === blendSegmentId);
    return seg?.rings.includes(r.name);
  });

  let blendScale: number;
  if (blendRings.length > 0) {
    const avgSensitivity = blendRings.reduce(
      (s: number, r: LandmarkRing) => s + (RING_SENSITIVITY[r.name] ?? 0),
      0
    ) / blendRings.length;
    const globalScale = 1 + (deltaBodyFat * avgSensitivity / 100);
    const regionalScale = 1 + (segmentOverrides[blendSegmentId as SegmentId] / 100);
    blendScale = globalScale * regionalScale;
  } else {
    blendScale = primaryScale;
  }

  return cubicInterpolate(blendWeight, primaryScale, blendScale);
}
