/**
 * Anatomical fat depot definitions and displacement computation.
 *
 * SMPL beta[0] captures general body size but not specific fat distribution
 * patterns. These localized displacement "depots" model where fat actually
 * accumulates on the human body, layered on top of the SMPL displacement.
 *
 * Each depot is a 3D Gaussian field with a directional push vector,
 * an activation threshold (BF% delta below which the depot is inactive),
 * and a non-linear exponent for accelerating accumulation.
 */

import type { SegmentOverrides } from '@/types/scan';

/** Descriptor for a localized fat accumulation region */
export interface FatDepot {
  id: string;
  centerY: number;
  centerAngle: number;
  pushDirection: [number, number, number];
  sigmaY: number;
  sigmaAngle: number;
  sigmaRadial: number;
  magnitude: number;
  activationThreshold: number;
  exponent: number;
  bilateral: boolean;
  /** Y floor — Gaussian is zeroed below this (prevents bleed into crotch etc.) */
  yFloor: number;
  /** Which segment this depot primarily affects (for segment override boosting) */
  segment: string;
}

export const FAT_DEPOTS: FatDepot[] = [
  {
    id: 'anterior_abdominal',
    centerY: 0.55,
    centerAngle: Math.PI / 2,
    pushDirection: [0, 0, 1],
    sigmaY: 0.055,
    sigmaAngle: 0.8,
    sigmaRadial: 0.12,
    magnitude: 0.0022,
    activationThreshold: 0,
    exponent: 1.3,
    bilateral: false,
    yFloor: 0.47,
    segment: 'waist',
  },
  {
    id: 'love_handles',
    centerY: 0.53,
    centerAngle: 0,
    pushDirection: [1, 0, 0],
    sigmaY: 0.06,
    sigmaAngle: 0.6,
    sigmaRadial: 0.10,
    magnitude: 0.0013,
    activationThreshold: 3,
    exponent: 1.2,
    bilateral: true,
    yFloor: 0.44,
    segment: 'waist',
  },
  {
    id: 'gluteal',
    centerY: 0.44,
    centerAngle: -Math.PI / 2,
    pushDirection: [0, 0, -1],
    sigmaY: 0.07,
    sigmaAngle: 0.7,
    sigmaRadial: 0.11,
    magnitude: 0.0016,
    activationThreshold: 0,
    exponent: 1.0,
    bilateral: false,
    yFloor: 0.36,
    segment: 'hips',
  },
  {
    id: 'back_rolls',
    centerY: 0.62,
    centerAngle: -Math.PI / 2,
    pushDirection: [0, 0, -1],
    sigmaY: 0.05,
    sigmaAngle: 0.6,
    sigmaRadial: 0.10,
    magnitude: 0.0010,
    activationThreshold: 5,
    exponent: 1.4,
    bilateral: false,
    yFloor: 0.55,
    segment: 'torso',
  },
  {
    id: 'medial_thigh',
    centerY: 0.34,
    centerAngle: 0,
    pushDirection: [-1, 0, 0],
    sigmaY: 0.07,
    sigmaAngle: 0.6,
    sigmaRadial: 0.09,
    magnitude: 0.0012,
    activationThreshold: 2,
    exponent: 1.1,
    bilateral: true,
    yFloor: 0.15,
    segment: 'legs',
  },
  {
    id: 'triceps',
    centerY: 0.55,
    centerAngle: -Math.PI / 2,
    pushDirection: [0, 0, -1],
    sigmaY: 0.10,
    sigmaAngle: 0.7,
    sigmaRadial: 0.08,
    magnitude: 0.0008,
    activationThreshold: 4,
    exponent: 1.0,
    bilateral: true,
    yFloor: 0.0,
    segment: 'arms',
  },
  {
    id: 'anterior_thigh',
    centerY: 0.34,
    centerAngle: Math.PI / 2,
    pushDirection: [0, 0, 1],
    sigmaY: 0.07,
    sigmaAngle: 0.7,
    sigmaRadial: 0.09,
    magnitude: 0.0007,
    activationThreshold: 2,
    exponent: 1.0,
    bilateral: true,
    yFloor: 0.15,
    segment: 'legs',
  },
  {
    id: 'submental',
    centerY: 0.88,
    centerAngle: Math.PI / 2,
    pushDirection: [0, -0.5, 0.866],
    sigmaY: 0.03,
    sigmaAngle: 0.5,
    sigmaRadial: 0.06,
    magnitude: 0.0005,
    activationThreshold: 8,
    exponent: 1.5,
    bilateral: false,
    yFloor: 0.82,
    segment: 'shoulders',
  },
];

