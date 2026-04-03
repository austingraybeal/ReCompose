import { create } from 'zustand';
import type { ScanData } from '@/types/scan';

interface ScanState {
  scanData: ScanData | null;
  isLoading: boolean;
  error: string | null;
  setScanData: (data: ScanData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearScan: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  scanData: null,
  isLoading: false,
  error: null,
  setScanData: (data) => set({ scanData: data, isLoading: false, error: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  clearScan: () => set({ scanData: null, isLoading: false, error: null }),
}));
