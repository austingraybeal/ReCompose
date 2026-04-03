import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import type { SMPLModelData } from '@/types/smpl';
import type { DisplacementField } from '@/lib/smpl/displacementField';
import { sampleDisplacement } from '@/lib/smpl/displacementField';
import { mapToBetas } from '@/lib/smpl/parameterMapper';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/**
 * Per-height amplification curve for SMPL displacements.
 * SMPL's PCA gives ~3-5% radial change per unit beta — too subtle.
 * We amplify by body region so the visual matches real body composition changes.
 */
function amplification(y: number): number {
  const BASE = 2.5;
  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));

  return BASE * (1.0
    + g(0.54, 0.10, 0.50)   // waist/belly — biggest fat depot
    + g(0.44, 0.09, 0.40)   // hips
    + g(0.63, 0.08, 0.25)   // bust/chest
    + g(0.33, 0.10, 0.35)   // upper thighs
    + g(0.18, 0.12, 0.10)   // calves
    + g(0.73, 0.09, 0.15)   // upper chest/shoulders
  );
}

/** Damping for segment override sliders (max ±15% radial change) */
const SEGMENT_OVERRIDE_STRENGTH = 0.30;

/**
 * Gaussian-blended segment override at normalized Y height.
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

/**
 * Gaussian-blended arm override (combines arms + shoulders influence).
 */
function blendedArmOverride(overrides: SegmentOverrides): number {
  return (overrides.arms + overrides.shoulders * 0.5) * SEGMENT_OVERRIDE_STRENGTH;
}

/**
 * Laplacian smoothing — smooths X and Z, preserves Y.
 */
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

// ════════════════════════════════════════════════════════════════
// SMPL Displacement Transfer — primary deformation mode
// ════════════════════════════════════════════════════════════════

/**
 * SMPL-guided deformation.
 *
 * Moves each scan vertex using displacement vectors learned from thousands
 * of real body scans (SMPL PCA). This produces anatomically correct shape
 * changes: belly protrudes forward, love handles go sideways, thighs expand
 * naturally — instead of the uniform radial "balloon" inflation.
 *
 * Segment overrides are applied as localized radial scaling on top.
 */
function deformWithSMPL(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  field: DisplacementField,
  modelData: SMPLModelData,
  adjacency?: Uint32Array[]
): void {
  const vertexCount = originalPositions.length / 3;

  // Scan body center axis (from ring centers)
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  // Map BF% delta to SMPL betas (global change only — segments applied separately)
  const zeroed: SegmentOverrides = { shoulders: 0, arms: 0, torso: 0, waist: 0, hips: 0, legs: 0 };
  const betas = mapToBetas(deltaBodyFat, zeroed, modelData.shapeComponentCount, {
    massBetaIndex: 0,
    massPerBfPercent: 0.10,  // Stronger mapping for visible deformation
    maxBeta: 5.0,
    segmentMappings: [],
  });

  // Check if segment overrides are active
  const hasOverrides = Object.values(overrides).some(v => Math.abs(v) > 0.5);

  // ── Phase 1: SMPL displacement ──
  for (let i = 0; i < vertexCount; i++) {
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    // Sample SMPL displacement at this vertex's (height, angle)
    const [ddx, ddy, ddz] = sampleDisplacement(field, betas, oy, ox, oz, axisCX, axisCZ);

    // Per-height amplification (boosts waist/hips, moderate elsewhere)
    const amp = amplification(oy);

    // Apply displacement — Y displacement is dampened (height changes are minimal)
    positions[i * 3] = ox + ddx * amp;
    positions[i * 3 + 1] = oy + ddy * amp * 0.2;
    positions[i * 3 + 2] = oz + ddz * amp;
  }

  // ── Phase 2: Localized segment overrides (radial, on top of SMPL displacement) ──
  if (hasOverrides) {
    for (let i = 0; i < vertexCount; i++) {
      const binding = bindings[i];
      if (!binding) continue;

      const oy = originalPositions[i * 3 + 1];
      let overrideValue: number;

      if (binding.segmentId === 'arms') {
        overrideValue = blendedArmOverride(overrides);
      } else {
        overrideValue = blendedSegmentOverride(oy, overrides);
      }

      if (Math.abs(overrideValue) < 0.1) continue;

      const scale = 1 + overrideValue / 100;

      // Scale displaced position radially from axis center
      const px = positions[i * 3];
      const pz = positions[i * 3 + 2];
      const dx = px - axisCX;
      const dz = pz - axisCZ;

      positions[i * 3] = axisCX + dx * scale;
      positions[i * 3 + 2] = axisCZ + dz * scale;
    }
  }

  // ── Phase 3: Laplacian smoothing ──
  if (adjacency && adjacency.length === vertexCount) {
    const deformMagnitude = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 4;
    const iterations = deformMagnitude > 20 ? 3 : 2;
    laplacianSmooth(positions, adjacency, iterations, 0.30);
  }
}

// ════════════════════════════════════════════════════════════════
// Radial Fallback — used when SMPL model is not loaded
// ════════════════════════════════════════════════════════════════

