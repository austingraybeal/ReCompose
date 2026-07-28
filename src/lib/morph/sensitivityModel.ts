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
  Neck: 0.12,

  Collar: 0.32,
  OverArm: 0.80,

  Bust: 0.55,
  BustWithDrop: 0.55,
  UnderBust: 0.65,

  Waist: 1.50,
  WaistAt50: 1.50,
  NarrowWaist: 1.28,
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
  MidLeftThigh: 0.65,
  MidRightThigh: 0.65,
  ActualMidLeftThigh: 0.65,
  ActualMidRightThigh: 0.65,
  KneeLeftLeg: 0.47,
  KneeRightLeg: 0.47,
  ActualKneeLeftLeg: 0.47,
  ActualKneeRightLeg: 0.47,

  UnderKneeLeftLeg: 0.52,
  UnderKneeRightLeg: 0.52,
  CalfLeftLeg: 0.57,
  CalfRightLeg: 0.57,
  AnkleLeftLeg: 0.25,
  AnkleRightLeg: 0.25,
  ActualAnkleLeftLeg: 0.25,
  ActualAnkleRightLeg: 0.25,
});

const RING_SENSITIVITY_FEMALE: RingSensitivityTable = Object.freeze({
  HeadCircum: 0.00,
  Neck: 0.10,

  Collar: 0.30,
  OverArm: 0.75,

  Bust: 0.72,
  BustWithDrop: 0.72,
  UnderBust: 0.59,

  Waist: 1.35,
  WaistAt50: 1.35,
  NarrowWaist: 1.10,
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
  MidLeftThigh: 0.78,
  MidRightThigh: 0.78,
  ActualMidLeftThigh: 0.78,
  ActualMidRightThigh: 0.78,
  KneeLeftLeg: 0.52,
  KneeRightLeg: 0.52,
  ActualKneeLeftLeg: 0.52,
  ActualKneeRightLeg: 0.52,

  UnderKneeLeftLeg: 0.56,
  UnderKneeRightLeg: 0.56,
  CalfLeftLeg: 0.62,
  CalfRightLeg: 0.62,
  AnkleLeftLeg: 0.28,
  AnkleRightLeg: 0.28,
  ActualAnkleLeftLeg: 0.28,
  ActualAnkleRightLeg: 0.28,
});

const RING_SENSITIVITY_MALE: RingSensitivityTable = Object.freeze({
  HeadCircum: 0.00,
  Neck: 0.14,

  Collar: 0.34,
  OverArm: 0.85,

  Bust: 0.39,
  BustWithDrop: 0.39,
  UnderBust: 0.62,

  Waist: 1.73,
  WaistAt50: 1.73,
  NarrowWaist: 1.45,
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
  MidLeftThigh: 0.52,
  MidRightThigh: 0.52,
  ActualMidLeftThigh: 0.52,
  ActualMidRightThigh: 0.52,
  KneeLeftLeg: 0.42,
  KneeRightLeg: 0.42,
  ActualKneeLeftLeg: 0.42,
  ActualKneeRightLeg: 0.42,

  UnderKneeLeftLeg: 0.48,
  UnderKneeRightLeg: 0.48,
  CalfLeftLeg: 0.52,
  CalfRightLeg: 0.52,
  AnkleLeftLeg: 0.22,
  AnkleRightLeg: 0.22,
  ActualAnkleLeftLeg: 0.22,
  ActualAnkleRightLeg: 0.22,
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
  neutral: Object.freeze({ upper_arm: 0.61, forearm: 0.27 }),
  female: Object.freeze({ upper_arm: 0.58, forearm: 0.26 }),
  male: Object.freeze({ upper_arm: 0.64, forearm: 0.28 }),
});

