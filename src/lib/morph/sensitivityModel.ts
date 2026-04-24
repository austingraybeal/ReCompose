/**
 * Sex-specific radial sensitivity coefficients for body-fat morphing.
 *
 * All values are expressed as "% radial change per +1% body fat".
 * Because C = 2πr, these equal "% circumference change per +1% BF".
 *
 * Sex differences reflect android (male) vs gynoid (female) fat distribution
 * patterns in the published literature (Heymsfield, Bosy-Westphal, Ross/Janssen,
 * NHANES). Males preferentially store fat at waist/stomach/abdomen; females
 * preferentially store fat at hips/seat/thighs/bust.
 *
 * The internal "neutral" key is the project's legacy name for the
 * sex-independent / unisex table; {@link Sex} equals {@link BodyGender}.
 *
 * Includes the Phase-1.5 arm rings (`ElbowLeftArm`, `ElbowRightArm`,
 * `WristLeftArm`, `WristRightArm`), which are built from the per-side elbow
 * and wrist cardinal landmarks — see landmarkGrouper.ts.
 */

import type { SegmentId } from '@/types/scan';
import type { BodyGender } from '@/lib/stores/genderStore';
import {
  SEGMENT_MEAN_SENSITIVITY_UNISEX,
  SEGMENT_MEAN_SENSITIVITY_FEMALE,
  SEGMENT_MEAN_SENSITIVITY_MALE,
} from '@/lib/constants/segmentDefs';

export type Sex = BodyGender;

/**
 * Global visual gain applied to all ring and arm sensitivity lookups.
 * 1.0 = literature-calibrated baseline. Raise to make the mesh (and the
 * matching metrics panel) respond more aggressively per 1% BF change;
 * lower to soften. Acts as a pure multiplier so every sex-specific ratio
 * is preserved.
 */
const SENSITIVITY_GAIN = 1.40;

type RingSensitivityTable = Readonly<Record<string, number>>;

const RING_SENSITIVITY_NEUTRAL: RingSensitivityTable = Object.freeze({
  HeadCircum: 0.00,

  Collar: 0.10,
  OverArm: 0.40,

  Bust: 0.55,
  BustWithDrop: 0.55,
  UnderBust: 0.65,

  Waist: 1.50,
  WaistAt50: 1.50,
  StomachFP: 1.60,
  StomachMax: 1.60,
  Abdomen: 1.40,

  Seat: 1.10,
  Hip: 1.05,
  HipWidest: 1.00,

  // Arm joints — skeletal, minimal adipose. Matters for boundary interpolation.
  ElbowLeftArm: 0.10,
  ElbowRightArm: 0.10,
  WristLeftArm: 0.04,
  WristRightArm: 0.04,

  UpperLeftThigh: 0.80,
  UpperRightThigh: 0.80,
  MidLeftThigh: 0.50,
  MidRightThigh: 0.50,
  ActualMidLeftThigh: 0.50,
  ActualMidRightThigh: 0.50,
  KneeLeftLeg: 0.15,
  KneeRightLeg: 0.15,
  ActualKneeLeftLeg: 0.15,
  ActualKneeRightLeg: 0.15,

  UnderKneeLeftLeg: 0.12,
  UnderKneeRightLeg: 0.12,
  CalfLeftLeg: 0.20,
  CalfRightLeg: 0.20,
  AnkleLeftLeg: 0.05,
  AnkleRightLeg: 0.05,
  ActualAnkleLeftLeg: 0.05,
  ActualAnkleRightLeg: 0.05,
});

const RING_SENSITIVITY_FEMALE: RingSensitivityTable = Object.freeze({
  HeadCircum: 0.00,

  Collar: 0.08,
  OverArm: 0.34,

  Bust: 0.72,
  BustWithDrop: 0.72,
  UnderBust: 0.59,

  Waist: 1.35,
  WaistAt50: 1.35,
  StomachFP: 1.44,
  StomachMax: 1.44,
  Abdomen: 1.26,

  Seat: 1.38,
  Hip: 1.31,
  HipWidest: 1.25,

  ElbowLeftArm: 0.10,
  ElbowRightArm: 0.10,
  WristLeftArm: 0.04,
  WristRightArm: 0.04,

  UpperLeftThigh: 1.00,
  UpperRightThigh: 1.00,
  MidLeftThigh: 0.60,
  MidRightThigh: 0.60,
  ActualMidLeftThigh: 0.60,
  ActualMidRightThigh: 0.60,
  KneeLeftLeg: 0.15,
  KneeRightLeg: 0.15,
  ActualKneeLeftLeg: 0.15,
  ActualKneeRightLeg: 0.15,

  UnderKneeLeftLeg: 0.13,
  UnderKneeRightLeg: 0.13,
  CalfLeftLeg: 0.22,
  CalfRightLeg: 0.22,
  AnkleLeftLeg: 0.06,
  AnkleRightLeg: 0.06,
  ActualAnkleLeftLeg: 0.06,
  ActualAnkleRightLeg: 0.06,
});

