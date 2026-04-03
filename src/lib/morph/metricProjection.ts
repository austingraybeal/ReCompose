import type { BodyComposition, SegmentOverrides, ProjectedMetrics, LandmarkRing } from '@/types/scan';
import { RING_SENSITIVITY } from './sensitivityModel';

/**
 * Project body metrics at a given body fat percentage.
 *
 * Estimates what weight, BMI, waist circumference, hip circumference,
 * and waist-to-hip ratio would be based on the current slider positions.
 *
 * @param bodyComp - Original body composition data from the scan
 * @param originalBF - Original body fat percentage
 * @param currentBF - Current global slider value
 * @param overrides - Per-segment override values
 * @param rings - Landmark rings for circumference lookup
 * @param measures - Original measurements (circumferences)
 * @returns Projected metrics
 */
export function projectMetrics(
  bodyComp: BodyComposition,
  originalBF: number,
  currentBF: number,
  overrides: SegmentOverrides,
  rings: LandmarkRing[],
  measures: Record<string, number>
): ProjectedMetrics {
  const deltaBF = currentBF - originalBF;

  // Weight projection — fat mass changes proportionally to BF% delta.
  // A 32% BF increase (23→55%) on a 235lb person should add ~75-100 lbs.
  // Formula: new weight = originalWeight * (1 - originalBF/100 + currentBF/100) / (1)
  // This assumes lean mass stays constant and only fat mass changes.
  const originalFatFraction = originalBF / 100;
  const leanMass = bodyComp.weight * (1 - originalFatFraction);
  const newFatFraction = currentBF / 100;
  // New total weight = leanMass / (1 - newFatFraction), clamped to avoid division issues
  const clampedNewFatFraction = Math.min(newFatFraction, 0.65);
  const baseWeight = leanMass / (1 - clampedNewFatFraction);

  // Regional overrides add additional weight shifts
  const regionalWeightDelta =
    (overrides.waist * 0.004 +
     overrides.hips * 0.003 +
     overrides.torso * 0.003 +
     overrides.legs * 0.002 +
     overrides.shoulders * 0.001 +
     overrides.arms * 0.001) * bodyComp.weight / 100;
  const estimatedWeight = Math.max(0, baseWeight + regionalWeightDelta);

  // Height in meters (estimate from scan or body comp)
  const heightM = bodyComp.weight > 0 && bodyComp.bmi > 0
    ? Math.sqrt(bodyComp.weight / bodyComp.bmi)
    : 1.7; // fallback

  const estimatedBMI = heightM > 0
    ? estimatedWeight / (heightM * heightM)
    : bodyComp.bmi;

  // Waist circumference projection
  const waistSensitivity = RING_SENSITIVITY['Waist'] ?? 1.5;
  const waistGlobalScale = 1 + (deltaBF * waistSensitivity / 100);
  const waistRegionalScale = 1 + (overrides.waist / 100);
  const originalWaist = measures['WaistCircumference'] ?? measures['Waist'] ?? bodyComp['Waist'] ?? 80;
  const estimatedWaist = originalWaist * waistGlobalScale * waistRegionalScale;

  // Hip circumference projection
  const hipSensitivity = RING_SENSITIVITY['Hip'] ?? 1.05;
  const hipGlobalScale = 1 + (deltaBF * hipSensitivity / 100);
  const hipRegionalScale = 1 + (overrides.hips / 100);
  const originalHip = measures['HipCircumference'] ?? measures['Hip'] ?? bodyComp['Hip'] ?? 95;
  const estimatedHip = originalHip * hipGlobalScale * hipRegionalScale;

  // WHR
  const estimatedWHR = estimatedHip > 0 ? estimatedWaist / estimatedHip : 0;

  return {
    weight: Math.round(estimatedWeight * 10) / 10,
    bmi: Math.round(estimatedBMI * 10) / 10,
    waistCirc: Math.round(estimatedWaist * 10) / 10,
    hipCirc: Math.round(estimatedHip * 10) / 10,
    whr: Math.round(estimatedWHR * 100) / 100,
  };
}
