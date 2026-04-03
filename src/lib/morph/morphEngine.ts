import type { LandmarkRing, VertexBinding, SegmentOverrides } from '@/types/scan';
import { ARM_SENSITIVITY } from './sensitivityModel';
import { SEGMENTS } from '@/lib/constants/segmentDefs';

/** Scale factor limits — wide enough for realistic high/low BF */
const MIN_SCALE = 0.65;
const MAX_SCALE = 1.55;

/**
 * Smooth sensitivity profile for global BF changes.
 * Returns how much a region changes per 1% BF delta.
 */
function sensitivity(y: number): number {
  const BASE = 0.18;
  const g = (center: number, sigma: number, peak: number) =>
    peak * Math.exp(-((y - center) ** 2) / (2 * sigma * sigma));

  return BASE
    + g(0.54, 0.09, 0.88)   // waist/belly
    + g(0.43, 0.08, 0.65)   // hips
    + g(0.64, 0.07, 0.50)   // bust/chest
    + g(0.32, 0.09, 0.50)   // upper thighs
    + g(0.15, 0.10, 0.20)   // calves
    + g(0.74, 0.08, 0.30);  // upper chest/shoulders
}

/**
 * Gaussian-blended segment override value at a given Y height.
 * Produces smooth transitions between segments — no hard boundaries.
 */
function blendedSegmentOverride(y: number, overrides: SegmentOverrides): number {
  let totalWeight = 0;
  let blendedValue = 0;

  for (const seg of SEGMENTS) {
    if (seg.isLateral) continue; // arms handled separately
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
 * Directional scaling: front expands slightly more than back (fat distribution).
 */
function directionalScale(dx: number, dz: number, scale: number): number {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.0001) return scale;
  const zNorm = dz / dist;
  const mult = zNorm >= 0 ? 1.0 + 0.08 * zNorm : 1.0 + 0.06 * zNorm;
  return scale * mult;
}

/**
 * Laplacian smoothing — moves vertices toward neighbor average.
 * Operates on X and Z only (preserves Y/height).
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
      positions[i * 3 + 1] = temp[i * 3 + 1]; // Y unchanged
      positions[i * 3 + 2] = temp[i * 3 + 2] + lambda * (avgZ - temp[i * 3 + 2]);
    }
  }
}

/**
 * Compute per-limb centers: separate left/right arm and left/right leg centers.
 * This enables volumetric scaling of limbs (expand around their own axis)
 * instead of radial scaling from the torso center (which pushes limbs apart).
 */
function computeLimbCenters(
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  axisCX: number,
  axisCZ: number,
  vertexCount: number
) {
  let lArmX = 0, lArmZ = 0, lArmCount = 0;
  let rArmX = 0, rArmZ = 0, rArmCount = 0;
  let lLegX = 0, lLegZ = 0, lLegCount = 0;
  let rLegX = 0, rLegZ = 0, rLegCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const seg = bindings[i]?.segmentId;
    const ox = originalPositions[i * 3];
    const oz = originalPositions[i * 3 + 2];
    const oy = originalPositions[i * 3 + 1];

    if (seg === 'arms') {
      if (ox < axisCX) { lArmX += ox; lArmZ += oz; lArmCount++; }
      else { rArmX += ox; rArmZ += oz; rArmCount++; }
    } else if (seg === 'legs' && oy < 0.38) {
      // Only classify below hip junction as legs for center computation
      if (ox < axisCX) { lLegX += ox; lLegZ += oz; lLegCount++; }
      else { rLegX += ox; rLegZ += oz; rLegCount++; }
    }
  }

  return {
    leftArm: {
      cx: lArmCount > 0 ? lArmX / lArmCount : axisCX - 0.12,
      cz: lArmCount > 0 ? lArmZ / lArmCount : axisCZ,
    },
    rightArm: {
      cx: rArmCount > 0 ? rArmX / rArmCount : axisCX + 0.12,
      cz: rArmCount > 0 ? rArmZ / rArmCount : axisCZ,
    },
    leftLeg: {
      cx: lLegCount > 0 ? lLegX / lLegCount : axisCX - 0.06,
      cz: lLegCount > 0 ? lLegZ / lLegCount : axisCZ,
    },
    rightLeg: {
      cx: rLegCount > 0 ? rLegX / rLegCount : axisCX + 0.06,
      cz: rLegCount > 0 ? rLegZ / rLegCount : axisCZ,
    },
  };
}

/**
 * Height-based arm scaling gradient.
 * Upper arm (near shoulder) gets full effect, forearm gets less.
 * y is in normalized 0-1 space.
 */
function armHeightFactor(y: number): number {
  // Upper arm region: y ~ 0.45-0.65 → full effect
  // Forearm/wrist: y ~ 0.25-0.45 → reduced effect
  // Hand: y < 0.25 → minimal effect
  if (y > 0.55) return 1.0;     // upper arm / shoulder
  if (y > 0.40) return 0.7;     // mid arm
  if (y > 0.25) return 0.4;     // forearm
  return 0.15;                    // hand/wrist
}

