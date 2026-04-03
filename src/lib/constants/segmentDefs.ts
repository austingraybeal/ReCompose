import type { SegmentId } from '@/types/scan';

export interface SegmentDef {
  id: SegmentId;
  label: string;
  icon: string;
  rings: string[];
  color: string;
  /** Normalized Y range (0-1, where 1 = top of head) */
  yRange: [number, number];
  /** Center of the segment in normalized Y for Gaussian influence */
  yCenter: number;
  /** Width of Gaussian influence (sigma) in normalized Y */
  sigma: number;
  isLateral?: boolean;
}

export const SEGMENTS: SegmentDef[] = [
  {
    id: 'shoulders',
    label: 'Shoulders',
    icon: '\u{1F9B4}',
    rings: ['Collar', 'OverArm'],
    color: 'var(--rc-seg-shoulders)',
    yRange: [0.66, 0.82],
    yCenter: 0.74,
    // Wide sigma so shoulder changes blend smoothly into torso and arms
    sigma: 0.14,
  },
  {
    id: 'arms',
    label: 'Arms',
    icon: '\u{1F4AA}',
    rings: [],
    color: 'var(--rc-seg-arms)',
    yRange: [0.05, 0.74],
    yCenter: 0.45,
    sigma: 0.18,
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
    // Wide sigma so torso blends into shoulders above and waist below
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
    // Wide sigma — waist influence should blend into hips and torso
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
    // VERY wide sigma to prevent holes at hip boundaries
    sigma: 0.14,
  },
  {
    id: 'legs',
    label: 'Legs',
    icon: '\u{1F9B5}',
    rings: [
      'UpperLeftThigh', 'UpperRightThigh',
      'MidLeftThigh', 'MidRightThigh',
      'ActualMidLeftThigh', 'ActualMidRightThigh',
      'KneeLeftLeg', 'KneeRightLeg',
      'ActualKneeLeftLeg', 'ActualKneeRightLeg',
      'UnderKneeLeftLeg', 'UnderKneeRightLeg',
      'CalfLeftLeg', 'CalfRightLeg',
      'AnkleLeftLeg', 'AnkleRightLeg',
      'ActualAnkleLeftLeg', 'ActualAnkleRightLeg',
    ],
    color: 'var(--rc-seg-legs)',
    yRange: [0.0, 0.39],
    yCenter: 0.20,
    // Wide sigma — legs should blend smoothly into hips
    sigma: 0.18,
  },
];

/** Lookup segment by ID */
export function getSegmentDef(id: SegmentId): SegmentDef {
  return SEGMENTS.find(s => s.id === id)!;
}
