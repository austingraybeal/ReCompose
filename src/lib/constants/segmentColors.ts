import type { SegmentId } from '@/types/scan';

/**
 * Segment identification palette — purple-family with alternating
 * lightness along each limb chain so adjacent regions stay readable, and
 * a magenta pop on the waist. Shared by the mesh tint, the slider pills,
 * and the classifier overlay so every surface tells the same story.
 */
export const SEGMENT_COLOR_HEX: Record<SegmentId, string> = {
  shoulders: '#b39df5',
  upper_arms: '#6f58c9',
  forearms: '#dcccff',
  torso: '#8a63e8',
  waist: '#e07bd6',
  hips: '#55437f',
  thighs: '#a78bfa',
  calves: '#7f9cf5',
};

/** rgba() string for a segment color at the given opacity. */
export function segmentTint(id: SegmentId, alpha: number): string {
  const hex = SEGMENT_COLOR_HEX[id];
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
