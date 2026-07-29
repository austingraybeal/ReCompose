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
  /**
   * Lower bound on the returned extent (the Bust half-width). Without it,
   * the envelope dips toward the narrow Collar ring across the upper chest
   * and toward the waist rings beside the hanging arms — the arm/body flip
   * surface then intersects the chest and inner-arm surfaces, tearing
   * horizontal bands into them. The chest can never be narrower than the
   * bust, so flooring there is safe; the hips fix is unaffected because
   * hip extents exceed the bust width.
   */
  floor: number;
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
  let floor = 0;
  for (const ring of rings) {
    if (ENVELOPE_EXCLUDED_RINGS.has(ring.name)) continue;
    const extent = Math.max(
      Math.abs(ring.left.x - axisCX),
      Math.abs(ring.right.x - axisCX),
    );
    if (!(extent > 0)) continue;
    heights.push(ring.height);
    extents.push(extent);
    if (ring.name === 'Bust') floor = extent;
  }
  return { heights, extents, fallback, floor };
}

/**
 * Body half-width at a given height, linearly interpolated between rings
 * and clamped to the nearest ring beyond the ends. Leg rings are per-leg,
 * so left and right rings at the same height both resolve to the outer
 * silhouette — the max of the pair wins via the per-ring extent above.
 * Never returns less than the bust-width floor (see LateralEnvelope.floor).
 */
export function envelopeExtentAt(env: LateralEnvelope, y: number): number {
  const n = env.heights.length;
  if (n === 0) return env.fallback;
  let extent: number;
  if (y >= env.heights[0]) {
    extent = env.extents[0];
  } else if (y <= env.heights[n - 1]) {
    extent = env.extents[n - 1];
  } else {
    extent = env.fallback;
    for (let i = 0; i < n - 1; i++) {
      const hi = env.heights[i];
      const lo = env.heights[i + 1];
      if (y <= hi && y >= lo) {
        const t = hi > lo ? (y - lo) / (hi - lo) : 0;
        extent = env.extents[i + 1] + t * (env.extents[i] - env.extents[i + 1]);
        break;
      }
    }
  }
  return Math.max(extent, env.floor);
}

/**
 * Diffuse the per-vertex armness seed over the mesh adjacency graph.
 * Smoothing follows the actual surface, so the arm/torso transition
 * spreads gradually across the armpit where the regions genuinely meet,
 * and any residual sharp flip lines from the x-threshold seed dissolve.
 * Mutates bindings[i].armness in place. Runs once at scan load.
 */
export function smoothArmnessField(
  bindings: VertexBinding[],
  adjacency: Uint32Array[],
  iterations: number = 24,
): void {
  const n = bindings.length;
  if (!adjacency || adjacency.length !== n) return;
  let cur = new Float32Array(n);
  let next = new Float32Array(n);
  for (let i = 0; i < n; i++) cur[i] = bindings[i]?.armness ?? 0;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) {
        next[i] = cur[i];
        continue;
      }
      let sum = 0;
      for (let j = 0; j < neighbors.length; j++) sum += cur[neighbors[j]];
      next[i] = 0.5 * cur[i] + (0.5 * sum) / neighbors.length;
    }
    const tmp = cur;
    cur = next;
    next = tmp;
  }

  // Sharpen: commit mid-range values to the dominant side. Scan-bridge
  // triangles spanning the armpit air gap carry ~0.5 armness and would
  // otherwise position BETWEEN the torso and arm surfaces, standing off
  // the chest as tassels/fins whenever the two sides move. A narrowed
  // smooth band (0.25-0.75) keeps the junction blend but pins gap
  // geometry to one surface.
  for (let i = 0; i < n; i++) {
    if (!bindings[i]) continue;
    const t = Math.min(1, Math.max(0, (cur[i] - 0.25) / 0.5));
    bindings[i].armness = t * t * (3 - 2 * t);
  }
}

/**
 * Mark scan-bridge sliver vertices: any vertex with an incident edge much
 * longer than the mesh's median edge is part of stretched webbing spanning
 * an air gap (armpit, crotch). The engine re-settles these to their
 * neighbor average after deformation so they can never stand proud of the
 * surfaces as tassels/flaps. Returns the number of pinned vertices.
 * If a threshold pins an implausible fraction of the mesh (>3%), it is
 * raised and the pass re-run, so healthy dense scans are never damaged.
 */
