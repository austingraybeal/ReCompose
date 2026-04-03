import { create } from 'zustand';
import type { SMPLModelData } from '@/types/smpl';
import type { BetaMappingConfig } from '@/lib/smpl/parameterMapper';
import { DEFAULT_MAPPING } from '@/lib/smpl/parameterMapper';
import { loadSMPLFromURL } from '@/lib/smpl/loader';

export type SMPLGender = 'male' | 'female' | 'neutral';

/** Paths to pre-extracted SMPL models served from public/ */
const SMPL_MODEL_URLS: Record<SMPLGender, string> = {
  male: '/models/smpl_male.json',
  female: '/models/smpl_female.json',
  neutral: '/models/smpl_neutral.json',
};

interface SMPLState {
  /** Loaded SMPL model data (null = Phase 1 fallback mode) */
  modelData: SMPLModelData | null;
  /** Whether the SMPL model is currently loading */
  isLoading: boolean;
  /** Load error message */
  error: string | null;
  /** Beta mapping configuration */
  mappingConfig: BetaMappingConfig;
  /** Whether to use SMPL engine (true) or Phase 1 radial engine (false) */
  useSmpl: boolean;
  /** Currently selected gender */
  gender: SMPLGender;
  /** Which gender models are available (successfully loaded at least once) */
  availableGenders: Set<SMPLGender>;
  /** Whether initialization has been attempted */
  initialized: boolean;

  setModelData: (data: SMPLModelData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMappingConfig: (config: BetaMappingConfig) => void;
  setUseSmpl: (use: boolean) => void;
  clearModel: () => void;
  /** Switch to a different gender model */
  setGender: (gender: SMPLGender) => Promise<void>;
  /** Auto-detect which models are available and load the default */
  initialize: () => Promise<void>;
}

export const useSmplStore = create<SMPLState>((set, get) => ({
  modelData: null,
  isLoading: false,
  error: null,
  mappingConfig: DEFAULT_MAPPING,
  useSmpl: false,
  gender: 'male',
  availableGenders: new Set(),
  initialized: false,

  setModelData: (data) => set({ modelData: data, isLoading: false, error: null, useSmpl: true }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  setMappingConfig: (config) => set({ mappingConfig: config }),
  setUseSmpl: (use) => set({ useSmpl: use }),
  clearModel: () => set({ modelData: null, useSmpl: false, error: null }),

  setGender: async (gender) => {
    const state = get();
    if (gender === state.gender && state.modelData) return;

    set({ isLoading: true, gender });

    try {
      const data = await loadSMPLFromURL(SMPL_MODEL_URLS[gender]);
      const available = new Set(get().availableGenders);
      available.add(gender);
      set({ modelData: data, isLoading: false, error: null, useSmpl: true, availableGenders: available });
    } catch {
      set({ isLoading: false, error: `${gender} model not found`, useSmpl: false });
    }
  },

  initialize: async () => {
    const state = get();
    if (state.initialized || state.isLoading) return;

    set({ isLoading: true, initialized: true });

    // Probe which models are available (try all three in parallel)
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

    // Load the preferred default: male first, then female, then neutral
    const preferred: SMPLGender[] = ['male', 'female', 'neutral'];
    const defaultGender = preferred.find((g) => available.has(g));

    if (defaultGender) {
      try {
        const data = await loadSMPLFromURL(SMPL_MODEL_URLS[defaultGender]);
        set({ modelData: data, isLoading: false, error: null, useSmpl: true, gender: defaultGender });
      } catch {
        set({ isLoading: false, error: null, useSmpl: false });
      }
    } else {
      // No models available — fall back to Phase 1
      set({ isLoading: false, error: null, useSmpl: false });
    }
  },
}));
