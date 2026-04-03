import { create } from 'zustand';
import type { SegmentId, SegmentOverrides } from '@/types/scan';

const DEFAULT_OVERRIDES: SegmentOverrides = {
  shoulders: 0,
  arms: 0,
  torso: 0,
  waist: 0,
  hips: 0,
  legs: 0,
};

interface MorphState {
  originalBodyFat: number;
  globalBodyFat: number;
  segmentOverrides: SegmentOverrides;
  lockProportional: boolean;

  setOriginalBodyFat: (bf: number) => void;
  setGlobalBodyFat: (bf: number) => void;
  setSegmentOverride: (segment: SegmentId, value: number) => void;
  resetRegionalOverrides: () => void;
  toggleLockProportional: () => void;
}

export const useMorphStore = create<MorphState>((set) => ({
  originalBodyFat: 0,
  globalBodyFat: 0,
  segmentOverrides: { ...DEFAULT_OVERRIDES },
  lockProportional: true,

  setOriginalBodyFat: (bf) => set({ originalBodyFat: bf, globalBodyFat: bf }),

  setGlobalBodyFat: (bf) => set((state) => {
    if (state.lockProportional) {
      return { globalBodyFat: bf, segmentOverrides: { ...DEFAULT_OVERRIDES } };
    }
    return { globalBodyFat: bf };
  }),

  setSegmentOverride: (segment, value) => set((state) => ({
    segmentOverrides: { ...state.segmentOverrides, [segment]: value },
  })),

  resetRegionalOverrides: () => set({ segmentOverrides: { ...DEFAULT_OVERRIDES } }),

  toggleLockProportional: () => set((state) => ({
    lockProportional: !state.lockProportional,
  })),
}));