function angleSimilarity(vertexAngle: number, depotAngle: number, sigma: number): number {
  let diff = vertexAngle - depotAngle;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.exp(-0.5 * (diff * diff) / (sigma * sigma));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Crotch dampening — prevents forward displacement in the groin area.
 * Applies to vertices in Y ≈ 0.30-0.48 near center axis. Only dampens +Z.
 */
function crotchDampen(normalizedY: number, centerDist: number, dz: number): number {
  if (normalizedY > 0.48 || normalizedY < 0.30) return dz;
  if (centerDist > 0.06) return dz;
  if (dz <= 0) return dz;

  const crotchCenter = 0.39;
  const crotchSigma = 0.045;
  const dampen = Math.exp(-((normalizedY - crotchCenter) ** 2) / (2 * crotchSigma * crotchSigma));
  return dz * (1 - dampen * 0.95);
}

/**
 * Compute fat depot displacement for a single vertex.
 *
 * Supports segment overrides: each depot is tagged with a segment, and
 * the override for that segment boosts/reduces the depot's magnitude.
 *
 * @param deltaBF       - Body fat % change from baseline (can be negative for fat loss)
 * @param vertY         - Vertex normalized Y (0-1)
 * @param vertAngle     - Vertex radial angle (from atan2(dz, dx))
 * @param radialDist    - Vertex distance from center axis (normalized)
 * @param isArm         - Whether this vertex belongs to an arm segment
 * @param isLeftSide    - Whether vertex is on the left side (x < axisCX)
 * @param centerDist    - Absolute X distance from center axis (normalized)
 * @param overrides     - Per-segment slider overrides (-50 to +50)
 * @param out           - Output [dx, dy, dz] — written in place
 */
export function computeDepotDisplacement(
  deltaBF: number,
  vertY: number,
  vertAngle: number,
  radialDist: number,
  isArm: boolean,
  isLeftSide: boolean,
  centerDist: number,
  overrides: SegmentOverrides,
  out: [number, number, number]
): void {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;

  // Depots only activate for fat gain (positive delta)
  // For fat loss, the SMPL displacement + radial scaling handles it
  if (deltaBF <= 0) return;

  for (let d = 0; d < FAT_DEPOTS.length; d++) {
    const depot = FAT_DEPOTS[d];

    if (depot.id === 'triceps' && !isArm) continue;
    if (depot.id !== 'triceps' && depot.id !== 'submental' && isArm) continue;

    const effectiveDelta = deltaBF - depot.activationThreshold;
    if (effectiveDelta <= 0) continue;

    // Y floor check
    if (vertY < depot.yFloor - 0.04) continue;

    // Vertical Gaussian weight
    const dy = vertY - depot.centerY;
    let yWeight = Math.exp(-0.5 * (dy * dy) / (depot.sigmaY * depot.sigmaY));
    if (yWeight < 0.001) continue;

    // Smooth fade below floor
    if (vertY < depot.yFloor) {
      yWeight *= smoothstep(depot.yFloor - 0.04, depot.yFloor, vertY);
    }
    if (yWeight < 0.001) continue;

    const aWeight = angleSimilarity(vertAngle, depot.centerAngle, depot.sigmaAngle);
    if (aWeight < 0.001) continue;

    const rWeight = Math.exp(-0.5 * (radialDist * radialDist) / (depot.sigmaRadial * depot.sigmaRadial));

    const weight = yWeight * aWeight * rWeight;
    if (weight < 0.001) continue;

    // Segment override boost: e.g. waist slider +30 → depot magnitude × 1.6
    const segOverride = overrides[depot.segment as keyof SegmentOverrides] ?? 0;
    const overrideBoost = Math.max(0, 1 + segOverride * 0.02);

    const mag = depot.magnitude * Math.pow(effectiveDelta, depot.exponent) * weight * overrideBoost;

    let px = depot.pushDirection[0];
    const py = depot.pushDirection[1];
    let pz = depot.pushDirection[2];

    if (depot.bilateral) {
      if (depot.id === 'medial_thigh') {
        px = isLeftSide ? 1 : -1;
      } else if (depot.id === 'love_handles') {
        px = isLeftSide ? -1 : 1;
      }
    }

    out[0] += px * mag;
    out[1] += py * mag;
    out[2] += pz * mag;
  }

  // Crotch dampening on the forward component
  out[2] = crotchDampen(vertY, centerDist, out[2]);
}

/** Sag coefficients per segment */
export const SAG_COEFFICIENTS: Record<string, number> = {
  waist: 0.00005,
  torso: 0.00003,
  hips: 0.00003,
  arms: 0.00004,
  legs: 0.00002,
  shoulders: 0.0,
};
