import type { LandmarkRing, VertexBinding, SegmentId } from '@/types/scan';
import { SEGMENTS } from '@/lib/constants/segmentDefs';
import type { ArmReferencePoints } from '@/lib/pipeline/landmarkGrouper';

/** Transition-zone width in normalized Y (0-1) for inter-segment blending. */
const TRANSITION_ZONE = 0.02;

/**
 * Anatomical upper-arm : forearm length ratio fallback.
 * Only used if ElbowLeft/ElbowRight landmarks are missing from a scan.
 * (~56% upper arm, ~44% forearm measured wrist→shoulder.)
 */
const ELBOW_Y_FRACTION_FALLBACK = 0.44;

/**
 * Compute torso half-width threshold for arm detection from the Bust ring.
 * Retained as the fallback when a scan has no usable ring envelope.
 */
export function computeArmThreshold(rings: LandmarkRing[]): number {
  const bustRing = rings.find((r) => r.name === 'Bust');
  if (!bustRing) {
    const torsoRing = rings.find((r) => r.height > 1000 && r.height < 1200);
    if (!torsoRing) return 140; // default fallback in mm
    return ((torsoRing.radius.left + torsoRing.radius.right) / 2) * 1.05;
  }
  return ((bustRing.radius.left + bustRing.radius.right) / 2) * 1.05;
}

// ════════════════════════════════════════════════════════════════
// Y-aware lateral body envelope
//
// A single bust-derived x-threshold misclassifies wide hips/thighs as
// arm: on gynoid bodies the widest hip point sits laterally beyond the
// bust half-width, so lateral hip/thigh vertices land in the arm bucket
// — arm sliders then move the hips, and the morph engine tears the
// lateral thigh surface. The envelope instead tracks the body's actual
// silhouette half-width at every height, interpolated from the ring
// cardinals, so "arm" means "laterally beyond the body surface at this
// height" everywhere on the body.
// ════════════════════════════════════════════════════════════════

/** Margin applied to the envelope before a vertex counts as arm. */
export const ENVELOPE_ARM_MARGIN = 1.15;

/**
 * Rings excluded from the envelope: arm-only rings would inflate it at
 * arm heights, and OverArm is an arm-inclusive circumference rather than
 * a body-silhouette ring.
 */
const ENVELOPE_EXCLUDED_RINGS: ReadonlySet<string> = new Set([
  'ElbowLeftArm',
  'ElbowRightArm',
  'WristLeftArm',
  'WristRightArm',
  'OverArm',
]);

export interface LateralEnvelope {
  /** Ring heights, sorted descending (same units as the source rings). */
  heights: number[];
  /** Lateral half-width from the body axis at each height. */
  extents: number[];
  /** Scalar fallback when no rings are available. */
  fallback: number;
}

/**
 * Build the lateral envelope from ring cardinals. Works in any unit
 * (raw mm or normalized unit-height) as long as rings and axisCX agree.
 */
export function computeLateralEnvelope(
  rings: readonly LandmarkRing[],
  axisCX: number,
  fallback: number,
): LateralEnvelope {
  const heights: number[] = [];
  const extents: number[] = [];
  for (const ring of rings) {
    if (ENVELOPE_EXCLUDED_RINGS.has(ring.name)) continue;
    const extent = Math.max(
      Math.abs(ring.left.x - axisCX),
      Math.abs(ring.right.x - axisCX),
    );
    if (!(extent > 0)) continue;
    heights.push(ring.height);
    extents.push(extent);
  }
  return { heights, extents, fallback };
}

/**
 * Body half-width at a given height, linearly interpolated between rings
 * and clamped to the nearest ring beyond the ends. Leg rings are per-leg,
 * so left and right rings at the same height both resolve to the outer
 * silhouette — the max of the pair wins via the per-ring extent above.
 */
export function envelopeExtentAt(env: LateralEnvelope, y: number): number {
  const n = env.heights.length;
  if (n === 0) return env.fallback;
  if (y >= env.heights[0]) return env.extents[0];
  if (y <= env.heights[n - 1]) return env.extents[n - 1];
  for (let i = 0; i < n - 1; i++) {
    const hi = env.heights[i];
    const lo = env.heights[i + 1];
    if (y <= hi && y >= lo) {
      const t = hi > lo ? (y - lo) / (hi - lo) : 0;
      return env.extents[i + 1] + t * (env.extents[i] - env.extents[i + 1]);
    }
  }
  return env.fallback;
}

