/**
 * SMPL Displacement Field — pre-computes per-(height, angle) displacement
 * vectors from SMPL shape components, enabling anatomically correct
 * body deformation transferred to any scan mesh.
 *
 * Instead of radially inflating the mesh like a balloon, this samples
 * SMPL's learned body shape variation to move each vertex in the direction
 * that real bodies actually change with weight/fat changes.
 *
 * Pipeline:
 *   1. Normalize SMPL template to unit-height space (matching scan space)
 *   2. For each shape component k, compute V(beta_k=1) - V(beta=0)
 *   3. Bin these displacements into a (height × angle) grid
 *   4. At runtime, sample the field with weighted betas → displacement vector
 */

import type { SMPLModelData } from '@/types/smpl';
import { computeShape } from './shapeEngine';

const HEIGHT_BINS = 80;
const ANGLE_BINS = 36;

export interface DisplacementField {
  /** Per-component displacement grids. componentFields[k] has HEIGHT_BINS × ANGLE_BINS × 3 floats */
  componentFields: Float32Array[];
  heightBins: number;
  angleBins: number;
}

/**
 * Fill empty bins by averaging from neighboring bins (3 passes).
 * Prevents zero-displacement holes in regions where SMPL has sparse vertices.
 */
function fillEmptyBins(
  field: Float32Array,
  counts: Float32Array,
  hBins: number,
  aBins: number
): void {
  for (let pass = 0; pass < 3; pass++) {
    for (let h = 0; h < hBins; h++) {
      for (let a = 0; a < aBins; a++) {
        const idx = h * aBins + a;
        if (counts[idx] > 0) continue;

        let sumX = 0, sumY = 0, sumZ = 0, n = 0;
        for (let dh = -1; dh <= 1; dh++) {
          for (let da = -1; da <= 1; da++) {
            if (dh === 0 && da === 0) continue;
            const nh = h + dh;
            const na = (a + da + aBins) % aBins; // wrap around angle
            if (nh < 0 || nh >= hBins) continue;
            const ni = nh * aBins + na;
            if (counts[ni] > 0) {
              sumX += field[ni * 3];
              sumY += field[ni * 3 + 1];
              sumZ += field[ni * 3 + 2];
              n++;
            }
          }
        }
        if (n > 0) {
          field[idx * 3] = sumX / n;
          field[idx * 3 + 1] = sumY / n;
          field[idx * 3 + 2] = sumZ / n;
          counts[idx] = 0.5; // mark as filled
        }
      }
    }
  }
}

/**
 * Build displacement fields for all shape components.
 * Called once when SMPL model loads. Results are cached in the store.
 *
 * Each field captures how SMPL vertices move per unit of that beta component,
 * binned by (normalizedHeight, radialAngle).
 */
