import type { LandmarkRing, VertexBinding, SegmentId } from '@/types/scan';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/** Transition zone width in normalized Y (0-1) for blending between segments */
const TRANSITION_ZONE = 0.02;

/**
 * Compute the torso half-width threshold for arm detection.
 * Uses the Bust ring's lateral extent as reference.
 */
export function computeArmThreshold(rings: LandmarkRing[]): number {
  const bustRing = rings.find(r => r.name === 'Bust');
  if (!bustRing) {
    // Fallback: use any ring near torso height
    const torsoRing = rings.find(r => r.height > 1000 && r.height < 1200);
    if (!torsoRing) return 140; // default fallback in mm
    return (torsoRing.radius.left + torsoRing.radius.right) / 2 * 1.05;
  }
  return (bustRing.radius.left + bustRing.radius.right) / 2 * 1.05;
}

/**
 * Determine which segment a given normalized Y-height (0-1) belongs to.
 */
function getSegmentForHeight(normalizedY: number): SegmentId {
  for (const seg of SEGMENTS) {
    if (seg.isLateral) continue; // Skip arms (lateral classification)
    if (normalizedY >= seg.yRange[0] && normalizedY <= seg.yRange[1]) {
      return seg.id;
    }
  }
  // Default to closest segment
  if (normalizedY > 0.82) return 'shoulders';
  if (normalizedY < 0) return 'legs';
  return 'legs';
}

/**
 * Find the ring that owns a given ring name (which segment it belongs to).
 */
function getRingSegment(ringName: string): SegmentId {
  for (const seg of SEGMENTS) {
    if (seg.rings.includes(ringName)) return seg.id;
  }
  return 'legs';
}

/**
 * Find the two closest rings (above and below) for a given Y height.
 * Returns indices into the sorted rings array and interpolation weight.
 */
function findBoundingRings(
  y: number,
  rings: LandmarkRing[]
): { aboveIdx: number; belowIdx: number; weight: number } {
  // Rings are sorted highest to lowest
  if (rings.length === 0) {
    return { aboveIdx: 0, belowIdx: 0, weight: 0 };
  }

  // Above highest ring
  if (y >= rings[0].height) {
    return { aboveIdx: 0, belowIdx: 0, weight: 1 };
  }

  // Below lowest ring
  if (y <= rings[rings.length - 1].height) {
    const last = rings.length - 1;
    return { aboveIdx: last, belowIdx: last, weight: 0 };
  }

  // Find bounding rings
  for (let i = 0; i < rings.length - 1; i++) {
    if (y <= rings[i].height && y >= rings[i + 1].height) {
      const range = rings[i].height - rings[i + 1].height;
      const weight = range > 0 ? (y - rings[i + 1].height) / range : 0;
      return { aboveIdx: i, belowIdx: i + 1, weight };
    }
  }

  return { aboveIdx: 0, belowIdx: rings.length - 1, weight: 0.5 };
}

/**
 * Check if a vertex is in a transition zone between segments.
 * Uses normalized Y (0-1). Returns blend weight and adjacent segment ID.
 */
function checkTransitionZone(
  normalizedY: number,
  segmentId: SegmentId
): { blendWeight: number; blendSegmentId: string | null } {
  const seg = SEGMENTS.find(s => s.id === segmentId);
  if (!seg || seg.isLateral) return { blendWeight: 0, blendSegmentId: null };

  // Check lower boundary
  const distToLower = normalizedY - seg.yRange[0];
  if (distToLower >= 0 && distToLower < TRANSITION_ZONE) {
    const belowSeg = SEGMENTS.find(s => !s.isLateral && s.yRange[1] === seg.yRange[0]);
    if (belowSeg) {
      return {
        blendWeight: 1 - distToLower / TRANSITION_ZONE,
        blendSegmentId: belowSeg.id,
      };
    }
  }

  // Check upper boundary
  const distToUpper = seg.yRange[1] - normalizedY;
  if (distToUpper >= 0 && distToUpper < TRANSITION_ZONE) {
    const aboveSeg = SEGMENTS.find(s => !s.isLateral && s.yRange[0] === seg.yRange[1]);
    if (aboveSeg) {
      return {
        blendWeight: 1 - distToUpper / TRANSITION_ZONE,
        blendSegmentId: aboveSeg.id,
      };
    }
  }

  return { blendWeight: 0, blendSegmentId: null };
}

/**
 * Classify all mesh vertices into body segments and compute binding data.
 *
 * @param positions - Float32Array of vertex positions (x,y,z triples) in original mm space
 * @param rings - Sorted landmark rings (highest to lowest, in mm space)
 * @param armThreshold - X-distance threshold for arm classification (mm)
 * @returns Array of VertexBinding, one per vertex
 */
export function classifyVertices(
  positions: Float32Array,
  rings: LandmarkRing[],
  armThreshold: number
): VertexBinding[] {
  const vertexCount = positions.length / 3;
  const bindings: VertexBinding[] = new Array(vertexCount);

  // Compute center axis X (average of all ring centers)
  const centerX = rings.length > 0
    ? rings.reduce((s, r) => s + r.center.x, 0) / rings.length
    : 0;

  // Get ankle height for arm classification lower bound
  const ankleRing = rings.find(r => r.name.includes('Ankle'));
  const ankleHeight = ankleRing ? ankleRing.height : 80;

  // Compute body height range for normalizing Y to 0-1
  // (segment yRanges in segmentDefs are in normalized 0-1 space)
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const y = positions[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bodyHeight = maxY - minY;
  const normalizeY = bodyHeight > 0 ? (y: number) => (y - minY) / bodyHeight : () => 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // Arm detection: vertices far from center axis and above ankle
    const xDist = Math.abs(x - centerX);
    const isArm = xDist > armThreshold && y > ankleHeight;

    // Find bounding rings (uses raw mm heights)
    const { aboveIdx, belowIdx, weight } = findBoundingRings(y, rings);

    // Normalize Y to 0-1 for segment lookup (segment yRanges are 0-1)
    const ny = normalizeY(y);

    let segmentId: SegmentId;
    if (isArm) {
      segmentId = 'arms';
    } else {
      segmentId = getSegmentForHeight(ny);
    }

    // Compute radial angle and distance from nearest ring center
    const ringCenter = rings.length > 0
      ? (weight >= 0.5 ? rings[aboveIdx].center : rings[belowIdx].center)
      : { x: 0, y: 0, z: 0 };

    const dx = x - ringCenter.x;
    const dz = z - ringCenter.z;
    const radialAngle = Math.atan2(dz, dx);
    const radialDistance = Math.sqrt(dx * dx + dz * dz);

    // Check transition zones (uses normalized Y)
    const { blendWeight, blendSegmentId } = isArm
      ? { blendWeight: 0, blendSegmentId: null }
      : checkTransitionZone(ny, segmentId);

    bindings[i] = {
      segmentId,
      ringAboveIdx: aboveIdx,
      ringBelowIdx: belowIdx,
      ringWeight: weight,
      radialAngle,
      radialDistance,
      blendWeight,
      blendSegmentId,
    };
  }

  return bindings;
}