const RING_SENSITIVITY_MALE: RingSensitivityTable = Object.freeze({
  HeadCircum: 0.00,

  Collar: 0.11,
  OverArm: 0.46,

  Bust: 0.39,
  BustWithDrop: 0.39,
  UnderBust: 0.62,

  Waist: 1.73,
  WaistAt50: 1.73,
  StomachFP: 1.92,
  StomachMax: 1.92,
  Abdomen: 1.61,

  Seat: 0.88,
  Hip: 0.84,
  HipWidest: 0.80,

  ElbowLeftArm: 0.11,
  ElbowRightArm: 0.11,
  WristLeftArm: 0.05,
  WristRightArm: 0.05,

  UpperLeftThigh: 0.68,
  UpperRightThigh: 0.68,
  MidLeftThigh: 0.40,
  MidRightThigh: 0.40,
  ActualMidLeftThigh: 0.40,
  ActualMidRightThigh: 0.40,
  KneeLeftLeg: 0.14,
  KneeRightLeg: 0.14,
  ActualKneeLeftLeg: 0.14,
  ActualKneeRightLeg: 0.14,

  UnderKneeLeftLeg: 0.11,
  UnderKneeRightLeg: 0.11,
  CalfLeftLeg: 0.18,
  CalfRightLeg: 0.18,
  AnkleLeftLeg: 0.04,
  AnkleRightLeg: 0.04,
  ActualAnkleLeftLeg: 0.04,
  ActualAnkleRightLeg: 0.04,
});

const RING_TABLES: Readonly<Record<Sex, RingSensitivityTable>> = Object.freeze({
  neutral: RING_SENSITIVITY_NEUTRAL,
  female: RING_SENSITIVITY_FEMALE,
  male: RING_SENSITIVITY_MALE,
});

/**
 * Arm sub-segment vertex-level sensitivities.
 * Applied flat within each sub-segment (overrides ring-interpolated sensitivity
 * for arm vertices, since arms are classified geometrically and ring
 * interpolation between elbow and wrist would under-predict biceps/forearm
 * adipose).
 */
const ARM_SENSITIVITY_TABLE: Readonly<
  Record<Sex, { upper_arm: number; forearm: number }>
> = Object.freeze({
  neutral: Object.freeze({ upper_arm: 0.35, forearm: 0.15 }),
  female: Object.freeze({ upper_arm: 0.32, forearm: 0.14 }),
  male: Object.freeze({ upper_arm: 0.39, forearm: 0.16 }),
});

/** Look up radial sensitivity for a ring name given current sex. */
export function getRingSensitivity(ringName: string, sex: Sex): number {
  return (RING_TABLES[sex][ringName] ?? 0) * SENSITIVITY_GAIN;
}

/** Look up sensitivity for an arm sub-segment (upper_arm or forearm). */
export function getArmSensitivity(
  subSegment: 'upper_arm' | 'forearm',
  sex: Sex,
): number {
  return ARM_SENSITIVITY_TABLE[sex][subSegment] * SENSITIVITY_GAIN;
}

/**
 * Segment-level mean sensitivity. Used by the proportional/linked slider mode
 * to derive an implied global-BF delta from a single-segment change.
 */
export function getSegmentMeanSensitivity(segment: SegmentId, sex: Sex): number {
  const tables = {
    neutral: SEGMENT_MEAN_SENSITIVITY_UNISEX,
    female: SEGMENT_MEAN_SENSITIVITY_FEMALE,
    male: SEGMENT_MEAN_SENSITIVITY_MALE,
  } as const;
  return tables[sex][segment] * SENSITIVITY_GAIN;
}

// ─── Backwards-compatible exports ──────────────────────────────────────────
// Keep the legacy non-sex-aware symbols so older call sites keep compiling
// until they migrate to getRingSensitivity / getArmSensitivity.

/** @deprecated Use {@link getRingSensitivity}(name, sex) instead. */
export const RING_SENSITIVITY: Record<string, number> = { ...RING_SENSITIVITY_NEUTRAL };

/** @deprecated Use {@link getArmSensitivity}(subSegment, sex) instead. */
export const ARM_SENSITIVITY = ARM_SENSITIVITY_TABLE.neutral.upper_arm;
