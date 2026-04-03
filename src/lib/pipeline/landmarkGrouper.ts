import type { LandmarkPoint, LandmarkRing } from '@/types/scan';
import { CARDINAL_SUFFIXES } from '@/lib/constants/bodyRegions';

/**
 * Detect ring base names from landmark keys by finding groups that have
 * Front/Back/Left/Right suffixes.
 */
function detectRingNames(landmarks: Record<string, LandmarkPoint>): string[] {
  const keys = Object.keys(landmarks);
  const candidates = new Map<string, Set<string>>();

  for (const key of keys) {
    for (const suffix of CARDINAL_SUFFIXES) {
      if (key.endsWith(suffix)) {
        const base = key.slice(0, -suffix.length);
        if (!candidates.has(base)) candidates.set(base, new Set());
        candidates.get(base)!.add(suffix);
        break;
      }
    }
  }

  // Only include rings that have at least Front+Back or Left+Right
  const ringNames: string[] = [];
  for (const [base, suffixes] of candidates) {
    if (suffixes.size >= 2) {
      ringNames.push(base);
    }
  }

  return ringNames;
}

/**
 * Group landmarks into cross-section rings.
 * Each ring has 4 cardinal points (Front, Back, Left, Right),
 * a computed center, height, and radial distances.
 */
export function groupLandmarksIntoRings(
  landmarks: Record<string, LandmarkPoint>
): LandmarkRing[] {
  const ringNames = detectRingNames(landmarks);
  const rings: LandmarkRing[] = [];

  for (const name of ringNames) {
    const front = landmarks[`${name}Front`];
    const back = landmarks[`${name}Back`];
    const left = landmarks[`${name}Left`];
    const right = landmarks[`${name}Right`];

    // Need at least front+back or left+right to form a ring
    if (!front && !back && !left && !right) continue;

    // Use available points to compute center
    const points = [front, back, left, right].filter(Boolean) as LandmarkPoint[];
    const center: LandmarkPoint = {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      y: points.reduce((s, p) => s + p.y, 0) / points.length,
      z: points.reduce((s, p) => s + p.z, 0) / points.length,
    };

    const height = center.y;

    const dist = (p: LandmarkPoint | undefined): number => {
      if (!p) return 0;
      const dx = p.x - center.x;
      const dz = p.z - center.z;
      return Math.sqrt(dx * dx + dz * dz);
    };

    rings.push({
      name,
      front: front ?? center,
      back: back ?? center,
      left: left ?? center,
      right: right ?? center,
      center,
      height,
      radius: {
        front: dist(front),
        back: dist(back),
        left: dist(left),
        right: dist(right),
      },
    });
  }

  // Sort rings by height (top to bottom, highest Y first)
  rings.sort((a, b) => b.height - a.height);

  return rings;
}
