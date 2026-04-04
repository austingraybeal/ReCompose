/**
 * Hybrid Morph Engine — combines SMPL-derived displacement fields with
 * anatomical fat depot modeling and per-segment radial control for
 * realistic body composition visualization.
 *
 * When SMPL data is available:
 *   1. Maps UI parameters → SMPL betas via parameterMapper
 *   2. Samples displacement field for each vertex (primary deformation)
 *   3. Applies per-segment radial scaling from segment overrides
 *   4. Layers anatomical fat depot displacements on top
 *   5. Applies gravity-aware soft tissue sag
 *   6. Runs Laplacian smoothing
 *
 * When SMPL data is NOT available:
 *   Falls back to the radial deformation approach from morphEngine.ts
 */

import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import type { DisplacementField } from '@/lib/smpl/displacementField';
import type { SMPLConstraints } from '@/lib/smpl/constraints';
import { sampleDisplacement } from '@/lib/smpl/displacementField';
import { smplSensitivity, smplScaleLimits } from '@/lib/smpl/constraints';
import { mapToBetas } from '@/lib/smpl/parameterMapper';
import { computeDepotDisplacement, SAG_COEFFICIENTS } from './fatDepots';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

// ════════════════════════════════════════════════════════════════
// Fallback constants (used when SMPL constraints are not loaded)
// ════════════════════════════════════════════════════════════════

const FALLBACK_MIN_SCALE = 0.82;
const FALLBACK_MAX_SCALE = 1.65;
const SEGMENT_OVERRIDE_STRENGTH = 0.35;
const ARM_SENSITIVITY = 0.55;
const LEG_BLEND_LOW = 0.32;
const LEG_BLEND_HIGH = 0.44;

// ════════════════════════════════════════════════════════════════
// Pre-allocated buffers
// ════════════════════════════════════════════════════════════════

const _depotDisp: [number, number, number] = [0, 0, 0];
let _cachedBetas: Float32Array | null = null;
let _cachedBetasCount = 0;

// ════════════════════════════════════════════════════════════════
// Crotch dampening for SMPL displacement field
// ════════════════════════════════════════════════════════════════

/**
 * Dampen SMPL displacement in the crotch zone to prevent gender-specific
 * geometry from the SMPL template leaking into the scan mesh.
 */
function dampenSmplCrotch(
  normalizedY: number,
  centerDistX: number,
  dx: number,
  dz: number
): [number, number] {
  if (normalizedY > 0.48 || normalizedY < 0.30) return [dx, dz];
  if (centerDistX > 0.06) return [dx, dz];

  const crotchCenter = 0.39;
  const crotchSigma = 0.05;
  const dampen = Math.exp(-((normalizedY - crotchCenter) ** 2) / (2 * crotchSigma * crotchSigma));
  const factor = 1 - dampen * 0.90;
  return [dx * factor, dz * factor];
}

// ════════════════════════════════════════════════════════════════
// Fallback sensitivity (from morphEngine.ts)
// ════════════════════════════════════════════════════════════════

function fallbackSensitivity(y: number): number {
  const BASE = 0.22;
  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  return BASE
    + g(0.53, 0.08, 1.00)
    + g(0.44, 0.07, 0.72)
    + g(0.62, 0.06, 0.50)
    + g(0.34, 0.08, 0.58)
    + g(0.22, 0.10, 0.22)
    + g(0.72, 0.07, 0.30);
}

// ════════════════════════════════════════════════════════════════
// Fallback directional scale (from morphEngine.ts)
// ════════════════════════════════════════════════════════════════

function directionalScale(y: number, zDir: number, xDir: number, scale: number): number {
  const delta = scale - 1;
  if (Math.abs(delta) < 0.005) return scale;

  const g = (c: number, s: number, p: number) =>
    p * Math.exp(-((y - c) ** 2) / (2 * s * s));

  const bellyBias = g(0.53, 0.07, 0.35) + g(0.48, 0.06, 0.25);
  const bustBias = g(0.62, 0.05, 0.18);
  const thighBias = g(0.34, 0.06, 0.12);
  const frontBias = bellyBias + bustBias + thighBias;

  const hipLateral = g(0.44, 0.06, 0.20);
  const thighLateral = g(0.33, 0.07, 0.12);
  const lateralBias = hipLateral + thighLateral;

  const backDamp = g(0.53, 0.10, 0.15);

  let mult = 1.0;
  if (zDir > 0) {
    mult += frontBias * zDir;
  } else {
    mult += backDamp * zDir;
  }
  mult += lateralBias * xDir;

  return 1.0 + delta * mult;
}