export function markSeamBridges(
  bindings: VertexBinding[],
  adjacency: Uint32Array[],
  positions: Float32Array,
): number {
  const n = bindings.length;
  if (!adjacency || adjacency.length !== n) return 0;

  const edgeLengths: number[] = [];
  for (let i = 0; i < n; i += 7) {
    const neighbors = adjacency[i];
    if (!neighbors) continue;
    for (let j = 0; j < neighbors.length; j++) {
      const k = neighbors[j];
      if (k <= i) continue;
      const dx = positions[i * 3] - positions[k * 3];
      const dy = positions[i * 3 + 1] - positions[k * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[k * 3 + 2];
      edgeLengths.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  if (edgeLengths.length === 0) return 0;
  edgeLengths.sort((a, b) => a - b);
  const median = edgeLengths[Math.floor(edgeLengths.length / 2)];
  if (!(median > 0)) return 0;

  for (const factor of [4, 6, 9]) {
    const limit = median * factor;
    const limitSq = limit * limit;
    let pinned = 0;
    for (let i = 0; i < n; i++) {
      if (bindings[i]) bindings[i].seamPinned = false;
    }
    for (let i = 0; i < n; i++) {
      const neighbors = adjacency[i];
      if (!neighbors || !bindings[i]) continue;
      for (let j = 0; j < neighbors.length; j++) {
        const k = neighbors[j];
        const dx = positions[i * 3] - positions[k * 3];
        const dy = positions[i * 3 + 1] - positions[k * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[k * 3 + 2];
        if (dx * dx + dy * dy + dz * dz > limitSq) {
          bindings[i].seamPinned = true;
          pinned++;
          break;
        }
      }
    }
    if (pinned <= n * 0.03) return pinned;
  }
  return 0;
}

/**
 * Genuine arm surface sits within ARM_RADIUS_NOMINAL of its own axis
 * (~8cm on a 1750mm scan even at high BF); arm-classified geometry beyond
 * ARM_WEBBING_RADIUS (~12cm) is certainly scan webbing / chest-contact
 * skin. Shared by the engine (transform demotion) and the loader
 * (render-index filtering).
 */
export const ARM_RADIUS_NOMINAL = 0.05;
export const ARM_WEBBING_RADIUS = 0.075;

/**
 * Identify armpit-webbing vertices: arm-classified (armness > 0.3) but
 * sitting beyond any plausible arm surface's distance from the arm's own
 * skeleton axis. Used to drop their triangles from the RENDER index only —
 * positions, bindings, and the deformation pipeline are untouched.
 * Requires unit-space rings (Bust + per-side Elbow/Wrist arm rings);
 * returns an empty set when they are missing.
 */
export function findArmWebbingVertices(
  bindings: VertexBinding[],
  rings: readonly LandmarkRing[],
  positions: Float32Array,
): Set<number> {
  const out = new Set<number>();
  const n = bindings.length;
  if (n === 0 || rings.length === 0) return out;

  let axisCX = 0;
  for (const r of rings) axisCX += r.center.x;
  axisCX /= rings.length;

  const bust = rings.find((r) => r.name === 'Bust');
  if (!bust) return out;
  const sideRing = (names: string[], positive: boolean) =>
    rings.find(
      (r) => names.includes(r.name) && (positive ? r.center.x > axisCX : r.center.x <= axisCX),
    );
  const buildAxis = (positive: boolean) => {
    const elbow = sideRing(['ElbowLeftArm', 'ElbowRightArm'], positive);
    const wrist = sideRing(['WristLeftArm', 'WristRightArm'], positive);
    if (!elbow || !wrist) return null;
    const topX = positive === bust.left.x > axisCX ? bust.left : bust.right;
    return {
      ys: [bust.height, elbow.height, wrist.height],
      xs: [topX.x, elbow.center.x, wrist.center.x],
      zs: [topX.z, elbow.center.z, wrist.center.z],
    };
  };
  const axisPos = buildAxis(true);
  const axisNeg = buildAxis(false);
  if (!axisPos || !axisNeg) return out;

  const sample = (ax: NonNullable<typeof axisPos>, y: number) => {
    const { ys, xs, zs } = ax;
    if (y >= ys[0]) return { x: xs[0], z: zs[0] };
    const last = ys.length - 1;
    if (y <= ys[last]) return { x: xs[last], z: zs[last] };
    for (let k = 0; k < last; k++) {
      if (y <= ys[k] && y >= ys[k + 1]) {
        const t = ys[k] > ys[k + 1] ? (y - ys[k + 1]) / (ys[k] - ys[k + 1]) : 0;
        return {
          x: xs[k + 1] + t * (xs[k] - xs[k + 1]),
          z: zs[k + 1] + t * (zs[k] - zs[k + 1]),
        };
      }
    }
    return { x: xs[last], z: zs[last] };
  };

  // Conservative hide threshold: past the midpoint of the demotion band,
  // so genuine arm surface (<= ARM_RADIUS_NOMINAL) is never touched.
  const hideR = (ARM_RADIUS_NOMINAL + ARM_WEBBING_RADIUS) / 2 + 0.003;
  const hideRSq = hideR * hideR;
  for (let i = 0; i < n; i++) {
    const a = bindings[i]?.armness ?? 0;
    if (a <= 0.3) continue;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const ax = x < axisCX ? axisNeg : axisPos;
    const pnt = sample(ax, y);
    const dx = x - pnt.x;
    const dz = z - pnt.z;
    if (dx * dx + dz * dz > hideRSq) out.add(i);
  }
  return out;
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

    // Binary armness seed (0 = body, 1 = arm) matching Pass 1's decision.
    // Deliberately sharp: an x-space blend band here crosses real surfaces
    // (inner elbow, lateral calf) and leaves them permanently half-arm —
    // they then track waist/hip sensitivity and bulge into discs. The graph
    // diffusion in smoothArmnessField provides the smoothing instead, and
    // only across true mesh connectivity (the armpit junction).
    const armnessSeed = armSide !== 0 ? 1 : 0;
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
      armness: armnessSeed,
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
