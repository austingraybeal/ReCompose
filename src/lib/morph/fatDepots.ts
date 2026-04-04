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

/** Descriptor for a localized fat accumulation region */
export interface FatDepot {
  /** Unique identifier */
  id: string;
  /** Normalized Y center (0=feet, 1=head) */
  centerY: number;
  /** Radial angle center (0 = +X, PI/2 = +Z front) */
  centerAngle: number;
  /** Unit vector for displacement direction */
  pushDirection: [number, number, number];
  /** Vertical spread in normalized Y */
  sigmaY: number;
  /** Angular spread in radians */
  sigmaAngle: number;
  /** Radial spread in normalized units */
  sigmaRadial: number;
  /** Displacement magnitude per 1% BF change (in unit-height space) */
  magnitude: number;
  /** BF delta below which this depot is inactive */
  activationThreshold: number;
  /** Non-linearity exponent (>1 = accelerating) */
  exponent: number;
  /** Whether this depot is mirrored left/right */
  bilateral: boolean;
}

/** All anatomical fat depots */
export const FAT_DEPOTS: FatDepot[] = [
  {
    id: 'anterior_abdominal',
    centerY: 0.53,
    centerAngle: Math.PI / 2,         // front (+Z)
    pushDirection: [0, 0, 1],
    sigmaY: 0.07,
    sigmaAngle: 0.8,
    sigmaRadial: 0.12,
    magnitude: 0.0022,
    activationThreshold: 0,
    exponent: 1.3,
    bilateral: false,
  },
  {
    id: 'love_handles',
    centerY: 0.53,
    centerAngle: 0,                   // lateral (+X)
    pushDirection: [1, 0, 0],
    sigmaY: 0.06,
    sigmaAngle: 0.6,
    sigmaRadial: 0.10,
    magnitude: 0.0013,
    activationThreshold: 3,
    exponent: 1.2,
    bilateral: true,
  },
  {
    id: 'gluteal',
    centerY: 0.44,
    centerAngle: -Math.PI / 2,        // rear (-Z)
    pushDirection: [0, 0, -1],
    sigmaY: 0.07,
    sigmaAngle: 0.7,
    sigmaRadial: 0.11,
    magnitude: 0.0016,
    activationThreshold: 0,
    exponent: 1.0,
    bilateral: false,
  },
  {
    id: 'back_rolls',
    centerY: 0.62,
    centerAngle: -Math.PI / 2,        // rear (-Z)
    pushDirection: [0, 0, -1],
    sigmaY: 0.05,
    sigmaAngle: 0.6,
    sigmaRadial: 0.10,
    magnitude: 0.0010,
    activationThreshold: 5,
    exponent: 1.4,
    bilateral: false,
  },
  {
    id: 'medial_thigh',
    centerY: 0.34,
    centerAngle: 0,                   // lateral (mirrored toward midline)
    pushDirection: [-1, 0, 0],        // push toward midline (mirrored per side)
    sigmaY: 0.07,
    sigmaAngle: 0.6,
    sigmaRadial: 0.09,
    magnitude: 0.0012,
    activationThreshold: 2,
    exponent: 1.1,
    bilateral: true,
  },
  {
    id: 'triceps',
    centerY: 0.55,
    centerAngle: -Math.PI / 2,        // rear-facing on arm
    pushDirection: [0, 0, -1],
    sigmaY: 0.10,
    sigmaAngle: 0.7,
    sigmaRadial: 0.08,
    magnitude: 0.0008,
    activationThreshold: 4,
    exponent: 1.0,
    bilateral: true,
  },
  {
    id: 'anterior_thigh',
    centerY: 0.34,
    centerAngle: Math.PI / 2,         // front (+Z)
    pushDirection: [0, 0, 1],
    sigmaY: 0.07,
    sigmaAngle: 0.7,
    sigmaRadial: 0.09,
    magnitude: 0.0007,
    activationThreshold: 2,
    exponent: 1.0,
    bilateral: true,
  },
  {
    id: 'submental',
    centerY: 0.88,
    centerAngle: Math.PI / 2,         // front (+Z)
    pushDirection: [0, -0.5, 0.866],  // front + down
    sigmaY: 0.03,
    sigmaAngle: 0.5,
    sigmaRadial: 0.06,
    magnitude: 0.0005,
    activationThreshold: 8,
    exponent: 1.5,
    bilateral: false,
  },
];

