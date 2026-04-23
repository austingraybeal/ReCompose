import type { SegmentId } from '@/types/scan';

export interface SegmentDef {
  id: SegmentId;
  label: string;
  icon: string;
  /** Landmark ring names owned by this segment. */
  rings: string[];
  /** CSS variable reference for highlight color. */
  color: string;
  /** Normalized Y range (0-1, where 1 = top of head) */
  yRange: [number, number];
  /** Center of the segment in normalized Y for Gaussian influence */
  yCenter: number;
  /** Width of Gaussian influence (sigma) in normalized Y */
  sigma: number;
  /** True for lateral segments (arms) — vertices classified by X-distance from center. */
  isLateral?: boolean;
}

/**
 * 8-segment anatomy definitions.
 *
 * Arms are split into `upper_arms` (shoulder→elbow) and `forearms` (elbow→wrist)
 * using the real ElbowLeft/ElbowRight landmarks. Legs are split into `thighs`
 * (hip→knee) and `calves` (knee→ankle) using the existing Knee rings.
 *
 * Arm ring cardinal points in the source CSV use `Forward` as the anterior
 * suffix (not `Front`). The landmark grouper handles both; see landmarkGrouper.ts.
 */
export const SEGMENTS: SegmentDef[] = [
  {
    id: 'shoulders',
    label: 'Shoulders',
    icon: '\u{1F9B4}',
    rings: ['Collar', 'OverArm'],
    color: 'var(--rc-seg-shoulders)',
    yRange: [0.66, 0.82],
    yCenter: 0.74,
    sigma: 0.14,
  },
  {
    id: 'upper_arms',
    label: 'Upper Arms',
    icon: '\u{1F4AA}',
    // Real landmark rings: ElbowLeftArm/ElbowRightArm bound the bottom of each upper arm.
    // The top is effectively bounded by the Armpit points (handled in the classifier).
    rings: ['ElbowLeftArm', 'ElbowRightArm'],
    color: 'var(--rc-seg-upper-arms)',
    yRange: [0.45, 0.74],
    yCenter: 0.58,
    sigma: 0.10,
    isLateral: true,
  },
  {
    id: 'forearms',
    label: 'Forearms',
    icon: '\u{1F590}',
    // Forearms are bounded above by Elbow rings and below by Wrist rings.
    rings: ['ElbowLeftArm', 'ElbowRightArm', 'WristLeftArm', 'WristRightArm'],
    color: 'var(--rc-seg-forearms)',
    yRange: [0.20, 0.45],
    yCenter: 0.33,
    sigma: 0.10,
    isLateral: true,
  },
  {
    id: 'torso',
    label: 'Torso',
    icon: '\u{1FAC1}',
    rings: ['Bust', 'BustWithDrop', 'UnderBust'],
    color: 'var(--rc-seg-torso)',
    yRange: [0.59, 0.66],
    yCenter: 0.62,
    sigma: 0.12,
  },
  {
    id: 'waist',
    label: 'Waist',
    icon: '\u{2B55}',
    rings: ['Waist', 'WaistAt50', 'StomachFP', 'StomachMax', 'Abdomen'],
    color: 'var(--rc-seg-waist)',
    yRange: [0.48, 0.59],
    yCenter: 0.535,
    sigma: 0.12,
  },
  {
    id: 'hips',
    label: 'Hips',
    icon: '\u{1F351}',
    rings: ['Seat', 'Hip', 'HipWidest'],
    color: 'var(--rc-seg-hips)',
    yRange: [0.39, 0.48],
    yCenter: 0.435,
    sigma: 0.14,
  },
  {
    id: 'thighs',
    label: 'Thighs',
    icon: '\u{1F9B5}',
    rings: [
      'UpperLeftThigh', 'UpperRightThigh',
      'MidLeftThigh', 'MidRightThigh',
      'ActualMidLeftThigh', 'ActualMidRightThigh',
      'KneeLeftLeg', 'KneeRightLeg',
      'ActualKneeLeftLeg', 'ActualKneeRightLeg',
    ],
    color: 'var(--rc-seg-thighs)',
    yRange: [0.22, 0.39],
    yCenter: 0.305,
    sigma: 0.10,
  },
  {
    id: 'calves',
    label: 'Calves',
    icon: '\u{1F9B6}',
    rings: [
      'UnderKneeLeftLeg', 'UnderKneeRightLeg',
      'CalfLeftLeg', 'CalfRightLeg',
      'AnkleLeftLeg', 'AnkleRightLeg',
      'ActualAnkleLeftLeg', 'ActualAnkleRightLeg',
    ],
    color: 'var(--rc-seg-calves)',
    yRange: [0.0, 0.22],
    yCenter: 0.11,
    sigma: 0.10,
  },
];

/**
 * Segment-level mean radial sensitivity (% radial per +1% BF).
 * Used by the proportional/linked slider mode to derive an implied global-BF
 * delta from a single-segment slider change.
 */
export const SEGMENT_MEAN_SENSITIVITY_UNISEX = {
  shoulders: 0.25,
  upper_arms: 0.35,
  forearms: 0.15,
  torso: 0.58,
  waist: 1.52,
  hips: 1.05,
  thighs: 0.65,
  calves: 0.14,
} as const satisfies Record<SegmentId, number>;

export const SEGMENT_MEAN_SENSITIVITY_FEMALE = {
  shoulders: 0.21,
  upper_arms: 0.32,
  forearms: 0.14,
  torso: 0.66,
  waist: 1.37,
  hips: 1.31,
  thighs: 0.80,
  calves: 0.14,
} as const satisfies Record<SegmentId, number>;

export const SEGMENT_MEAN_SENSITIVITY_MALE = {
  shoulders: 0.29,
  upper_arms: 0.39,
  forearms: 0.16,
  torso: 0.51,
  waist: 1.78,
  hips: 0.84,
  thighs: 0.54,
  calves: 0.11,
} as const satisfies Record<SegmentId, number>;

/** Ordered list for UI rendering (top-to-bottom anatomy). */
export const SEGMENT_ORDER: readonly SegmentId[] = [
  'shoulders',
  'upper_arms',
  'forearms',
  'torso',
  'waist',
  'hips',
  'thighs',
  'calves',
] as const;

/** Lookup segment by ID */
export function getSegmentDef(id: SegmentId): SegmentDef {
  return SEGMENTS.find(s => s.id === id)!;
}
