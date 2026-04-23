import type { LandmarkPoint, LandmarkRing } from '@/types/scan';
import { CARDINAL_SUFFIXES } from '@/lib/constants/bodyRegions';

/**
 * Parse a landmark name into `{ring, direction}` using the cardinal-suffix
 * convention. Returns null if it doesn't match.
 *
 * Handles two anterior suffix variants:
 *   - `Front`   — used by torso/legs  (e.g. `BustFront`, `UpperLeftThighFront`)
 *   - `Forward` — used by arm rings   (e.g. `ElbowLeftArmForward`, `WristRightArmForward`)
 */
type Direction = 'front' | 'back' | 'left' | 'right';

function parseCardinalLandmark(
  name: string,
): { ring: string; direction: Direction } | null {
  for (const suffix of CARDINAL_SUFFIXES) {
    if (name.endsWith(suffix)) {
      const base = name.slice(0, -suffix.length);
      if (!base) continue;
      const direction: Direction =
        suffix === 'Forward'
          ? 'front'
          : (suffix.toLowerCase() as Direction);
      return { ring: base, direction };
    }
  }
  return null;
}

/**
 * Detect ring base names from landmark keys by finding groups that share
 * at least two cardinal-suffix variants (Front/Forward/Back/Left/Right).
 */
function detectRingNames(landmarks: Record<string, LandmarkPoint>): string[] {
  const candidates = new Map<string, Set<Direction>>();

  for (const key of Object.keys(landmarks)) {
    const parsed = parseCardinalLandmark(key);
    if (!parsed) continue;
    if (!candidates.has(parsed.ring)) candidates.set(parsed.ring, new Set());
    candidates.get(parsed.ring)!.add(parsed.direction);
  }

  const ringNames: string[] = [];
  for (const [base, directions] of candidates) {
    if (directions.size >= 2) ringNames.push(base);
  }
  return ringNames;
}

/**
 * Resolve the anterior cardinal point for a ring, preferring `*Front` and
 * falling back to `*Forward` (used by arm rings).
 */
function frontLandmark(
  ring: string,
  landmarks: Record<string, LandmarkPoint>,
): LandmarkPoint | undefined {
  return landmarks[`${ring}Front`] ?? landmarks[`${ring}Forward`];
}

/**
 * Group landmarks into cross-section rings.
 * Each ring has 4 cardinal points (Front/Forward, Back, Left, Right),
 * a computed center, height, and radial distances.
 */
export function groupLandmarksIntoRings(
  landmarks: Record<string, LandmarkPoint>,
): LandmarkRing[] {
  const ringNames = detectRingNames(landmarks);
  const rings: LandmarkRing[] = [];

  for (const name of ringNames) {
    const front = frontLandmark(name, landmarks);
    const back = landmarks[`${name}Back`];
    const left = landmarks[`${name}Left`];
    const right = landmarks[`${name}Right`];

    if (!front && !back && !left && !right) continue;

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

  rings.sort((a, b) => b.height - a.height);

  return rings;
}

/**
 * Per-side reference Y-heights for arm sub-classification.
 * Values are in the same coordinate space as the raw landmarks (mm).
 * Any entry is null if the underlying landmark is absent in the scan.
 */
export interface ArmReferencePoints {
  leftElbowY: number | null;
  rightElbowY: number | null;
  leftWristY: number | null;
  rightWristY: number | null;
  leftArmpitY: number | null;
  rightArmpitY: number | null;
}

/**
 * Extract arm reference Y-heights from landmarks+rings.
 * Prefers ring-center heights (averaged over 4 cardinals) when available,
 * falling back to single-point landmarks (`ElbowLeft`, `ElbowRight`, etc.).
 */
export function extractArmReferencePoints(
  landmarks: Record<string, LandmarkPoint>,
  rings: LandmarkRing[],
): ArmReferencePoints {
  const ringByName = new Map(rings.map((r) => [r.name, r]));

  const leftElbowY =
    ringByName.get('ElbowLeftArm')?.height ?? landmarks['ElbowLeft']?.y ?? null;
  const rightElbowY =
    ringByName.get('ElbowRightArm')?.height ?? landmarks['ElbowRight']?.y ?? null;
  const leftWristY =
    ringByName.get('WristLeftArm')?.height ?? landmarks['WristLeft']?.y ?? null;
  const rightWristY =
    ringByName.get('WristRightArm')?.height ?? landmarks['WristRight']?.y ?? null;
  const leftArmpitY = landmarks['ArmpitLeft']?.y ?? null;
  const rightArmpitY = landmarks['ArmpitRight']?.y ?? null;

  return {
    leftElbowY,
    rightElbowY,
    leftWristY,
    rightWristY,
    leftArmpitY,
    rightArmpitY,
  };
}
