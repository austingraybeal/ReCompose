import type { LandmarkRing, VertexBinding, SegmentOverrides, SegmentId } from '@/types/scan';
import { ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/**
 * Smooth analytical sensitivity profile as a function of normalized Y height.
 * Returns how much a body region changes per 1% body fat change.
 *
 * Uses a hand-tuned smooth curve with no discrete ring boundaries.
 * All areas get a base sensitivity so the whole body responds to the global slider.
 *
 * @param y - Normalized height (0 = feet, 1 = top of head)
 * @returns Sensitivity coefficient (0.1 - 1.0)
 */
function sensitivity(y: number): number {
  // Define control points: [height, sensitivity]
  // Smooth bell-shaped curve centered on the midsection (waist/belly)
  // with a secondary bump at hip level and gentle falloff everywhere else

  const BASE = 0.10; // Everything gets at least 10% sensitivity

  // Primary fat depot: waist/belly region (y ≈ 0.50-0.58)
  const waistCenter = 0.54;
  const waistSigma = 0.06;
  const waistPeak = 0.85;
  const waistContrib = waistPeak * Math.exp(-((y - waistCenter) ** 2) / (2 * waistSigma ** 2));

  // Secondary: hip region (y ≈ 0.42)
  const hipCenter = 0.43;
  const hipSigma = 0.04;
  const hipPeak = 0.55;
  const hipContrib = hipPeak * Math.exp(-((y - hipCenter) ** 2) / (2 * hipSigma ** 2));

  // Tertiary: bust/chest (y ≈ 0.64)
  const bustCenter = 0.64;
  const bustSigma = 0.04;
  const bustPeak = 0.40;
  const bustContrib = bustPeak * Math.exp(-((y - bustCenter) ** 2) / (2 * bustSigma ** 2));

  // Upper thigh region (y ≈ 0.35)
  const thighCenter = 0.32;
  const thighSigma = 0.06;
  const thighPeak = 0.45;
  const thighContrib = thighPeak * Math.exp(-((y - thighCenter) ** 2) / (2 * thighSigma ** 2));

  // Lower leg falloff (y < 0.25) — still some scaling but less
  const calfCenter = 0.15;
  const calfSigma = 0.08;
  const calfPeak = 0.15;
  const calfContrib = calfPeak * Math.exp(-((y - calfCenter) ** 2) / (2 * calfSigma ** 2));

  // Shoulder region (y ≈ 0.75)
  const shoulderCenter = 0.75;
  const shoulderSigma = 0.04;
  const shoulderPeak = 0.20;
  const shoulderContrib = shoulderPeak * Math.exp(-((y - shoulderCenter) ** 2) / (2 * shoulderSigma ** 2));

  // Sum all contributions
  return BASE + waistContrib + hipContrib + bustContrib + thighContrib + calfContrib + shoulderContrib;
}

/**
 * Compute Gaussian-blended segment override at a normalized Y height.
 * All non-lateral segments contribute with smooth falloff.
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

  return totalWeight > 0 ? blendedValue / totalWeight : 0;
}

/**
 * Apply directional scaling: front (anterior) expands more than back.
 */
function directionalScale(dx: number, dz: number, scale: number): number {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.0001) return scale;

  const zNorm = dz / dist;
  // Front: up to +12%, Back: down to -8%
  const multiplier = zNorm >= 0
    ? 1.0 + 0.12 * zNorm
    : 1.0 + 0.08 * zNorm;

  return scale * multiplier;
}

/**
 * Main deformation function.
 *
 * Uses a smooth analytical sensitivity profile (no discrete rings) with
 * Gaussian segment blending for regional overrides. All body areas respond
 * to the global slider proportionally.
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides
): void {
  // Compute center axis
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) {
      axisCX += ring.center.x;
      axisCZ += ring.center.z;
    }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  const vertexCount = originalPositions.length / 3;

  // Compute arm center axes
  let lArmX = 0, lArmZ = 0, lCount = 0;
  let rArmX = 0, rArmZ = 0, rCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    if (bindings[i]?.segmentId !== 'arms') continue;
    const ox = originalPositions[i * 3];
    if (ox < axisCX) {
      lArmX += ox; lArmZ += originalPositions[i * 3 + 2]; lCount++;
    } else {
      rArmX += ox; rArmZ += originalPositions[i * 3 + 2]; rCount++;
    }
  }
  const leftCX = lCount > 0 ? lArmX / lCount : axisCX - 0.12;
  const leftCZ = lCount > 0 ? lArmZ / lCount : axisCZ;
  const rightCX = rCount > 0 ? rArmX / rCount : axisCX + 0.12;
  const rightCZ = rCount > 0 ? rArmZ / rCount : axisCZ;

  const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY / 100);
  const armRegional = 1 + (overrides.arms / 100);
  const armScale = armGlobal * armRegional;

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
      if (ox < axisCX) { cx = leftCX; cz = leftCZ; }
      else { cx = rightCX; cz = rightCZ; }
      combinedScale = armScale;
    } else {
      cx = axisCX;
      cz = axisCZ;

      // Global scale from smooth sensitivity profile
      const sens = sensitivity(oy);
      const globalScale = 1 + (deltaBodyFat * sens / 100);

      // Regional override blended across segments via Gaussian
      const overrideValue = blendedSegmentOverride(oy, overrides);
      const regionalScale = 1 + overrideValue / 100;

      combinedScale = globalScale * regionalScale;
    }

    // Radial displacement
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
}
