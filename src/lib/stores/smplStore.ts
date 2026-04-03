import { create } from 'zustand';
import type { SMPLModelData } from '@/types/smpl';
import type { DisplacementField } from '@/lib/smpl/displacementField';
import { buildDisplacementFields } from '@/lib/smpl/displacementField';
import { loadSMPLFromURL } from '@/lib/smpl/loader';

export type SMPLGender = 'male' | 'female' | 'neutral';

/** Paths to pre-extracted SMPL models served from public/ */
const SMPL_MODEL_URLS: Record<SMPLGender, string> = {
  male: '/models/smpl_male.json',
  female: '/models/smpl_female.json',
  neutral: '/models/smpl_neutral.json',
};

interface SMPLState {
  /** Loaded SMPL model data */
  modelData: SMPLModelData | null;
  /** Pre-computed displacement field for the morph engine */
  displacementField: DisplacementField | null;
  /** Whether the SMPL model is currently loading */
  isLoading: boolean;
  /** Currently selected gender */
  gender: SMPLGender;
  /** Which gender models are available */
  availableGenders: Set<SMPLGender>;
  /** Whether initialization has been attempted */
  initialized: boolean;

  /** Switch to a different gender model */
  setGender: (gender: SMPLGender) => Promise<void>;
  /** Auto-detect which models are available and load the default */
  initialize: () => Promise<void>;
}

export const useSmplStore = create<SMPLState>((set, get) => ({
  modelData: null,
  displacementField: null,
  isLoading: false,
  gender: 'male',
  availableGenders: new Set(),
  initialized: false,

  setGender: async (gender) => {
    const state = get();
    if (gender === state.gender && state.modelData) return;

    set({ isLoading: true, gender });

    try {
      const data = await loadSMPLFromURL(SMPL_MODEL_URLS[gender]);
      const field = buildDisplacementFields(data);
      const available = new Set(get().availableGenders);
      available.add(gender);
      set({ modelData: data, displacementField: field, isLoading: false, availableGenders: available });
    } catch {
      set({ isLoading: false, displacementField: null });
    }
  },

  initialize: async () => {
    const state = get();
    if (state.initialized || state.isLoading) return;

    set({ isLoading: true, initialized: true });

    // Probe which models are available
    const genders: SMPLGender[] = ['male', 'female', 'neutral'];
    const results = await Promise.allSettled(
      genders.map(async (g) => {
        const resp = await fetch(SMPL_MODEL_URLS[g], { method: 'HEAD' });
        if (!resp.ok) throw new Error('not found');
        return g;
      })
    );

    const available = new Set<SMPLGender>();
    for (const result of results) {
      if (result.status === 'fulfilled') available.add(result.value);
    }

    set({ availableGenders: available });

    // Load the preferred default
    const preferred: SMPLGender[] = ['male', 'female', 'neutral'];
    const defaultGender = preferred.find((g) => available.has(g));

    if (defaultGender) {
      try {
        const data = await loadSMPLFromURL(SMPL_MODEL_URLS[defaultGender]);
        const field = buildDisplacementFields(data);
        set({ modelData: data, displacementField: field, isLoading: false, gender: defaultGender });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },
}));