/** Determine which non-lateral segment owns a given normalized-Y height. */
function getSegmentForHeight(normalizedY: number): SegmentId {
  for (const seg of SEGMENTS) {
    if (seg.isLateral) continue;
    if (normalizedY >= seg.yRange[0] && normalizedY <= seg.yRange[1]) {
      return seg.id;
    }
  }
  if (normalizedY > 0.82) return 'shoulders';
  return 'calves';
}

/** Find the two closest rings (above/below) for a given raw-mm Y height. */
function findBoundingRings(
  y: number,
  rings: LandmarkRing[],
): { aboveIdx: number; belowIdx: number; weight: number } {
  if (rings.length === 0) return { aboveIdx: 0, belowIdx: 0, weight: 0 };
  if (y >= rings[0].height) return { aboveIdx: 0, belowIdx: 0, weight: 1 };
  if (y <= rings[rings.length - 1].height) {
    const last = rings.length - 1;
    return { aboveIdx: last, belowIdx: last, weight: 0 };
  }
  for (let i = 0; i < rings.length - 1; i++) {
    if (y <= rings[i].height && y >= rings[i + 1].height) {
      const range = rings[i].height - rings[i + 1].height;
      const weight = range > 0 ? (y - rings[i + 1].height) / range : 0;
      return { aboveIdx: i, belowIdx: i + 1, weight };
    }
  }
  return { aboveIdx: 0, belowIdx: rings.length - 1, weight: 0.5 };
}

