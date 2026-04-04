/**
 * Hybrid Morph Engine — combines SMPL-derived displacement fields with
 * anatomical fat depot modeling for realistic body composition visualization.
 *
 * When SMPL data is available:
 *   1. Maps UI parameters → SMPL betas via parameterMapper
 *   2. Samples displacement field for each vertex (primary deformation)
 *   3. Layers anatomical fat depot displacements on top
 *   4. Applies gravity-aware soft tissue sag
 *   5. Runs Laplacian smoothing
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
// Pre-allocated buffers (avoid per-frame allocations)
// ════════════════════════════════════════════════════════════════

/** Reusable buffer for sampleDisplacement output */
let _smplDisp: [number, number, number] = [0, 0, 0];

/** Reusable buffer for depot displacement output */
const _depotDisp: [number, number, number] = [0, 0, 0];

/** Cached betas array — reallocated only when component count changes */
let _cachedBetas: Float32Array | null = null;
let _cachedBetasComponentCount = 0;

// ════════════════════════════════════════════════════════════════
// Fallback sensitivity (same as morphEngine.ts)
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
// Fallback directional scale (same as morphEngine.ts)
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
// Segment override blending
// ════════════════════════════════════════════════════════════════

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
// Laplacian smoothing (same as morphEngine.ts)
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
// Center computation helpers (same as morphEngine.ts)
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
// Main hybrid deformation entry point
// ════════════════════════════════════════════════════════════════

/**
 * Deform the scan mesh using SMPL displacement fields (when available)
 * with anatomical fat depot overlays and gravity sag, falling back to
 * the radial deformation approach when SMPL data is not loaded.
 *
 * @param positions         - Mutable vertex positions to write to
 * @param originalPositions - Original undeformed vertex positions
 * @param bindings          - Per-vertex segment bindings
 * @param rings             - Landmark ring data for body axis computation
 * @param deltaBodyFat      - Change in body fat % from baseline
 * @param overrides         - Per-segment slider overrides
 * @param adjacency         - Per-vertex adjacency lists for Laplacian smoothing
 * @param displacementField - SMPL displacement field (null = use fallback)
 * @param constraints       - SMPL constraints (null = use fallback sensitivity)
 * @param componentCount    - Number of SMPL shape components (typically 10)
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

  // Compute betas from UI parameters (only when SMPL is available)
  let betas: Float32Array | null = null;
  if (useSMPL) {
    if (_cachedBetasComponentCount !== componentCount) {
      _cachedBetas = new Float32Array(componentCount);
      _cachedBetasComponentCount = componentCount;
    }
    betas = mapToBetas(deltaBodyFat, overrides, componentCount);
    // Copy to cached for reuse if needed
    _cachedBetas!.set(betas);
    betas = _cachedBetas!;
  }

  // Arm/leg centers for fallback radial path
  const arms = computeArmCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);
  const legs = computeLegCenters(originalPositions, bindings, vertexCount, axisCX, axisCZ);

  // Pre-compute arm scale for fallback
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
      _smplDisp = sampleDisplacement(
        displacementField!, betas, oy, ox, oz, axisCX, axisCZ
      );

      let nx = ox + _smplDisp[0];
      let ny = oy + _smplDisp[1];
      let nz = oz + _smplDisp[2];

      // 2. Layer fat depot displacements
      const dx = ox - axisCX;
      const dz = oz - axisCZ;
      const radialDist = Math.sqrt(dx * dx + dz * dz);
      const vertAngle = Math.atan2(dz, dx);
      const isArm = binding.segmentId === 'arms';
      const isLeftSide = ox < axisCX;

      computeDepotDisplacement(
        deltaBodyFat, oy, vertAngle, radialDist, isArm, isLeftSide, _depotDisp
      );

      nx += _depotDisp[0];
      ny += _depotDisp[1];
      nz += _depotDisp[2];

      // 3. Gravity-aware soft tissue sag
      const sagCoeff = SAG_COEFFICIENTS[binding.segmentId] ?? 0.00002;
      const absDelta = Math.abs(deltaBodyFat);
      const isLowerHalf = oy < 0.5;
      const sagOffset = -sagCoeff * absDelta * radialDist * (isLowerHalf ? 1.0 : 0.3);
      ny += sagOffset;

      positions[i * 3] = nx;
      positions[i * 3 + 1] = ny;
      positions[i * 3 + 2] = nz;
    } else {
      // ═══════════════════════════════════════════════════════════
      // Fallback radial deformation (same as morphEngine.ts)
      // ═══════════════════════════════════════════════════════════

      let cx: number, cz: number, baseScale: number;

      // Determine sensitivity and scale limits
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