// ════════════════════════════════════════════════════════════════
// Segment override blending — used by BOTH paths
// ════════════════════════════════════════════════════════════════

/**
 * Compute a blended segment override value at a given normalized Y height.
 * Uses Gaussian blending across all segment centers.
 * Returns a value that should be used as a radial scale factor.
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
  return totalWeight > 0 ? (blendedValue / totalWeight) * SEGMENT_OVERRIDE_STRENGTH : 0;
}

// ════════════════════════════════════════════════════════════════
// Laplacian smoothing
// ════════════════════════════════════════════════════════════════

function laplacianSmooth(
  positions: Float32Array,
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
        avgX += temp[neighbors[j] * 3];
        avgZ += temp[neighbors[j] * 3 + 2];
      }
      avgX /= neighbors.length;
      avgZ /= neighbors.length;
      positions[i * 3] += lambda * (avgX - positions[i * 3]);
      positions[i * 3 + 2] += lambda * (avgZ - positions[i * 3 + 2]);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// Center helpers
// ════════════════════════════════════════════════════════════════

function computeArmCenters(
  originalPositions: Float32Array, bindings: VertexBinding[], vertexCount: number, axisCX: number, axisCZ: number
) {
  let lX = 0, lZ = 0, lN = 0, rX = 0, rZ = 0, rN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lX += ox; lZ += originalPositions[i * 3 + 2]; lN++; }
    else { rX += ox; rZ += originalPositions[i * 3 + 2]; rN++; }
  }
  return {
    leftCX: lN > 0 ? lX / lN : axisCX - 0.12, leftCZ: lN > 0 ? lZ / lN : axisCZ,
    rightCX: rN > 0 ? rX / rN : axisCX + 0.12, rightCZ: rN > 0 ? rZ / rN : axisCZ,
  };
}

function computeLegCenters(
  originalPositions: Float32Array, bindings: VertexBinding[], vertexCount: number, axisCX: number, axisCZ: number
) {
  let lX = 0, lZ = 0, lN = 0, rX = 0, rZ = 0, rN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId === 'arms') continue;
    const oy = originalPositions[i * 3 + 1];
    if (oy > 0.36) continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lX += ox; lZ += originalPositions[i * 3 + 2]; lN++; }
    else { rX += ox; rZ += originalPositions[i * 3 + 2]; rN++; }
  }
  return {
    leftCX: lN > 0 ? lX / lN : axisCX - 0.06, leftCZ: lN > 0 ? lZ / lN : axisCZ,
    rightCX: rN > 0 ? rX / rN : axisCX + 0.06, rightCZ: rN > 0 ? rZ / rN : axisCZ,
  };
}

// ════════════════════════════════════════════════════════════════
// Main hybrid deformation
// ════════════════════════════════════════════════════════════════

/**
 * Deform the scan mesh using SMPL displacement fields (when available)
 * with per-segment radial control, anatomical fat depot overlays, and
 * gravity sag. Falls back to radial deformation when SMPL is unavailable.
 */
