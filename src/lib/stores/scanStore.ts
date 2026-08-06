import { create } from 'zustand';
import type { ScanData } from '@/types/scan';

interface ScanState {
  scanData: ScanData | null;
  /** Original OBJ file name from upload (used for report/scan IDs). */
  scanFileName: string | null;
  isLoading: boolean;
  error: string | null;
  setScanData: (data: ScanData) => void;
  setScanFileName: (name: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearScan: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  scanData: null,
  scanFileName: null,
  isLoading: false,
  error: null,
  setScanData: (data) => set({ scanData: data, isLoading: false, error: null }),
  setScanFileName: (name) => set({ scanFileName: name }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  clearScan: () => set({ scanData: null, scanFileName: null, isLoading: false, error: null }),
}));
