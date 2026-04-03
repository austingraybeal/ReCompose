import type { SegmentId } from '@/types/scan';

export interface SegmentDef {
  id: SegmentId;
  label: string;
  icon: string;
  rings: string[];
  color: string;
  yRange: [number, number];
  isLateral?: boolean;
}

export const SEGMENTS: SegmentDef[] = [
  {
    id: 'shoulders',
    label: 'Shoulders',
    icon: '\u{1F9B4}',
    rings: ['Collar', 'OverArm'],
    color: 'var(--rc-seg-shoulders)',
    yRange: [1180, 1380],
  },
  {
    id: 'arms',
    label: 'Arms',
    icon: '\u{1F4AA}',
    rings: [],
    color: 'var(--rc-seg-arms)',
    yRange: [0, 1280],
    isLateral: true,
  },
  {
    id: 'torso',
    label: 'Torso',
    icon: '\u{1FAC1}',
    rings: ['Bust', 'BustWithDrop', 'UnderBust'],
    color: 'var(--rc-seg-torso)',
    yRange: [1070, 1180],
  },
  {
    id: 'waist',
    label: 'Waist',
    icon: '\u{2B55}',
    rings: ['Waist', 'WaistAt50', 'StomachFP', 'StomachMax', 'Abdomen'],
    color: 'var(--rc-seg-waist)',
    yRange: [860, 1070],
  },
  {
    id: 'hips',
    label: 'Hips',
    icon: '\u{1F351}',
    rings: ['Seat', 'Hip', 'HipWidest'],
    color: 'var(--rc-seg-hips)',
    yRange: [700, 860],
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
    yRange: [0, 700],
  },
];

/** Lookup segment by ID */
export function getSegmentDef(id: SegmentId): SegmentDef {
  return SEGMENTS.find(s => s.id === id)!;
}
