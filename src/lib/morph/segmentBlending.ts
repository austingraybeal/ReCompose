import type { SegmentId, SegmentOverrides, LandmarkRing } from '@/types/scan';
import {
  getRingSensitivity,
  getArmSensitivity,
  type Sex,
} from './sensitivityModel';
import { cubicInterpolate } from './ringInterpolation';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/**
 * Compute the combined scale factor for a ring given global and regional inputs.
 *
 * @param ringName - Name of the landmark ring
 * @param segmentId - Which segment this ring belongs to
 * @param deltaBodyFat - Global BF delta (currentBF - originalBF)
 * @param segmentOverrides - Per-segment override values (-50 to +50)
 * @param sex - Sex-specific sensitivity table to use
 * @returns Combined scale factor
 */
export function computeRingScale(
  ringName: string,
  segmentId: SegmentId,
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides,
  sex: Sex = 'neutral',
): number {
  const sensitivity = getRingSensitivity(ringName, sex);
  const globalScale = 1 + (deltaBodyFat * sensitivity) / 100;
  const regionalScale = 1 + segmentOverrides[segmentId] / 100;
  return globalScale * regionalScale;
}

/**
 * Compute the scale factor for an arm vertex.
 *
 * @param subSegment - 'upper_arm' or 'forearm'
 * @param deltaBodyFat - Global BF delta
 * @param segmentOverrides - Per-segment override values
 * @param sex - Sex-specific sensitivity table to use
 * @returns Combined scale factor for the arm sub-segment
 */
export function computeArmScale(
  subSegment: 'upper_arm' | 'forearm',
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides,
  sex: Sex = 'neutral',
): number {
  const sensitivity = getArmSensitivity(subSegment, sex);
  const globalScale = 1 + (deltaBodyFat * sensitivity) / 100;
  const segKey: SegmentId = subSegment === 'upper_arm' ? 'upper_arms' : 'forearms';
  const regionalScale = 1 + segmentOverrides[segKey] / 100;
  return globalScale * regionalScale;
}

/**
 * Blend scale factors between two segments in a transition zone.
 */
export function blendSegmentScales(
  primaryScale: number,
  blendSegmentId: SegmentId | null,
  blendWeight: number,
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides,
  rings: LandmarkRing[],
  sex: Sex = 'neutral',
): number {
  if (!blendSegmentId || blendWeight === 0) return primaryScale;

  const blendRings = rings.filter((r) => {
    const seg = SEGMENTS.find((s) => s.id === blendSegmentId);
    return seg?.rings.includes(r.name);
  });

  let blendScale: number;
  if (blendRings.length > 0) {
    const avgSensitivity =
      blendRings.reduce(
        (s: number, r: LandmarkRing) => s + getRingSensitivity(r.name, sex),
        0,
      ) / blendRings.length;
    const globalScale = 1 + (deltaBodyFat * avgSensitivity) / 100;
    const regionalScale = 1 + segmentOverrides[blendSegmentId] / 100;
    blendScale = globalScale * regionalScale;
  } else {
    blendScale = primaryScale;
  }

  return cubicInterpolate(blendWeight, primaryScale, blendScale);
}
