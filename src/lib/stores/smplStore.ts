import { create } from 'zustand';
import type { SMPLModelData } from '@/types/smpl';
import type { BetaMappingConfig } from '@/lib/smpl/parameterMapper';
import { DEFAULT_MAPPING } from '@/lib/smpl/parameterMapper';

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

  setModelData: (data: SMPLModelData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMappingConfig: (config: BetaMappingConfig) => void;
  setUseSmpl: (use: boolean) => void;
  clearModel: () => void;
}

export const useSmplStore = create<SMPLState>((set) => ({
  modelData: null,
  isLoading: false,
  error: null,
  mappingConfig: DEFAULT_MAPPING,
  useSmpl: false,

  setModelData: (data) => set({ modelData: data, isLoading: false, error: null, useSmpl: true }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  setMappingConfig: (config) => set({ mappingConfig: config }),
  setUseSmpl: (use) => set({ useSmpl: use }),
  clearModel: () => set({ modelData: null, useSmpl: false, error: null }),
}));
