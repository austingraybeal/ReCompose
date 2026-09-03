export const COLORS = {
  bgPrimary: '#1a1d26',
  bgSurface: '#22252f',
  bgElevated: '#2a2e3a',
  accent: '#a862f8',
  accentDim: 'rgba(168, 98, 248, 0.12)',
  bfLean: '#a862f8',
  bfMid: '#8f6df0',
  bfHigh: '#7aa0e0',
  bfVeryHigh: '#9088e8',
  deltaPositive: '#7aa0e0',
  deltaNegative: '#8f6df0',
  deltaNeutral: '#808498',
} as const;

export const SEGMENT_COLORS: Record<string, string> = {
  shoulders: '#7f9cf5',
  arms: '#7f9cff',
  torso: '#b478ff',
  waist: '#8f6df0',
  hips: '#7aa0e0',
  legs: '#a78bfa',
} as const;

/** Material color for the body mesh */
export const MESH_COLOR = '#a8b8c8';
export const GHOST_COLOR = '#a862f8';
export const GHOST_OPACITY = 0.12;
