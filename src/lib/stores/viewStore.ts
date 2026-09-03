import { create } from 'zustand';
import type { CameraPreset } from '@/types/scan';

export type AppMode = 'free' | 'bids' | 'preview';

interface ViewState {
  /**
   * Entry mode chosen on the upload screen. 'free' = FreeCompose viewer;
   * 'bids' = launch straight into the BIDS assessment so participants
   * don't explore their avatar before the tasks. Null until chosen.
   */
  appMode: AppMode | null;
  wireframe: boolean;
  ghostOverlay: boolean;
  segmentHighlight: boolean;
  cameraPreset: CameraPreset;
  hoveredSegment: string | null;
  regionalPanelOpen: boolean;
  focusedSegment: string | null;

  setAppMode: (mode: AppMode | null) => void;
  toggleWireframe: () => void;
  toggleGhostOverlay: () => void;
  toggleSegmentHighlight: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setHoveredSegment: (segment: string | null) => void;
  setRegionalPanelOpen: (open: boolean) => void;
  setFocusedSegment: (segment: string | null) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  appMode: null,
  // Wireframe defaults ON in both modes (product decision: the mesh reads
  // better and BIDS participants see less literal skin detail).
  wireframe: true,
  ghostOverlay: false,
  segmentHighlight: false,
  cameraPreset: 'front',
  hoveredSegment: null,
  // Segments panel starts open in both modes so all sliders are visible.
  regionalPanelOpen: true,
  focusedSegment: null,

  setAppMode: (mode) => set({ appMode: mode }),
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  toggleGhostOverlay: () => set((s) => ({ ghostOverlay: !s.ghostOverlay })),
  toggleSegmentHighlight: () => set((s) => ({ segmentHighlight: !s.segmentHighlight })),
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  setHoveredSegment: (segment) => set({ hoveredSegment: segment }),
  setRegionalPanelOpen: (open) => set({ regionalPanelOpen: open }),
  setFocusedSegment: (segment) => set({ focusedSegment: segment, regionalPanelOpen: true }),
}));
