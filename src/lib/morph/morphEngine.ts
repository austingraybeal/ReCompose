import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import type { SMPLConstraints } from '@/lib/smpl/constraints';
import { smplSensitivity } from '@/lib/smpl/constraints';
import { ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/** Scale factor limits to keep the body humanoid */
const MIN_SCALE = 0.82;
const MAX_SCALE = 1.60;

/**
 * Damping factor for segment override sliders.
 * With slider range -50 to +50, this yields max ±17.5% radial change.
 */
const SEGMENT_OVERRIDE_STRENGTH = 0.35;

/** Y height below which per-leg centers are used (normalized 0-1) */
const LEG_SPLIT_Y = 0.36;
/** Blend zone from per-leg centers to body center axis */
const LEG_BLEND_LOW = 0.32;
const LEG_BLEND_HIGH = 0.43;

/**
 * Smooth sensitivity profile. Returns how much a region changes per 1% BF.
 * Uses overlapping Gaussians with a base floor so the entire body responds.
 *
 * When SMPL constraints are available, we modulate the hand-tuned curve
 * with SMPL's learned relative pattern to shift fat distribution toward
 * male or female patterns without killing the overall magnitude.
 */
function sensitivity(y: number, constraints?: SMPLConstraints | null): number {
  const BASE = 0.20;

  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));

  const handTuned = BASE
    + g(0.54, 0.10, 0.92)   // waist/belly — primary fat depot
    + g(0.44, 0.09, 0.70)   // hips
    + g(0.63, 0.08, 0.52)   // bust/chest
    + g(0.33, 0.10, 0.55)   // upper thighs
    + g(0.18, 0.12, 0.25)   // calves
    + g(0.73, 0.09, 0.32);  // upper chest/shoulders

  if (!constraints) return handTuned;

  const smplSens = smplSensitivity(constraints, y);
  const smplFactor = 1 + smplSens * 5; // Gentle modulation: ±25% shift

  return handTuned * smplFactor;
}

/**
 * Gaussian-blended segment override at normalized Y height.
 * Returns the damped weighted-average of segment override values.
 */
function blendedSegmentOverride(y: number, overrides: SegmentOverrides): number {
  let totalWeight = 0;
  let blendedValue = 0;

  for (const seg of SEGMENTS) {
    if (seg.isLateral) continue;
    const dist = y - seg.yCenter;
    const w = Math.exp(-(dist * dist) / (2 * seg.sigma * seg.sigma));
    if (w > 0.001) {
      blendedValue += overrides[seg.id] * w;
      totalWeight += w;
    }
  }

  // Damp so +50 slider ≈ +17.5% radial change, not +50%
  return totalWeight > 0 ? (blendedValue / totalWeight) * SEGMENT_OVERRIDE_STRENGTH : 0;
}

/**
 * Directional scaling: front expands slightly more than back.
 */
function directionalScale(dx: number, dz: number, scale: number): number {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.0001) return scale;
  const zNorm = dz / dist;
  const mult = zNorm >= 0 ? 1.0 + 0.08 * zNorm : 1.0 + 0.05 * zNorm;
  return scale * mult;
}

/**
 * Laplacian smoothing pass — smooths X and Z, preserves Y.
 */
function laplacianSmooth(
  positions: Float32Array,
  originalPositions: Float32Array,
  adjacency: Uint32Array[],
  iterations: number,
  lambda: number
): void {
  const vertexCount = positions.length / 3;
  const temp = new Float32Array(positions.length);

  for (let iter = 0; iter < iterations; iter++) {
    temp.set(positions);

    for (let i = 0; i < vertexCount; i++) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) continue;

      let avgX = 0, avgZ = 0;
      for (let j = 0; j < neighbors.length; j++) {
        const ni = neighbors[j];
        avgX += temp[ni * 3];
        avgZ += temp[ni * 3 + 2];
      }
      avgX /= neighbors.length;
      avgZ /= neighbors.length;

      positions[i * 3] = temp[i * 3] + lambda * (avgX - temp[i * 3]);
      positions[i * 3 + 1] = temp[i * 3 + 1]; // preserve Y
      positions[i * 3 + 2] = temp[i * 3 + 2] + lambda * (avgZ - temp[i * 3 + 2]);
    }
  }
}

