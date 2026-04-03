export const COLORS = {
  bgPrimary: '#0a0b0f',
  bgSurface: '#14161d',
  bgElevated: '#1a1d28',
  accent: '#3ecfb4',
  accentDim: 'rgba(62, 207, 180, 0.12)',
  bfLean: '#3ecfb4',
  bfMid: '#f0c84a',
  bfHigh: '#f0764a',
  bfVeryHigh: '#e0445a',
  deltaPositive: '#f0764a',
  deltaNegative: '#3ecfb4',
  deltaNeutral: '#6b7080',
} as const;

export const SEGMENT_COLORS: Record<string, string> = {
  shoulders: '#4ac8e8',
  arms: '#5de8d0',
  torso: '#4acfa0',
  waist: '#f0c84a',
  hips: '#f0764a',
  legs: '#a78bfa',
} as const;

/** Material color for the body mesh (neutral warm skin tone) */
export const MESH_COLOR = '#c4a882';
export const GHOST_COLOR = '#3ecfb4';
export const GHOST_OPACITY = 0.15;
