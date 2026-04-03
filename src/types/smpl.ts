/**
 * SMPL / SMPL-X parametric body model types.
 *
 * The SMPL model represents body shape as:
 *   V = v_template + shapedirs @ betas
 *
 * where betas is a low-dimensional shape parameter vector (typically 10 PCs).
 */

/** Pre-extracted SMPL model data loaded from JSON */
export interface SMPLModelData {
  /** Number of vertices (6890 for SMPL, 10475 for SMPL-X) */
  vertexCount: number;
  /** Number of shape components (typically 10) */
  shapeComponentCount: number;
  /** Mean template vertices, flat array [x0,y0,z0, x1,y1,z1, ...] length = vertexCount * 3 */
  vTemplate: Float32Array;
  /**
   * Shape blend shapes (PCA directions).
   * Flat row-major array of shape (vertexCount * 3, shapeComponentCount).
   * shapedirs[(v*3+c)*K + k] = displacement of vertex v, axis c, for component k.
   * length = vertexCount * 3 * shapeComponentCount
   */
  shapedirs: Float32Array;
  /** Face indices, flat [i0,i1,i2, ...], length = faceCount * 3 */
  faces: Uint32Array;
  /** Number of faces */
  faceCount: number;
  /** Per-vertex segment labels for regional control (e.g. 'torso', 'arms') */
  segmentLabels?: string[];
  /** Gender the model was trained on: 'neutral', 'male', 'female' */
  gender: 'neutral' | 'male' | 'female';
}

/** Raw JSON format as loaded from the extracted file (before typed-array conversion) */
export interface SMPLModelJSON {
  vertexCount: number;
  shapeComponentCount: number;
  /** Base64-encoded Float32Array */
  vTemplate: string;
  /** Base64-encoded Float32Array */
  shapedirs: string;
  /** Base64-encoded Uint32Array */
  faces: string;
  faceCount: number;
  segmentLabels?: string[];
  gender: 'neutral' | 'male' | 'female';
}

/** Mapping from UI sliders to SMPL beta parameters */
export interface BetaMapping {
  /** Which beta index this mapping affects */
  betaIndex: number;
  /** Human-readable label */
  label: string;
  /** Slider range [min, max] in beta-space */
  range: [number, number];
}

/** Result of SMPL shape computation */
export interface SMPLShapeResult {
  /** Deformed vertex positions, flat [x0,y0,z0, ...] */
  positions: Float32Array;
  /** Face indices (same as model faces) */
  faces: Uint32Array;
  /** Number of vertices */
  vertexCount: number;
}
