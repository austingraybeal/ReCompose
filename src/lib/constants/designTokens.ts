export const COLORS = {
  bgPrimary: '#1a1d26',
  bgSurface: '#22252f',
  bgElevated: '#2a2e3a',
  accent: '#3ecfb4',
  accentDim: 'rgba(62, 207, 180, 0.12)',
  bfLean: '#3ecfb4',
  bfMid: '#5db8d0',
  bfHigh: '#7aa0e0',
  bfVeryHigh: '#9088e8',
  deltaPositive: '#7aa0e0',
  deltaNegative: '#5db8d0',
  deltaNeutral: '#808498',
} as const;

export const SEGMENT_COLORS: Record<string, string> = {
  shoulders: '#4ac8e8',
  arms: '#5de8d0',
  torso: '#4acfa0',
  waist: '#5db8d0',
  hips: '#7aa0e0',
  legs: '#a78bfa',
} as const;

/** Material color for the body mesh */
export const MESH_COLOR = '#a8b8c8';
export const GHOST_COLOR = '#3ecfb4';
export const GHOST_OPACITY = 0.12;
