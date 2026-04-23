/** Ring names that can appear in the Core Measures CSV landmark data */
export const RING_NAMES = [
  'HeadCircum',
  'Collar',
  'OverArm',
  'Bust',
  'BustWithDrop',
  'UnderBust',
  'Waist',
  'WaistAt50',
  'StomachFP',
  'StomachMax',
  'Abdomen',
  'Seat',
  'Hip',
  'HipWidest',
  // Arm rings — ElbowLeftArm/Right and WristLeftArm/Right use the `*Forward` suffix
  // (not `Front`) in the scanner CSV. Both suffixes are accepted by the grouper.
  'ElbowLeftArm',
  'ElbowRightArm',
  'WristLeftArm',
  'WristRightArm',
  'UpperLeftThigh',
  'UpperRightThigh',
  'MidLeftThigh',
  'MidRightThigh',
  'ActualMidLeftThigh',
  'ActualMidRightThigh',
  'KneeLeftLeg',
  'KneeRightLeg',
  'ActualKneeLeftLeg',
  'ActualKneeRightLeg',
  'UnderKneeLeftLeg',
  'UnderKneeRightLeg',
  'CalfLeftLeg',
  'CalfRightLeg',
  'AnkleLeftLeg',
  'AnkleRightLeg',
  'ActualAnkleLeftLeg',
  'ActualAnkleRightLeg',
] as const;

/**
 * Cardinal direction suffixes for ring landmark points.
 *
 * Two anterior conventions coexist in the scanner CSV:
 *   - `Front`   — used by torso and leg rings (e.g. `BustFront`, `UpperLeftThighFront`)
 *   - `Forward` — used by arm rings            (e.g. `ElbowLeftArmForward`, `WristRightArmForward`)
 *
 * The landmark grouper treats both as the anterior cardinal.
 */
export const CARDINAL_SUFFIXES = ['Front', 'Forward', 'Back', 'Left', 'Right'] as const;
