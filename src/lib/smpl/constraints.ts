/**
 * SMPL Constraints — derives anatomically-informed sensitivity curves
 * and per-height scale limits from SMPL shape data.
 *
 * Instead of rendering SMPL as a separate body, we use its statistical
 * shape knowledge to CONSTRAIN how the user's scan mesh deforms.
 * This prevents "Shrek blob" shapes at extreme slider values.
 *
 * The approach:
 *   1. Compute SMPL shapes at various beta[0] values (body size axis)
 *   2. For each height on the body, measure how much the radius changes
 *   3. Use those measurements as sensitivity curves and scale limits
 *   4. Apply in the Phase 1 morph engine instead of hand-tuned Gaussians
 */

import type { SMPLModelData } from '@/types/smpl';
import { computeShape } from './shapeEngine';

const NUM_BINS = 50;

export interface SMPLConstraints {
  /** Per-height-bin sensitivity: how much radius changes per unit of beta[0] */
  sensitivityBins: Float32Array;
  /** Per-height-bin maximum scale (from beta[0]=+3) */
  maxScaleBins: Float32Array;
  /** Per-height-bin minimum scale (from beta[0]=-3) */
  minScaleBins: Float32Array;
  /** Number of height bins */
  numBins: number;
}

/**
 * Compute anatomical constraints from SMPL model data.
 * Call once when a model is loaded. Results are cached in the store.
 */
export function computeConstraints(model: SMPLModelData): SMPLConstraints {
  const { vertexCount, vTemplate, shapeComponentCount } = model;

  // Find body bounds and axis
  let minY = Infinity, maxY = -Infinity;
  let axisCX = 0, axisCZ = 0;

  for (let i = 0; i < vertexCount; i++) {
    const y = vTemplate[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    axisCX += vTemplate[i * 3];
    axisCZ += vTemplate[i * 3 + 2];
  }
  axisCX /= vertexCount;
  axisCZ /= vertexCount;
  const bodyHeight = maxY - minY;

  // Compute template radii per bin
  const templateRadii = new Float32Array(NUM_BINS);
  const binCounts = new Float32Array(NUM_BINS);

  for (let i = 0; i < vertexCount; i++) {
    const ny = (vTemplate[i * 3 + 1] - minY) / bodyHeight;
    const bin = Math.min(NUM_BINS - 1, Math.floor(ny * NUM_BINS));
    const dx = vTemplate[i * 3] - axisCX;
    const dz = vTemplate[i * 3 + 2] - axisCZ;
    const r = Math.sqrt(dx * dx + dz * dz);
    templateRadii[bin] += r;
    binCounts[bin]++;
  }

  for (let b = 0; b < NUM_BINS; b++) {
    if (binCounts[b] > 0) templateRadii[b] /= binCounts[b];
  }

  // Compute deformed shapes at beta[0] = +1, +3, -3
  const betasPlus1 = new Float32Array(shapeComponentCount);
  betasPlus1[0] = 1.0;
  const shapePlus1 = computeShape(model, betasPlus1);

  const betasPlus3 = new Float32Array(shapeComponentCount);
  betasPlus3[0] = 3.0;
  const shapePlus3 = computeShape(model, betasPlus3);

  const betasMinus3 = new Float32Array(shapeComponentCount);
  betasMinus3[0] = -3.0;
  const shapeMinus3 = computeShape(model, betasMinus3);

  // Measure radii per bin for each deformed shape
  const radiiPlus1 = new Float32Array(NUM_BINS);
  const radiiPlus3 = new Float32Array(NUM_BINS);
  const radiiMinus3 = new Float32Array(NUM_BINS);
  const counts = new Float32Array(NUM_BINS);

  for (let i = 0; i < vertexCount; i++) {
    const ny = (vTemplate[i * 3 + 1] - minY) / bodyHeight;
    const bin = Math.min(NUM_BINS - 1, Math.floor(ny * NUM_BINS));

    for (const [positions, target] of [
      [shapePlus1.positions, radiiPlus1],
      [shapePlus3.positions, radiiPlus3],
      [shapeMinus3.positions, radiiMinus3],
    ] as [Float32Array, Float32Array][]) {
      const dx = positions[i * 3] - axisCX;
      const dz = positions[i * 3 + 2] - axisCZ;
      target[bin] += Math.sqrt(dx * dx + dz * dz);
    }
    counts[bin]++;
  }

  const sensitivityBins = new Float32Array(NUM_BINS);
  const maxScaleBins = new Float32Array(NUM_BINS);
  const minScaleBins = new Float32Array(NUM_BINS);

  for (let b = 0; b < NUM_BINS; b++) {
    if (counts[b] > 0 && templateRadii[b] > 0.001) {
      radiiPlus1[b] /= counts[b];
      radiiPlus3[b] /= counts[b];
      radiiMinus3[b] /= counts[b];

      // Sensitivity = fractional radial change per unit beta[0]
      sensitivityBins[b] = (radiiPlus1[b] - templateRadii[b]) / templateRadii[b];

      // Scale limits from extreme betas
      maxScaleBins[b] = radiiPlus3[b] / templateRadii[b];
      minScaleBins[b] = radiiMinus3[b] / templateRadii[b];
    } else {
      sensitivityBins[b] = 0;
      maxScaleBins[b] = 1.3;
      minScaleBins[b] = 0.8;
    }
  }

  return { sensitivityBins, maxScaleBins, minScaleBins, numBins: NUM_BINS };
}

/**
 * Look up SMPL-derived sensitivity at a normalized Y height [0, 1].
 */
export function smplSensitivity(constraints: SMPLConstraints, y: number): number {
  const bin = Math.min(constraints.numBins - 1, Math.max(0, Math.floor(y * constraints.numBins)));
  return constraints.sensitivityBins[bin];
}

/**
 * Look up SMPL-derived scale limits at a normalized Y height [0, 1].
 */
export function smplScaleLimits(constraints: SMPLConstraints, y: number): [number, number] {
  const bin = Math.min(constraints.numBins - 1, Math.max(0, Math.floor(y * constraints.numBins)));
  return [constraints.minScaleBins[bin], constraints.maxScaleBins[bin]];
}