/**
 * Height-based leg scaling gradient.
 * Upper thigh gets full effect, ankle gets minimal.
 */
function legHeightFactor(y: number): number {
  if (y > 0.30) return 1.0;     // upper thigh
  if (y > 0.20) return 0.75;    // mid thigh
  if (y > 0.12) return 0.45;    // knee/calf
  if (y > 0.05) return 0.25;    // lower calf
  return 0.10;                    // ankle/foot
}

/**
 * Compute how much a vertex should use its local limb center vs torso center.
 * Returns 0 = fully torso center, 1 = fully limb center.
 * This prevents tearing at arm-torso and leg-hip junctions.
 */
function limbBlendFactor(y: number, segmentId: string): number {
  if (segmentId === 'arms') {
    // Near shoulder junction (y > 0.65), blend toward torso center
    if (y > 0.68) return 0.0;  // fully torso
    if (y > 0.60) return (0.68 - y) / 0.08; // smooth blend
    return 1.0; // fully limb center
  }
  if (segmentId === 'legs') {
    // Near hip junction (y > 0.36), blend toward torso center
    if (y > 0.40) return 0.0;  // fully torso
    if (y > 0.32) return (0.40 - y) / 0.08; // smooth blend
    return 1.0; // fully limb center
  }
  return 0.0; // non-limb: always torso center
}

/**
 * Main mesh deformation function.
 *
 * Key design decisions:
 * - Arms and legs each have LEFT/RIGHT centers for volumetric scaling
 * - Limb vertices blend between limb center and torso center near junctions
 * - Height gradients within limbs (upper arm > forearm, thigh > calf)
 * - Shoulders override drives arms too (50% coupling)
 * - All segment boundaries are Gaussian-blended (no hard edges)
 * - Laplacian smoothing eliminates remaining artifacts
 */
export function deformMesh(
  positions: Float32Array,
  originalPositions: Float32Array,
  bindings: VertexBinding[],
  rings: LandmarkRing[],
  deltaBodyFat: number,
  overrides: SegmentOverrides,
  adjacency?: Uint32Array[]
): void {
  // Compute torso center axis
  let axisCX = 0, axisCZ = 0;
  if (rings.length > 0) {
    for (const ring of rings) { axisCX += ring.center.x; axisCZ += ring.center.z; }
    axisCX /= rings.length;
    axisCZ /= rings.length;
  }

  const vertexCount = originalPositions.length / 3;

  // Compute limb centers
  const limbs = computeLimbCenters(originalPositions, bindings, axisCX, axisCZ, vertexCount);

  // Arm combined override (arms + 50% of shoulders)
  const armOverride = overrides.arms + overrides.shoulders * 0.5;

  // Phase 1: Per-vertex deformation
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

    const isLeftSide = ox < axisCX;
    let combinedScale: number;
    let cx: number, cz: number;

    if (binding.segmentId === 'arms') {
      // ARM scaling: volumetric from local arm center with height gradient
      const limbCenter = isLeftSide ? limbs.leftArm : limbs.rightArm;
      const blend = limbBlendFactor(oy, 'arms');
      cx = axisCX + blend * (limbCenter.cx - axisCX);
      cz = axisCZ + blend * (limbCenter.cz - axisCZ);

      const heightFactor = armHeightFactor(oy);
      const armGlobal = 1 + (deltaBodyFat * ARM_SENSITIVITY * heightFactor / 100);
      const armRegional = 1 + (armOverride * heightFactor / 100);
      combinedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, armGlobal * armRegional));

    } else if (binding.segmentId === 'legs') {
      // LEG scaling: volumetric from local leg center with height gradient
      const limbCenter = isLeftSide ? limbs.leftLeg : limbs.rightLeg;
      const blend = limbBlendFactor(oy, 'legs');
      cx = axisCX + blend * (limbCenter.cx - axisCX);
      cz = axisCZ + blend * (limbCenter.cz - axisCZ);

      const heightFactor = legHeightFactor(oy);
      const sens = sensitivity(oy);
      const globalScale = 1 + (deltaBodyFat * sens * heightFactor / 100);
      const overrideValue = overrides.legs * heightFactor;
      const regionalScale = 1 + overrideValue / 100;
      combinedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, globalScale * regionalScale));

    } else {
      // TORSO segments: scale from torso center axis
      cx = axisCX;
      cz = axisCZ;

      const sens = sensitivity(oy);
      const globalScale = 1 + (deltaBodyFat * sens / 100);
      const overrideValue = blendedSegmentOverride(oy, overrides);
      const regionalScale = 1 + overrideValue / 100;
      combinedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, globalScale * regionalScale));
    }

    // Radial displacement from center
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

  // Phase 2: Laplacian smoothing
  if (adjacency && adjacency.length === vertexCount) {
    const deformMagnitude = Math.abs(deltaBodyFat) +
      Object.values(overrides).reduce((s, v) => s + Math.abs(v), 0) / 4;
    const iterations = deformMagnitude > 15 ? 6 : deformMagnitude > 8 ? 5 : deformMagnitude > 3 ? 4 : 3;
    laplacianSmooth(positions, adjacency, iterations, 0.50);
  }
}
