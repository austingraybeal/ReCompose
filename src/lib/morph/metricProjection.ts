import type {
  BodyComposition,
  SegmentOverrides,
  ProjectedMetrics,
  LandmarkRing,
} from '@/types/scan';
import {
  getArmSensitivity,
  getRingSensitivity,
  getSegmentMeanSensitivity,
  type Sex,
} from './sensitivityModel';
import { SEGMENT_ORDER, SEGMENT_VOLUME_SHARE } from '@/lib/constants/segmentDefs';
import { SEGMENT_OVERRIDE_STRENGTH, MIN_SCALE, MAX_SCALE } from './morphEngine';

/**
 * No projected circumference may shrink below this fraction of its original.
 * The mesh engine clamps at MIN_SCALE=0.82; metrics get a looser floor so
 * regional overrides can still register, but can never go absurd/negative.
 */
const MIN_CIRC_FRACTION = 0.5;

/**
 * Equivalent whole-body BF delta implied by the current segment overrides.
 *
 * A global BF delta d produces a radial change of sens_s * d in segment s.
 * An override producing r_s% radial change in segment s contributes fat
 * volume proportional to r_s * V_s (V_s = the segment's volume share), so
 * the whole-body BF delta with the same total fat response is:
 *   Σ(r_s * V_s) / Σ(V_t * sens_t)
 * Bounded by construction: all sliders at ±25 imply roughly ±7 BF points.
 */
export function impliedBodyFatDelta(
  overrides: SegmentOverrides,
  sex: Sex,
  androidness?: number,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const seg of SEGMENT_ORDER) {
    const share = SEGMENT_VOLUME_SHARE[seg];
    numerator += (overrides[seg] ?? 0) * SEGMENT_OVERRIDE_STRENGTH * share;
    denominator += share * getSegmentMeanSensitivity(seg, sex, androidness);
  }
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Project one circumference through the global-BF and regional paths.
 * Clamped to the same MIN/MAX scale bounds the mesh engine applies, so the
 * panel never reports a change the avatar isn't actually showing.
 */
function projectCircumference(
  original: number,
  deltaBF: number,
  sensitivity: number,
  overrideValue: number,
): number {
  const globalScale = 1 + (deltaBF * sensitivity) / 100;
  const regionalScale = 1 + (overrideValue * SEGMENT_OVERRIDE_STRENGTH) / 100;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, globalScale * regionalScale));
  return Math.max(original * MIN_CIRC_FRACTION, original * scale);
}

/**
 * Project body metrics at a given body fat percentage.
 *
 * Estimates projected weight, BMI, and key circumferences based on the
 * current slider positions. Regional overrides use the same damping factor
 * as the mesh engine so the numbers track what the avatar shows.
 */
export function projectMetrics(
  bodyComp: BodyComposition,
  originalBF: number,
  currentBF: number,
  overrides: SegmentOverrides,
  rings: LandmarkRing[],
  measures: Record<string, number>,
  sex: Sex = 'neutral',
  androidness?: number,
): ProjectedMetrics {
  const deltaBF = currentBF - originalBF;

  // Fat-mass-only weight model: lean mass held constant, fat fraction updated.
  const originalFatFraction = originalBF / 100;
  const leanMass = bodyComp.weight * (1 - originalFatFraction);
  const newFatFraction = currentBF / 100;
  const clampedNewFatFraction = Math.min(newFatFraction, 0.65);
  const baseWeight = leanMass / (1 - clampedNewFatFraction);

  // Regional overrides add additional weight shifts.
  // Arms and legs are split; their combined weights equal the legacy 6-segment model.
  const regionalWeightDelta =
    ((overrides.waist * 0.004 +
      overrides.hips * 0.003 +
      overrides.torso * 0.003 +
      overrides.thighs * 0.0015 +
      overrides.calves * 0.0005 +
      overrides.shoulders * 0.001 +
      overrides.upper_arms * 0.0007 +
      overrides.forearms * 0.0003) *
      bodyComp.weight) /
    100;
  const estimatedWeight = Math.max(0, baseWeight + regionalWeightDelta);

  // BMI via the original weight:BMI ratio — unit-independent as long as the
  // parsed weight and BMI describe the same person (height² in the source
  // units cancels out).
  const estimatedBMI =
    bodyComp.weight > 0 && bodyComp.bmi > 0
      ? (estimatedWeight * bodyComp.bmi) / bodyComp.weight
      : bodyComp.bmi;

  // Circumference projections. Right-side measures are the default display.
  // NarrowWaist matches the scanner's own body-composition "Waist" output
  // (natural waist); WaistCircumference is the tilted contour variant.
  const originalWaist =
    measures['NarrowWaistTapeMeasure'] ?? measures['NarrowWaist'] ??
    measures['WaistCircumference'] ?? measures['Waist'] ?? bodyComp['Waist'] ?? 80;
  const estimatedWaist = projectCircumference(
    originalWaist, deltaBF, getRingSensitivity('NarrowWaist', sex, androidness), overrides.waist);

  const originalHip =
    measures['HipCircumference'] ?? measures['Hip'] ?? bodyComp['Hip'] ?? 95;
  const estimatedHip = projectCircumference(
    originalHip, deltaBF, getRingSensitivity('Hip', sex, androidness), overrides.hips);

  const originalChest = measures['ChestCircumference'] ?? 0;
  const estimatedChest = projectCircumference(
    originalChest, deltaBF, getRingSensitivity('Bust', sex, androidness), overrides.torso);

  const originalBicep =
    measures['BicepCircumferenceRight'] ?? measures['BicepCircumferenceLeft'] ?? 0;
  const estimatedBicep = projectCircumference(
    originalBicep, deltaBF, getArmSensitivity('upper_arm', sex, androidness), overrides.upper_arms);

  const originalForearm =
    measures['ForearmCircumferenceRight'] ?? measures['ForearmCircumferenceLeft'] ?? 0;
  const estimatedForearm = projectCircumference(
    originalForearm, deltaBF, getArmSensitivity('forearm', sex, androidness), overrides.forearms);

  const originalThigh =
    measures['ThighCircumferenceRight'] ?? measures['ThighCircumferenceLeft'] ?? 0;
  const estimatedThigh = projectCircumference(
    originalThigh, deltaBF, getRingSensitivity('UpperRightThigh', sex, androidness), overrides.thighs);

  const originalCalf =
    measures['CalfCircumferenceRight'] ?? measures['CalfCircumferenceLeft'] ?? 0;
  const estimatedCalf = projectCircumference(
    originalCalf, deltaBF, getRingSensitivity('CalfRightLeg', sex, androidness), overrides.calves);

  const estimatedWHR = estimatedHip > 0 ? estimatedWaist / estimatedHip : 0;

  const r1 = (v: number) => Math.round(v * 10) / 10;

  return {
    weight: r1(estimatedWeight),
    bmi: r1(estimatedBMI),
    waistCirc: r1(estimatedWaist),
    hipCirc: r1(estimatedHip),
    whr: Math.round(estimatedWHR * 100) / 100,
    chestCirc: r1(estimatedChest),
    bicepCirc: r1(estimatedBicep),
    forearmCirc: r1(estimatedForearm),
    thighCirc: r1(estimatedThigh),
    calfCirc: r1(estimatedCalf),
  };
}