/**
 * Compute the angular similarity between a vertex angle and a depot center angle.
 * Returns a Gaussian-weighted value in [0, 1].
 */
function angleSimilarity(vertexAngle: number, depotAngle: number, sigma: number): number {
  let diff = vertexAngle - depotAngle;
  // Wrap to [-PI, PI]
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.exp(-0.5 * (diff * diff) / (sigma * sigma));
}

/**
 * Compute fat depot displacement for a single vertex.
 *
 * Pre-allocated output array is written to (no allocations in hot loop).
 *
 * @param deltaBF       - Body fat % change from baseline
 * @param vertY         - Vertex normalized Y (0-1)
 * @param vertAngle     - Vertex radial angle (from atan2(dz, dx))
 * @param radialDist    - Vertex distance from center axis (normalized)
 * @param isArm         - Whether this vertex belongs to an arm segment
 * @param isLeftSide    - Whether vertex is on the left side (x < axisCX)
 * @param out           - Output [dx, dy, dz] — written in place
 */
export function computeDepotDisplacement(
  deltaBF: number,
  vertY: number,
  vertAngle: number,
  radialDist: number,
  isArm: boolean,
  isLeftSide: boolean,
  out: [number, number, number]
): void {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;

  if (deltaBF <= 0) return;

  for (let d = 0; d < FAT_DEPOTS.length; d++) {
    const depot = FAT_DEPOTS[d];

    // Skip arm depots for non-arm vertices and vice versa
    if (depot.id === 'triceps' && !isArm) continue;
    if (depot.id !== 'triceps' && depot.id !== 'submental' && isArm) continue;

    const effectiveDelta = deltaBF - depot.activationThreshold;
    if (effectiveDelta <= 0) continue;

    // Vertical Gaussian weight
    const dy = vertY - depot.centerY;
    const yWeight = Math.exp(-0.5 * (dy * dy) / (depot.sigmaY * depot.sigmaY));
    if (yWeight < 0.001) continue;

    // Angular similarity
    const aWeight = angleSimilarity(vertAngle, depot.centerAngle, depot.sigmaAngle);
    if (aWeight < 0.001) continue;

    // Radial falloff
    const rWeight = Math.exp(-0.5 * (radialDist * radialDist) / (depot.sigmaRadial * depot.sigmaRadial));

    const weight = yWeight * aWeight * rWeight;
    if (weight < 0.001) continue;

    const mag = depot.magnitude * Math.pow(effectiveDelta, depot.exponent) * weight;

    let px = depot.pushDirection[0];
    const py = depot.pushDirection[1];
    let pz = depot.pushDirection[2];

    // For bilateral depots, mirror the push direction for the appropriate side
    if (depot.bilateral) {
      if (depot.id === 'medial_thigh') {
        // Medial thigh pushes toward midline: left side pushes +X, right pushes -X
        px = isLeftSide ? 1 : -1;
      } else if (depot.id === 'love_handles') {
        // Love handles push outward: left pushes -X, right pushes +X
        px = isLeftSide ? -1 : 1;
      }
      // For other bilateral depots (triceps, anterior_thigh), push direction is Z-based and same for both sides
    }

    out[0] += px * mag;
    out[1] += py * mag;
    out[2] += pz * mag;
  }
}

/** Sag coefficients per segment for gravity-aware soft tissue displacement */
export const SAG_COEFFICIENTS: Record<string, number> = {
  waist: 0.00005,
  torso: 0.00003,
  hips: 0.00003,
  arms: 0.00004,
  legs: 0.00002,
  shoulders: 0.0,
};