// ─── WHR-relative personalization ──────────────────────────────────────────
//
// The pure sex tables force an archetype: every female gets strong gynoid
// hip/thigh response even when her own measured waist-to-hip ratio says her
// fat distribution is more android. Androidness expresses where a person
// sits on the gynoid(0) ↔ android(1) axis; sensitivity lookups lerp between
// the female and male tables at that point. The declared sex anchors half
// the weight, the measured WHR the other half, so a female with WHR 0.83
// gets meaningfully less hip response and more waist response than the
// pure female table, without flipping her to the male curve.

/** Typical WHR anchors for fully gynoid / fully android distributions. */
const WHR_GYNOID = 0.72;
const WHR_ANDROID = 0.95;

/**
 * Androidness in [0,1] from declared sex + measured waist-to-hip ratio.
 * Pass undefined WHR (or <= 0) to fall back to the sex archetype alone.
 */
export function computeAndroidness(sex: Sex, whr?: number): number {
  const prior = sex === 'male' ? 1 : sex === 'female' ? 0 : 0.5;
  if (whr === undefined || !(whr > 0)) return prior;
  const measured = Math.min(
    1,
    Math.max(0, (whr - WHR_GYNOID) / (WHR_ANDROID - WHR_GYNOID)),
  );
  return 0.5 * prior + 0.5 * measured;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Look up radial sensitivity for a ring name.
 * With `androidness` provided, lerps female↔male tables at that point;
 * otherwise uses the declared-sex table as-is (legacy behavior).
 */
export function getRingSensitivity(
  ringName: string,
  sex: Sex,
  androidness?: number,
): number {
  if (androidness === undefined) {
    return (RING_TABLES[sex][ringName] ?? 0) * SENSITIVITY_GAIN;
  }
  const f = RING_SENSITIVITY_FEMALE[ringName] ?? 0;
  const m = RING_SENSITIVITY_MALE[ringName] ?? 0;
  return lerp(f, m, androidness) * SENSITIVITY_GAIN;
}

/** Look up sensitivity for an arm sub-segment (upper_arm or forearm). */
export function getArmSensitivity(
  subSegment: 'upper_arm' | 'forearm',
  sex: Sex,
  androidness?: number,
): number {
  if (androidness === undefined) {
    return ARM_SENSITIVITY_TABLE[sex][subSegment] * SENSITIVITY_GAIN;
  }
  const f = ARM_SENSITIVITY_TABLE.female[subSegment];
  const m = ARM_SENSITIVITY_TABLE.male[subSegment];
  return lerp(f, m, androidness) * SENSITIVITY_GAIN;
}

/**
 * Segment-level mean sensitivity. Used by the linked-mode total readout to
 * convert segment overrides into an implied global-BF contribution.
 */
export function getSegmentMeanSensitivity(
  segment: SegmentId,
  sex: Sex,
  androidness?: number,
): number {
  if (androidness === undefined) {
    const tables = {
      neutral: SEGMENT_MEAN_SENSITIVITY_UNISEX,
      female: SEGMENT_MEAN_SENSITIVITY_FEMALE,
      male: SEGMENT_MEAN_SENSITIVITY_MALE,
    } as const;
    return tables[sex][segment] * SENSITIVITY_GAIN;
  }
  const f = SEGMENT_MEAN_SENSITIVITY_FEMALE[segment];
  const m = SEGMENT_MEAN_SENSITIVITY_MALE[segment];
  return lerp(f, m, androidness) * SENSITIVITY_GAIN;
}

// ─── Backwards-compatible exports ──────────────────────────────────────────
// Keep the legacy non-sex-aware symbols so older call sites keep compiling
// until they migrate to getRingSensitivity / getArmSensitivity.

/** @deprecated Use {@link getRingSensitivity}(name, sex) instead. */
export const RING_SENSITIVITY: Record<string, number> = { ...RING_SENSITIVITY_NEUTRAL };

/** @deprecated Use {@link getArmSensitivity}(subSegment, sex) instead. */
export const ARM_SENSITIVITY = ARM_SENSITIVITY_TABLE.neutral.upper_arm;