export function deformMeshHybrid(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency: Uint32Array[] | undefined,
  displacementField: DisplacementField | null,
  constraints: SMPLConstraints | null,
  componentCount: number
): void {
  const vertexCount = originalPositions.length / 3;
  const useSMPL = displacementField !== null;

  // Body center axis
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  // Compute betas when SMPL available
  let betas: Float32Array | null = null;
  if (useSMPL) {
    if (_cachedBetasCount !== componentCount) {
      _cachedBetas = new Float32Array(componentCount);
      _cachedBetasCount = componentCount;
    }
    // mapToBetas uses ONLY deltaBodyFat for SMPL (not segment overrides for betas —
    // segment overrides are handled separately via radial scaling below)
    const zeroed: SegmentOverrides = { shoulders: 0, arms: 0, torso: 0, waist: 0, hips: 0, legs: 0 };
    betas = mapToBetas(deltaBodyFat, zeroed, componentCount);
    _cachedBetas!.set(betas);
    betas = _cachedBetas!;
  }

  // Check if ANY segment override is non-zero
  const hasOverrides = Object.values(overrides).some(v => Math.abs(v) > 0.01);

  // Arm/leg centers
  const arms = computeArmCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);
  const legs = computeLegCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);

  // Fallback arm scale
  const armOvDamped = (overrides.arms + overrides.shoulders * 0.5) * SEGMENT_OVERRIDE_STRENGTH;
  const fallbackArmScale = Math.max(FALLBACK_MIN_SCALE, Math.min(FALLBACK_MAX_SCALE,
    (1 + deltaBodyFat * ARM_SENSITIVITY / 100) * (1 + armOvDamped / 100)));

  // ── Per-vertex deformation ──
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

    if (useSMPL && betas !== null) {
      // ═══════════════════════════════════════════════════════════
      // SMPL-based deformation path
      // ═══════════════════════════════════════════════════════════

      // 1. Sample SMPL displacement field
      let [sdx, sdy, sdz] = sampleDisplacement(
        displacementField!, betas, oy, ox, oz, axisCX, axisCZ
      );

      // 1b. Crotch dampening on SMPL displacement
      const cDistX = Math.abs(ox - axisCX);
      [sdx, sdz] = dampenSmplCrotch(oy, cDistX, sdx, sdz);

      let nx = ox + sdx;
      let ny = oy + sdy;
      let nz = oz + sdz;

      // 2. Per-segment radial scaling from segment overrides
      //    This is what makes the segment sliders actually work in SMPL mode
      if (hasOverrides) {
        const segOv = blendedSegmentOverride(oy, overrides);
        if (Math.abs(segOv) > 0.01) {
          const segScale = 1 + segOv / 100;

          // Determine radial center (same logic as fallback)
          let cx: number, cz: number;
          if (binding.segmentId === 'arms') {
            const isLeft = ox < axisCX;
            const armCX = isLeft ? arms.leftCX : arms.rightCX;
            const armCZ = isLeft ? arms.leftCZ : arms.rightCZ;
            const jb = Math.min(1, Math.max(0, (oy - 0.58) / 0.10));
            cx = armCX + jb * (axisCX - armCX);
            cz = armCZ + jb * (axisCZ - armCZ);
          } else if (oy < LEG_BLEND_LOW) {
            const isLeft = ox < axisCX;
            cx = isLeft ? legs.leftCX : legs.rightCX;
            cz = isLeft ? legs.leftCZ : legs.rightCZ;
          } else if (oy < LEG_BLEND_HIGH) {
            const t = (oy - LEG_BLEND_LOW) / (LEG_BLEND_HIGH - LEG_BLEND_LOW);
            const bl = t * t * (3 - 2 * t);
            const isLeft = ox < axisCX;
            cx = (isLeft ? legs.leftCX : legs.rightCX) + bl * (axisCX - (isLeft ? legs.leftCX : legs.rightCX));
            cz = (isLeft ? legs.leftCZ : legs.rightCZ) + bl * (axisCZ - (isLeft ? legs.leftCZ : legs.rightCZ));
          } else {
            cx = axisCX;
            cz = axisCZ;
          }

          // Scale radially from center
          const rdx = nx - cx;
          const rdz = nz - cz;
          nx = cx + rdx * segScale;
          nz = cz + rdz * segScale;
        }

        // Arm-specific override (arms have their own flat sensitivity)
        if (binding.segmentId === 'arms' && Math.abs(overrides.arms) > 0.01) {
          const isLeft = ox < axisCX;
          const armCX = isLeft ? arms.leftCX : arms.rightCX;
          const armCZ = isLeft ? arms.leftCZ : arms.rightCZ;
          const armScale = 1 + overrides.arms * SEGMENT_OVERRIDE_STRENGTH / 100;
          const adx = nx - armCX;
          const adz = nz - armCZ;
          nx = armCX + adx * armScale;
          nz = armCZ + adz * armScale;
        }
      }

      // 3. Layer fat depot displacements
      const dx = ox - axisCX;
      const dz = oz - axisCZ;
      const radialDist = Math.sqrt(dx * dx + dz * dz);
      const vertAngle = Math.atan2(dz, dx);
      const isArm = binding.segmentId === 'arms';
      const isLeftSide = ox < axisCX;

      computeDepotDisplacement(
        deltaBodyFat, oy, vertAngle, radialDist, isArm, isLeftSide, cDistX, overrides, _depotDisp
      );

      nx += _depotDisp[0];
      ny += _depotDisp[1];
      nz += _depotDisp[2];

      // 4. Gravity sag
      const sagCoeff = SAG_COEFFICIENTS[binding.segmentId] ?? 0.00002;
      const absDelta = Math.abs(deltaBodyFat);
      const isLowerHalf = oy < 0.5;
      ny += -sagCoeff * absDelta * radialDist * (isLowerHalf ? 1.0 : 0.3);

      positions[i * 3] = nx;
      positions[i * 3 + 1] = ny;
      positions[i * 3 + 2] = nz;
    } else {
      // ═══════════════════════════════════════════════════════════
      // Fallback radial deformation (from morphEngine.ts)
      // ═══════════════════════════════════════════════════════════

      let cx: number, cz: number, baseScale: number;

      const useSMPLConstraints = constraints !== null;
      const minScale = useSMPLConstraints ? smplScaleLimits(constraints!, oy)[0] : FALLBACK_MIN_SCALE;
      const maxScale = useSMPLConstraints ? smplScaleLimits(constraints!, oy)[1] : FALLBACK_MAX_SCALE;

      if (binding.segmentId === 'arms') {
        const isLeft = ox < axisCX;
        const armCX = isLeft ? arms.leftCX : arms.rightCX;
        const armCZ = isLeft ? arms.leftCZ : arms.rightCZ;
        const jb = Math.min(1, Math.max(0, (oy - 0.58) / 0.10));
        cx = armCX + jb * (axisCX - armCX);
        cz = armCZ + jb * (axisCZ - armCZ);

        const tSens = useSMPLConstraints ? smplSensitivity(constraints!, oy) : fallbackSensitivity(oy);
        const tOv = blendedSegmentOverride(oy, overrides);
        const torsoS = Math.max(minScale, Math.min(maxScale,
          (1 + deltaBodyFat * tSens / 100) * (1 + tOv / 100)));
        baseScale = fallbackArmScale + jb * (torsoS - fallbackArmScale);
      } else {
        const sens = useSMPLConstraints ? smplSensitivity(constraints!, oy) : fallbackSensitivity(oy);
        const ov = blendedSegmentOverride(oy, overrides);
        baseScale = Math.max(minScale, Math.min(maxScale,
          (1 + deltaBodyFat * sens / 100) * (1 + ov / 100)));

        if (oy < LEG_BLEND_LOW) {
          const isLeft = ox < axisCX;
          cx = isLeft ? legs.leftCX : legs.rightCX;
          cz = isLeft ? legs.leftCZ : legs.rightCZ;
        } else if (oy < LEG_BLEND_HIGH) {
          const t = (oy - LEG_BLEND_LOW) / (LEG_BLEND_HIGH - LEG_BLEND_LOW);
          const bl = t * t * (3 - 2 * t);
          const isLeft = ox < axisCX;
          const legCX = isLeft ? legs.leftCX : legs.rightCX;
          const legCZ = isLeft ? legs.leftCZ : legs.rightCZ;
          cx = legCX + bl * (axisCX - legCX);
          cz = legCZ + bl * (axisCZ - legCZ);
        } else {
          cx = axisCX;
          cz = axisCZ;
        }
      }

      const dx = ox - cx;
      const dz = oz - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.0001) {
        const zDir = dz / dist;
        const xDir = Math.abs(dx / dist);
        const finalScale = directionalScale(oy, zDir, xDir, baseScale);

        positions[i * 3] = cx + dx * finalScale;
        positions[i * 3 + 1] = oy;
        positions[i * 3 + 2] = cz + dz * finalScale;
      } else {
        positions[i * 3] = ox;
        positions[i * 3 + 1] = oy;
        positions[i * 3 + 2] = oz;
      }
    }
  }

  // ── Laplacian smoothing ──
  if (adjacency && adjacency.length === vertexCount) {
    const mag = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 6;
    const iters = mag > 20 ? 3 : 2;
    laplacianSmooth(positions, adjacency, iters, 0.30);
  }
}
