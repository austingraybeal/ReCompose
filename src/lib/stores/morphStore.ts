import { create } from 'zustand';
import type { SegmentId, SegmentOverrides } from '@/types/scan';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

export type LinkMode = 'independent' | 'proportional';

/** Hard bounds for the global body-fat state, matching the UI slider. */
const BF_MIN = 5;
const BF_MAX = 55;

const emptyOverrides = (): SegmentOverrides =>
  SEGMENT_ORDER.reduce((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {} as SegmentOverrides);

interface MorphState {
  originalBodyFat: number;
  globalBodyFat: number;
  segmentOverrides: SegmentOverrides;
  linkMode: LinkMode;

  setOriginalBodyFat: (bf: number) => void;
  setGlobalBodyFat: (bf: number) => void;
  setSegmentOverride: (segment: SegmentId, value: number) => void;
  resetRegionalOverrides: () => void;
  setLinkMode: (mode: LinkMode) => void;
  toggleLinkMode: () => void;
}

export const useMorphStore = create<MorphState>((set) => ({
  originalBodyFat: 0,
  globalBodyFat: 0,
  segmentOverrides: emptyOverrides(),
  linkMode: 'independent',

  setOriginalBodyFat: (bf) => set({ originalBodyFat: bf, globalBodyFat: bf }),

  // Global slider NEVER resets segment overrides — both apply additively.
  // Clamped so no code path (UI or programmatic) can push BF outside the
  // supported range.
  setGlobalBodyFat: (bf) =>
    set({ globalBodyFat: Math.min(BF_MAX, Math.max(BF_MIN, bf)) }),

  // Segment sliders always store their own override — the mesh layers the
  // regional change on top of the global-BF base (game-character-creator
  // style). Link mode only changes how the headline body-fat total is
  // REPORTED: in 'proportional' (linked) mode the display adds the
  // overrides' implied whole-body BF contribution (see impliedBodyFatDelta
  // in metricProjection.ts). The deformation path is identical in both
  // modes, so a segment slider can never warp the whole body.
  setSegmentOverride: (segment, value) =>
    set((state) => ({
      segmentOverrides: { ...state.segmentOverrides, [segment]: value },
    })),

  resetRegionalOverrides: () => set({ segmentOverrides: emptyOverrides() }),

  setLinkMode: (mode) => set({ linkMode: mode }),

  toggleLinkMode: () =>
    set((state) => ({
      linkMode: state.linkMode === 'independent' ? 'proportional' : 'independent',
    })),
}));