/** Radial sensitivity curve (fallback when no SMPL) */
function sensitivity(y: number): number {
  const BASE = 0.20;
  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));
  return BASE
    + g(0.54, 0.10, 0.92)
    + g(0.44, 0.09, 0.70)
    + g(0.63, 0.08, 0.52)
    + g(0.33, 0.10, 0.55)
    + g(0.18, 0.12, 0.25)
    + g(0.73, 0.09, 0.32);
}

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.60;
const ARM_SENSITIVITY = 0.55;
const LEG_BLEND_LOW = 0.32;
const LEG_BLEND_HIGH = 0.43;

function directionalScale(dx: number, dz: number, scale: number): number {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.0001) return scale;
  const zNorm = dz / dist;
  return scale * (zNorm >= 0 ? 1.0 + 0.08 * zNorm : 1.0 + 0.05 * zNorm);
}

function deformRadialFallback(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[]
): void {
  const vertexCount = originalPositions.length / 3;

  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  // Arm centers
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

  // Leg centers
  let lLegX = 0, lLegZ = 0, lLegN = 0;
  let rLegX = 0, rLegZ = 0, rLegN = 0;
  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId === 'arms') continue;
    const oy = originalPositions[i * 3 + 1];
    if (oy > 0.36) continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) { lLegX += ox; lLegZ += originalPositions[i * 3 + 2]; lLegN++; }
    else { rLegX += ox; rLegZ += originalPositions[i * 3 + 2]; rLegN++; }
  }
  const leftLegCX = lLegN > 0 ? lLegX / lLegN : axisCX - 0.06;
  const leftLegCZ = lLegN > 0 ? lLegZ / lLegN : axisCZ;
  const rightLegCX = rLegN > 0 ? rLegX / rLegN : axisCX + 0.06;
  const rightLegCZ = rLegN > 0 ? rLegZ / rLegN : axisCZ;

  const armOverrideDamped = overrides.arms * SEGMENT_OVERRIDE_STRENGTH
    + overrides.shoulders * SEGMENT_OVERRIDE_STRENGTH * 0.5;
  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (armOverrideDamped / 100);
  const armScaleBase = Math.max(MIN_SCALE, Math.min(MAX_SCALE, armGlobal * armRegional));

  for (let i = 0; i < vertexCount; i++) {
    const binding = bindings[i];
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];
    if (!binding) { positions[i*3]=ox; positions[i*3+1]=oy; positions[i*3+2]=oz; continue; }

    let cx: number, cz: number, combinedScale: number;

    if (binding.segmentId === 'arms') {
      const isLeft = ox < axisCX;
      const armCX = isLeft ? leftArmCX : rightArmCX;
      const armCZ = isLeft ? leftArmCZ : rightArmCZ;
      const jb = Math.min(1, Math.max(0, (oy - 0.58) / 0.10));
      cx = armCX + jb * (axisCX - armCX);
      cz = armCZ + jb * (axisCZ - armCZ);
      const tSens = sensitivity(oy);
      const tGS = 1 + (deltaBodyFat * tSens / 100);
      const tOv = blendedSegmentOverride(oy, overrides);
      const tRS = 1 + tOv / 100;
      const tScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, tGS * tRS));
      combinedScale = armScaleBase + jb * (tScale - armScaleBase);
    } else {
      const sens = sensitivity(oy);
      const gs = 1 + (deltaBodyFat * sens / 100);
      const ov = blendedSegmentOverride(oy, overrides);
      const rs = 1 + ov / 100;
      combinedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, gs * rs));
      if (oy < LEG_BLEND_LOW) {
        const isLeft = ox < axisCX;
        cx = isLeft ? leftLegCX : rightLegCX;
        cz = isLeft ? leftLegCZ : rightLegCZ;
      } else if (oy < LEG_BLEND_HIGH) {
        const t = (oy - LEG_BLEND_LOW) / (LEG_BLEND_HIGH - LEG_BLEND_LOW);
        const bl = t * t * (3 - 2 * t);
        const isLeft = ox < axisCX;
        const legCX = isLeft ? leftLegCX : rightLegCX;
        const legCZ = isLeft ? leftLegCZ : rightLegCZ;
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
      const fs = directionalScale(dx, dz, combinedScale);
      positions[i*3] = cx + dx * fs;
      positions[i*3+1] = oy;
      positions[i*3+2] = cz + dz * fs;
    } else {
      positions[i*3] = ox; positions[i*3+1] = oy; positions[i*3+2] = oz;
    }
  }

  if (adjacency && adjacency.length === vertexCount) {
    const mag = Math.abs(deltaBodyFat) + Object.values(overrides).reduce((s,v)=>s+Math.abs(v),0)/4;
    const iters = mag > 20 ? 4 : mag > 10 ? 3 : 2;
    laplacianSmooth(positions, adjacency, iters, 0.35);
  }
}

// ════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════

/**
 * Main deformation entry point.
 *
 * When SMPL displacement field + model data are available, uses anatomically
 * correct displacement transfer (Amazon Halo-style). Otherwise falls back to
 * the radial scaling approach with per-leg centers.
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[],
  displacementField?: DisplacementField | null,
  modelData?: SMPLModelData | null
): void {
  if (displacementField && modelData) {
    deformWithSMPL(
      positions, originalPositions, bindings, rings,
      deltaBodyFat, overrides, displacementField, modelData, adjacency
    );
  } else {
    deformRadialFallback(
      positions, originalPositions, bindings, rings,
      deltaBodyFat, overrides, adjacency
    );
  }
}
