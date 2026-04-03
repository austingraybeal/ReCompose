import { create } from 'zustand';
import type { SMPLModelData } from '@/types/smpl';
import type { BetaMappingConfig } from '@/lib/smpl/parameterMapper';
import { DEFAULT_MAPPING } from '@/lib/smpl/parameterMapper';
import { loadSMPLFromURL } from '@/lib/smpl/loader';

/** Path to the pre-extracted SMPL model served from public/ */
const SMPL_MODEL_URL = '/models/smpl_neutral.json';

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
  /** Whether initialization has been attempted */
  initialized: boolean;

  setModelData: (data: SMPLModelData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMappingConfig: (config: BetaMappingConfig) => void;
  setUseSmpl: (use: boolean) => void;
  clearModel: () => void;
  /** Auto-fetch the SMPL model from public/models/ on app boot */
  initialize: () => Promise<void>;
}

export const useSmplStore = create<SMPLState>((set, get) => ({
  modelData: null,
  isLoading: false,
  error: null,
  mappingConfig: DEFAULT_MAPPING,
  useSmpl: false,
  initialized: false,

  setModelData: (data) => set({ modelData: data, isLoading: false, error: null, useSmpl: true }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  setMappingConfig: (config) => set({ mappingConfig: config }),
  setUseSmpl: (use) => set({ useSmpl: use }),
  clearModel: () => set({ modelData: null, useSmpl: false, error: null }),

  initialize: async () => {
    const state = get();
    if (state.initialized || state.isLoading) return;

    set({ isLoading: true, initialized: true });

    try {
      const data = await loadSMPLFromURL(SMPL_MODEL_URL);
      set({ modelData: data, isLoading: false, error: null, useSmpl: true });
    } catch {
      // Model not available — silently fall back to Phase 1 engine
      set({ isLoading: false, error: null, useSmpl: false });
    }
  },
}));
