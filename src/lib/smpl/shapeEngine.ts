/**
 * SMPL Shape Engine — PCA-based body deformation.
 *
 * Core formula: V = v_template + shapedirs @ betas
 *
 * This runs entirely client-side. For a 6890-vertex model with 10 shape
 * components, each frame multiplies a (20670 × 10) matrix by a 10-vector
 * — roughly 200k multiply-adds, well within 60fps budget.
 */

import type { SMPLModelData, SMPLShapeResult } from '@/types/smpl';

/**
 * Compute deformed vertices from shape parameters.
 *
 * @param model  - Pre-loaded SMPL model data
 * @param betas  - Shape parameter vector, length = model.shapeComponentCount
 * @param output - Optional pre-allocated output buffer (reused for perf)
 * @returns Deformed vertex positions
 */
export function computeShape(
  model: SMPLModelData,
  betas: Float32Array,
  output?: Float32Array
): SMPLShapeResult {
  const { vertexCount, shapeComponentCount, vTemplate, shapedirs } = model;
  const totalFloats = vertexCount * 3;
  const K = shapeComponentCount;

  // Reuse output buffer if provided, otherwise allocate
  const positions = output && output.length === totalFloats
    ? output
    : new Float32Array(totalFloats);

  // Start from template
  positions.set(vTemplate);

  // Add shape blend shapes: positions[i] += sum_k( shapedirs[i*K + k] * betas[k] )
  for (let i = 0; i < totalFloats; i++) {
    const rowOffset = i * K;
    let delta = 0;
    for (let k = 0; k < K; k++) {
      delta += shapedirs[rowOffset + k] * betas[k];
    }
    positions[i] += delta;
  }

  return {
    positions,
    faces: model.faces,
    vertexCount,
  };
}

/**
 * Compute shape with additional per-segment scaling applied on top of PCA.
 * This lets us keep the Phase 1 regional slider UX while using SMPL geometry.
 *
 * After PCA deformation, each vertex is radially scaled from the body axis
 * based on its segment label and the corresponding segment override value.
 */
export function computeShapeWithSegments(
  model: SMPLModelData,
  betas: Float32Array,
  segmentOverrides: Record<string, number>,
  output?: Float32Array
): SMPLShapeResult {
  const result = computeShape(model, betas, output);
  const { positions, vertexCount } = result;

  if (!model.segmentLabels || Object.values(segmentOverrides).every(v => v === 0)) {
    return result;
  }

  // Find body axis (average X and Z of all vertices)
  let axisCX = 0, axisCZ = 0;
  for (let i = 0; i < vertexCount; i++) {
    axisCX += positions[i * 3];
    axisCZ += positions[i * 3 + 2];
  }
  axisCX /= vertexCount;
  axisCZ /= vertexCount;

  // Apply per-segment radial scaling
  for (let i = 0; i < vertexCount; i++) {
    const seg = model.segmentLabels[i];
    if (!seg) continue;

    const override = segmentOverrides[seg] ?? 0;
    if (Math.abs(override) < 0.01) continue;

    const scale = 1 + override / 100;
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    const dx = x - axisCX;
    const dz = z - axisCZ;

    positions[i * 3] = axisCX + dx * scale;
    positions[i * 3 + 2] = axisCZ + dz * scale;
  }

  return result;
}

/**
 * Create a zero-initialized beta vector.
 */
export function zeroBetas(componentCount: number): Float32Array {
  return new Float32Array(componentCount);
}
