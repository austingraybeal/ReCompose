import { create } from 'zustand';
import type { SegmentId, SegmentOverrides } from '@/types/scan';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';
import { getSegmentMeanSensitivity, type Sex } from '@/lib/morph/sensitivityModel';
import { useGenderStore } from './genderStore';

export type LinkMode = 'independent' | 'proportional';

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

export const useMorphStore = create<MorphState>((set, get) => ({
  originalBodyFat: 0,
  globalBodyFat: 0,
  segmentOverrides: emptyOverrides(),
  linkMode: 'independent',

  setOriginalBodyFat: (bf) => set({ originalBodyFat: bf, globalBodyFat: bf }),

  // Global slider NEVER resets segment overrides — both apply additively.
  setGlobalBodyFat: (bf) => set({ globalBodyFat: bf }),

  setSegmentOverride: (segment, value) => {
    const { linkMode, originalBodyFat } = get();

    if (linkMode === 'independent') {
      set((state) => ({
        segmentOverrides: { ...state.segmentOverrides, [segment]: value },
      }));
      return;
    }

    // Proportional/linked mode: derive implied global-BF delta from this segment's
    // mean sensitivity, shift globalBodyFat, and clear overrides so every other
    // segment scales via its own sensitivity.
    const sex: Sex = useGenderStore.getState().gender;
    const meanSens = getSegmentMeanSensitivity(segment, sex);
    if (meanSens <= 0) {
      set((state) => ({
        segmentOverrides: { ...state.segmentOverrides, [segment]: value },
      }));
      return;
    }
    const impliedBfDelta = value / meanSens;
    set({
      globalBodyFat: originalBodyFat + impliedBfDelta,
      segmentOverrides: emptyOverrides(),
    });
  },

  resetRegionalOverrides: () => set({ segmentOverrides: emptyOverrides() }),

  setLinkMode: (mode) => set({ linkMode: mode }),

  toggleLinkMode: () =>
    set((state) => ({
      linkMode: state.linkMode === 'independent' ? 'proportional' : 'independent',
    })),
}));