/** Detect transition-zone membership between adjacent non-lateral segments. */
function checkTransitionZone(
  normalizedY: number,
  segmentId: SegmentId,
): { blendWeight: number; blendSegmentId: SegmentId | null } {
  const seg = SEGMENTS.find((s) => s.id === segmentId);
  if (!seg || seg.isLateral) return { blendWeight: 0, blendSegmentId: null };

  const distToLower = normalizedY - seg.yRange[0];
  if (distToLower >= 0 && distToLower < TRANSITION_ZONE) {
    const belowSeg = SEGMENTS.find((s) => !s.isLateral && s.yRange[1] === seg.yRange[0]);
    if (belowSeg) {
      return {
        blendWeight: 1 - distToLower / TRANSITION_ZONE,
        blendSegmentId: belowSeg.id,
      };
    }
  }

  const distToUpper = seg.yRange[1] - normalizedY;
  if (distToUpper >= 0 && distToUpper < TRANSITION_ZONE) {
    const aboveSeg = SEGMENTS.find((s) => !s.isLateral && s.yRange[0] === seg.yRange[1]);
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
 * Classify all mesh vertices into one of the 8 body segments.
 *
 * Arm classification uses elbow Y-heights (real landmarks preferred,
 * Y-fraction heuristic as fallback) to split upper arms from forearms.
 * Non-arm classification uses ring-owned segment lookup.
 *
 * @param positions     Float32Array of vertex positions (x,y,z) in raw mm.
 * @param rings         Landmark rings, sorted highest-first (raw mm).
 * @param armThreshold  X-distance threshold for arm classification (mm).
 * @param armRefs       Per-side elbow/wrist/armpit reference Y-heights (mm).
 */
/** Ring names that belong to arms rather than the torso/legs. */
const ARM_RING_NAMES: ReadonlySet<string> = new Set([
  'ElbowLeftArm',
  'ElbowRightArm',
  'WristLeftArm',
  'WristRightArm',
]);

export function classifyVertices(
  positions: Float32Array,
  rings: LandmarkRing[],
  armThreshold: number,
  armRefs?: ArmReferencePoints,
): VertexBinding[] {
  const vertexCount = positions.length / 3;
  const bindings: VertexBinding[] = new Array(vertexCount);

  const centerX =
    rings.length > 0
      ? rings.reduce((s, r) => s + r.center.x, 0) / rings.length
      : 0;

  const ankleRing = rings.find((r) => r.name.includes('Ankle'));
  const ankleHeight = ankleRing ? ankleRing.height : 80;

  // Non-arm vertices must not bind to elbow/wrist rings — those rings have
  // very low sensitivity and would otherwise create visible "dead bands" at
  // the elbow/wrist Y on the torso. Build a filtered ring list and map each
  // index back to the global rings array.
  const nonArmRings: LandmarkRing[] = [];
  const nonArmToGlobal: number[] = [];
  for (let i = 0; i < rings.length; i++) {
    if (!ARM_RING_NAMES.has(rings[i].name)) {
      nonArmRings.push(rings[i]);
      nonArmToGlobal.push(i);
    }
  }

  // Body height range for normalizing Y to 0-1.
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const y = positions[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bodyHeight = maxY - minY;
  const normalizeY = bodyHeight > 0 ? (y: number) => (y - minY) / bodyHeight : () => 0;

  // Y-aware silhouette envelope: a vertex is an arm candidate only when it
  // sits laterally beyond the body surface AT ITS OWN HEIGHT, not beyond a
  // single bust-derived width (which misclassified wide hips/thighs as arm).
  const envelope = computeLateralEnvelope(rings, centerX, armThreshold);

  // ─── Pass 1: detect arm-candidate vertices + their per-side Y range ───
  // Per-side Y range is only used if real elbow landmarks are missing.
  const armSideOf = new Int8Array(vertexCount); // 0 = not arm, 1 = left (body-left, x > centerX), -1 = right
  let leftLoY = Infinity;
  let leftHiY = -Infinity;
  let rightLoY = Infinity;
  let rightHiY = -Infinity;

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const xDist = Math.abs(x - centerX);
    const armEdge = envelopeExtentAt(envelope, y) * ENVELOPE_ARM_MARGIN;
    if (xDist > armEdge && y > ankleHeight) {
      if (x > centerX) {
        armSideOf[i] = 1;
        if (y < leftLoY) leftLoY = y;
        if (y > leftHiY) leftHiY = y;
      } else {
        armSideOf[i] = -1;
        if (y < rightLoY) rightLoY = y;
        if (y > rightHiY) rightHiY = y;
      }
    }
  }

  // ─── Per-side elbow Y thresholds ───
  const leftElbowY =
    armRefs?.leftElbowY ??
    (Number.isFinite(leftLoY) && leftHiY > leftLoY
      ? leftLoY + ELBOW_Y_FRACTION_FALLBACK * (leftHiY - leftLoY)
      : 0);
  const rightElbowY =
    armRefs?.rightElbowY ??
    (Number.isFinite(rightLoY) && rightHiY > rightLoY
      ? rightLoY + ELBOW_Y_FRACTION_FALLBACK * (rightHiY - rightLoY)
      : 0);

  if (armRefs && (armRefs.leftElbowY === null || armRefs.rightElbowY === null)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[segmentClassifier] Missing elbow landmark(s) for scan; ' +
        'using 44% Y-fraction heuristic. Arm sub-classification accuracy may be reduced.',
    );
  }

  // ─── Pass 2: classify every vertex ───
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const ny = normalizeY(y);
    const armSide = armSideOf[i];
    let segmentId: SegmentId;
    let armSideLabel: 'left' | 'right' | undefined;

    if (armSide !== 0) {
      const elbowY = armSide === 1 ? leftElbowY : rightElbowY;
      segmentId = y > elbowY ? 'upper_arms' : 'forearms';
      armSideLabel = armSide === 1 ? 'left' : 'right';
    } else {
      segmentId = getSegmentForHeight(ny);
    }

    // Arm vertices bind against the full (arm-inclusive) ring list; non-arm
    // vertices bind against the arm-filtered list so they don't get their
    // sensitivity dragged to 0 by a nearby elbow/wrist ring.
    let aboveIdx: number;
    let belowIdx: number;
    let weight: number;
    if (armSide !== 0) {
      const r = findBoundingRings(y, rings);
      aboveIdx = r.aboveIdx;
      belowIdx = r.belowIdx;
      weight = r.weight;
    } else if (nonArmRings.length > 0) {
      const r = findBoundingRings(y, nonArmRings);
      aboveIdx = nonArmToGlobal[r.aboveIdx];
      belowIdx = nonArmToGlobal[r.belowIdx];
      weight = r.weight;
    } else {
      const r = findBoundingRings(y, rings);
      aboveIdx = r.aboveIdx;
      belowIdx = r.belowIdx;
      weight = r.weight;
    }

    const ringCenter =
      rings.length > 0
        ? weight >= 0.5
          ? rings[aboveIdx].center
          : rings[belowIdx].center
        : { x: 0, y: 0, z: 0 };

    const dx = x - ringCenter.x;
    const dz = z - ringCenter.z;
    const radialAngle = Math.atan2(dz, dx);
    const radialDistance = Math.sqrt(dx * dx + dz * dz);

    const { blendWeight, blendSegmentId } =
      armSide !== 0
        ? { blendWeight: 0, blendSegmentId: null as SegmentId | null }
        : checkTransitionZone(ny, segmentId);

    bindings[i] = {
      segmentId,
      armSide: armSideLabel,
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