/**
 * Main deformation function.
 *
 * Key improvements:
 * - Per-leg scaling centers to eliminate inner-thigh holes
 * - Damped segment overrides to prevent extreme warping from sliders
 * - Reduced Laplacian smoothing to preserve deformation magnitude
 * - SMPL-modulated sensitivity when constraints are available
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[],
  constraints?: SMPLConstraints | null
): void {
  // Compute center axis from ring centers
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  const vertexCount = originalPositions.length / 3;

  // ── Compute arm centers (left and right) ──
  let lArmX = 0, lArmZ = 0, lArmN = 0;
  let rArmX = 0, rArmZ = 0, rArmN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lArmX += ox; lArmZ += originalPositions[i * 3 + 2]; lArmN++; }
    else { rArmX += ox; rArmZ += originalPositions[i * 3 + 2]; rArmN++; }
  }
  const leftArmCX = lArmN > 0 ? lArmX / lArmN : axisCX - 0.12;
  const leftArmCZ = lArmN > 0 ? lArmZ / lArmN : axisCZ;
  const rightArmCX = rArmN > 0 ? rArmX / rArmN : axisCX + 0.12;
  const rightArmCZ = rArmN > 0 ? rArmZ / rArmN : axisCZ;

  // ── Compute leg centers (left and right) ──
  // Uses non-arm vertices below LEG_SPLIT_Y to find each leg's centroid.
  // This allows legs to scale from their own axis instead of the body center,
  // preventing holes between the inner thighs.
  let lLegX = 0, lLegZ = 0, lLegN = 0;
  let rLegX = 0, rLegZ = 0, rLegN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId === 'arms') continue;
    const oy = originalPositions[i * 3 + 1];
    if (oy > LEG_SPLIT_Y) continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lLegX += ox; lLegZ += originalPositions[i * 3 + 2]; lLegN++; }
    else { rLegX += ox; rLegZ += originalPositions[i * 3 + 2]; rLegN++; }
  }
  const leftLegCX = lLegN > 0 ? lLegX / lLegN : axisCX - 0.06;
  const leftLegCZ = lLegN > 0 ? lLegZ / lLegN : axisCZ;
  const rightLegCX = rLegN > 0 ? rLegX / rLegN : axisCX + 0.06;
  const rightLegCZ = rLegN > 0 ? rLegZ / rLegN : axisCZ;

  // ── Pre-compute arm scale ──
  const armOverrideDamped = overrides.arms * SEGMENT_OVERRIDE_STRENGTH
    + overrides.shoulders * SEGMENT_OVERRIDE_STRENGTH * 0.5;
  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (armOverrideDamped / 100);
  const armScaleBase = Math.max(MIN_SCALE, Math.min(MAX_SCALE, armGlobal * armRegional));

  // ── Phase 1: Radial displacement ──
  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    if (!binding) {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
      continue;
    }

    let cx: number, cz: number, combinedScale: number;

    if (binding.segmentId === 'arms') {
      // ── ARM VERTEX ──
      const isLeft = ox < axisCX;
      const armCX = isLeft ? leftArmCX : rightArmCX;
      const armCZ = isLeft ? leftArmCZ : rightArmCZ;

      // Junction blend: 0 at y≤0.58 (arm), 1 at y≥0.68 (torso)
      const junctionBlend = Math.min(1, Math.max(0, (oy - 0.58) / 0.10));
      cx = armCX + junctionBlend * (axisCX - armCX);
      cz = armCZ + junctionBlend * (axisCZ - armCZ);

      // Blend arm scale toward torso scale at junction
      const torsoSens = sensitivity(oy, constraints);
      const torsoGS = 1 + (deltaBodyFat * torsoSens / 100);
      const torsoOverride = blendedSegmentOverride(oy, overrides);
      const torsoRS = 1 + torsoOverride / 100;
      const torsoScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, torsoGS * torsoRS));
      combinedScale = armScaleBase + junctionBlend * (torsoScale - armScaleBase);
    } else {
      // ── NON-ARM VERTEX ──
      const sens = sensitivity(oy, constraints);
      const globalScale = 1 + (deltaBodyFat * sens / 100);
      const overrideValue = blendedSegmentOverride(oy, overrides);
      const regionalScale = 1 + overrideValue / 100;
      combinedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, globalScale * regionalScale));

      // Choose scaling center based on Y height:
      //   Below LEG_BLEND_LOW → per-leg center (fixes inner-thigh holes)
      //   Above LEG_BLEND_HIGH → body center axis
      //   Between → smoothstep blend
      if (oy < LEG_BLEND_LOW) {
        const isLeft = ox < axisCX;
        cx = isLeft ? leftLegCX : rightLegCX;
        cz = isLeft ? leftLegCZ : rightLegCZ;
      } else if (oy < LEG_BLEND_HIGH) {
        const t = (oy - LEG_BLEND_LOW) / (LEG_BLEND_HIGH - LEG_BLEND_LOW);
        const blend = t * t * (3 - 2 * t); // smoothstep
        const isLeft = ox < axisCX;
        const legCX = isLeft ? leftLegCX : rightLegCX;
        const legCZ = isLeft ? leftLegCZ : rightLegCZ;
        cx = legCX + blend * (axisCX - legCX);
        cz = legCZ + blend * (axisCZ - legCZ);
      } else {
        cx = axisCX;
        cz = axisCZ;
      }
    }

    // Radial displacement from chosen center
    const dx = ox - cx;
    const dz = oz - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.0001) {
      const finalScale = directionalScale(dx, dz, combinedScale);
      positions[i * 3] = cx + dx * finalScale;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = cz + dz * finalScale;
    } else {
      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = oz;
    }
  }

  // ── Phase 2: Laplacian smoothing ──
  // Reduced intensity to preserve deformation magnitude while still
  // smoothing sharp edges at segment boundaries.
  if (adjacency && adjacency.length === vertexCount) {
    const deformMagnitude = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 4;
    const iterations = deformMagnitude > 20 ? 4 : deformMagnitude > 10 ? 3 : 2;
    const lambda = 0.35;
    laplacianSmooth(positions, originalPositions, adjacency, iterations, lambda);
  }
}
