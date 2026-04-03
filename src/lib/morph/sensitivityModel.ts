/**
 * Regional body fat sensitivity coefficients per landmark ring.
 *
 * These values represent how much a ring's circumference changes per 1% body fat change.
 * Higher values = more responsive to fat changes (e.g., waist area).
 * Based on published allometric scaling research.
 */
export const RING_SENSITIVITY: Record<string, number> = {
  // Shoulders segment
  HeadCircum: 0.00,
  Collar: 0.10,
  OverArm: 0.40,

  // Torso segment
  Bust: 0.55,
  BustWithDrop: 0.55,
  UnderBust: 0.65,

  // Waist segment (highest — primary fat depot)
  Waist: 1.50,
  WaistAt50: 1.50,
  StomachFP: 1.60,
  StomachMax: 1.60,
  Abdomen: 1.40,

  // Hips segment
  Seat: 1.10,
  Hip: 1.05,
  HipWidest: 1.00,

  // Legs segment (gradient: high proximal → low distal)
  UpperLeftThigh: 0.80,
  UpperRightThigh: 0.80,
  MidLeftThigh: 0.50,
  ActualMidLeftThigh: 0.50,
  MidRightThigh: 0.50,
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
};

/** Arm vertices use a flat sensitivity since they aren't ring-based */
export const ARM_SENSITIVITY = 0.35;
