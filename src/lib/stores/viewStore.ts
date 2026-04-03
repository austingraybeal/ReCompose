import { create } from 'zustand';
import type { CameraPreset } from '@/types/scan';

interface ViewState {
  wireframe: boolean;
  ghostOverlay: boolean;
  segmentHighlight: boolean;
  cameraPreset: CameraPreset;
  hoveredSegment: string | null;
  regionalPanelOpen: boolean;
  focusedSegment: string | null;

  toggleWireframe: () => void;
  toggleGhostOverlay: () => void;
  toggleSegmentHighlight: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setHoveredSegment: (segment: string | null) => void;
  setRegionalPanelOpen: (open: boolean) => void;
  setFocusedSegment: (segment: string | null) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  wireframe: false,
  ghostOverlay: false,
  segmentHighlight: false,
  cameraPreset: 'front',
  hoveredSegment: null,
  regionalPanelOpen: false,
  focusedSegment: null,

  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  toggleGhostOverlay: () => set((s) => ({ ghostOverlay: !s.ghostOverlay })),
  toggleSegmentHighlight: () => set((s) => ({ segmentHighlight: !s.segmentHighlight })),
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  setHoveredSegment: (segment) => set({ hoveredSegment: segment }),
  setRegionalPanelOpen: (open) => set({ regionalPanelOpen: open }),
  setFocusedSegment: (segment) => set({ focusedSegment: segment, regionalPanelOpen: true }),
}));
