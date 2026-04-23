import type {
  BodyComposition,
  SegmentOverrides,
  ProjectedMetrics,
  LandmarkRing,
} from '@/types/scan';
import { getRingSensitivity, type Sex } from './sensitivityModel';

/**
 * Project body metrics at a given body fat percentage.
 *
 * Estimates projected weight, BMI, waist & hip circumference, and WHR based
 * on the current slider positions.
 */
export function projectMetrics(
  bodyComp: BodyComposition,
  originalBF: number,
  currentBF: number,
  overrides: SegmentOverrides,
  rings: LandmarkRing[],
  measures: Record<string, number>,
  sex: Sex = 'neutral',
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

  // Height in meters (estimated from scan/body-comp).
  const heightM =
    bodyComp.weight > 0 && bodyComp.bmi > 0
      ? Math.sqrt(bodyComp.weight / bodyComp.bmi)
      : 1.7;

  const estimatedBMI = heightM > 0 ? estimatedWeight / (heightM * heightM) : bodyComp.bmi;

  // Waist circumference projection
  const waistSensitivity = getRingSensitivity('Waist', sex);
  const waistGlobalScale = 1 + (deltaBF * waistSensitivity) / 100;
  const waistRegionalScale = 1 + overrides.waist / 100;
  const originalWaist =
    measures['WaistCircumference'] ?? measures['Waist'] ?? bodyComp['Waist'] ?? 80;
  const estimatedWaist = originalWaist * waistGlobalScale * waistRegionalScale;

  // Hip circumference projection
  const hipSensitivity = getRingSensitivity('Hip', sex);
  const hipGlobalScale = 1 + (deltaBF * hipSensitivity) / 100;
  const hipRegionalScale = 1 + overrides.hips / 100;
  const originalHip =
    measures['HipCircumference'] ?? measures['Hip'] ?? bodyComp['Hip'] ?? 95;
  const estimatedHip = originalHip * hipGlobalScale * hipRegionalScale;

  const estimatedWHR = estimatedHip > 0 ? estimatedWaist / estimatedHip : 0;

  return {
    weight: Math.round(estimatedWeight * 10) / 10,
    bmi: Math.round(estimatedBMI * 10) / 10,
    waistCirc: Math.round(estimatedWaist * 10) / 10,
    hipCirc: Math.round(estimatedHip * 10) / 10,
    whr: Math.round(estimatedWHR * 100) / 100,
  };
}