export function buildDisplacementFields(model: SMPLModelData): DisplacementField {
  const { vertexCount, vTemplate, shapeComponentCount } = model;

  // Normalize SMPL template: unit height, centered, feet at y=0
  let minY = Infinity, maxY = -Infinity, axisCX = 0, axisCZ = 0;
  for (let i = 0; i < vertexCount; i++) {
    const y = vTemplate[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    axisCX += vTemplate[i * 3];
    axisCZ += vTemplate[i * 3 + 2];
  }
  axisCX /= vertexCount;
  axisCZ /= vertexCount;
  const bodyHeight = maxY - minY || 1;

  // Pre-compute normalized template and per-vertex bin assignments
  const normTemplate = new Float32Array(vertexCount * 3);
  const vertHBin = new Uint16Array(vertexCount);
  const vertABin = new Uint16Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const nx = (vTemplate[i * 3] - axisCX) / bodyHeight;
    const ny = (vTemplate[i * 3 + 1] - minY) / bodyHeight;
    const nz = (vTemplate[i * 3 + 2] - axisCZ) / bodyHeight;
    normTemplate[i * 3] = nx;
    normTemplate[i * 3 + 1] = ny;
    normTemplate[i * 3 + 2] = nz;
    vertHBin[i] = Math.min(HEIGHT_BINS - 1, Math.max(0, Math.floor(ny * HEIGHT_BINS)));
    const angle = Math.atan2(nz, nx);
    vertABin[i] = Math.min(
      ANGLE_BINS - 1,
      Math.max(0, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * ANGLE_BINS))
    );
  }

  // Build a displacement field for each shape component
  const componentFields: Float32Array[] = [];

  for (let k = 0; k < shapeComponentCount; k++) {
    const betas = new Float32Array(shapeComponentCount);
    betas[k] = 1.0;
    const shaped = computeShape(model, betas);

    const field = new Float32Array(HEIGHT_BINS * ANGLE_BINS * 3);
    const counts = new Float32Array(HEIGHT_BINS * ANGLE_BINS);

    for (let i = 0; i < vertexCount; i++) {
      const hb = vertHBin[i];
      const ab = vertABin[i];
      const idx = hb * ANGLE_BINS + ab;

      // Displacement in normalized space
      const dx = (shaped.positions[i * 3] - axisCX) / bodyHeight - normTemplate[i * 3];
      const dy = (shaped.positions[i * 3 + 1] - minY) / bodyHeight - normTemplate[i * 3 + 1];
      const dz = (shaped.positions[i * 3 + 2] - axisCZ) / bodyHeight - normTemplate[i * 3 + 2];

      field[idx * 3] += dx;
      field[idx * 3 + 1] += dy;
      field[idx * 3 + 2] += dz;
      counts[idx]++;
    }

    // Average per-bin displacements
    for (let j = 0; j < HEIGHT_BINS * ANGLE_BINS; j++) {
      if (counts[j] > 0) {
        field[j * 3] /= counts[j];
        field[j * 3 + 1] /= counts[j];
        field[j * 3 + 2] /= counts[j];
      }
    }

    fillEmptyBins(field, counts, HEIGHT_BINS, ANGLE_BINS);
    componentFields.push(field);
  }

  return { componentFields, heightBins: HEIGHT_BINS, angleBins: ANGLE_BINS };
}

/**
 * Sample the combined displacement at a scan vertex position.
 *
 * Uses bilinear interpolation in (height, angle) space and sums
 * contributions from all shape components weighted by their betas.
 *
 * @returns [dx, dy, dz] displacement in normalized (unit-height) space
 */
export function sampleDisplacement(
  field: DisplacementField,
  betas: Float32Array,
  normalizedY: number,
  x: number,
  z: number,
  axisCX: number,
  axisCZ: number
): [number, number, number] {
  const { componentFields, heightBins, angleBins } = field;

  const ddx = x - axisCX;
  const ddz = z - axisCZ;
  const angle = Math.atan2(ddz, ddx);

  // Continuous bin coordinates
  const hf = Math.max(0, Math.min(heightBins - 1.001, normalizedY * heightBins));
  const af = ((angle + Math.PI) / (2 * Math.PI)) * angleBins;
  const afClamped = Math.max(0, Math.min(angleBins - 0.001, af));

  const h0 = Math.floor(hf);
  const h1 = Math.min(heightBins - 1, h0 + 1);
  const a0 = Math.floor(afClamped);
  const a1 = (a0 + 1) % angleBins; // wrap around for angular continuity
  const ht = hf - h0;
  const at = afClamped - a0;

  // Bilinear interpolation weights
  const w00 = (1 - ht) * (1 - at);
  const w01 = (1 - ht) * at;
  const w10 = ht * (1 - at);
  const w11 = ht * at;

  let totalDX = 0, totalDY = 0, totalDZ = 0;

  for (let k = 0; k < componentFields.length; k++) {
    const beta = betas[k];
    if (Math.abs(beta) < 0.001) continue;

    const f = componentFields[k];
    const i00 = (h0 * angleBins + a0) * 3;
    const i01 = (h0 * angleBins + a1) * 3;
    const i10 = (h1 * angleBins + a0) * 3;
    const i11 = (h1 * angleBins + a1) * 3;

    const fdx = w00 * f[i00] + w01 * f[i01] + w10 * f[i10] + w11 * f[i11];
    const fdy = w00 * f[i00 + 1] + w01 * f[i01 + 1] + w10 * f[i10 + 1] + w11 * f[i11 + 1];
    const fdz = w00 * f[i00 + 2] + w01 * f[i01 + 2] + w10 * f[i10 + 2] + w11 * f[i11 + 2];

    totalDX += fdx * beta;
    totalDY += fdy * beta;
    totalDZ += fdz * beta;
  }

  return [totalDX, totalDY, totalDZ];
}
