/**
 * SMPL Module — Phase 2 parametric body model engine.
 *
 * Architecture:
 *   1. Python tool (tools/extract_smpl.py) converts SMPL .pkl → JSON
 *   2. Loader (loader.ts) reads JSON in browser → SMPLModelData
 *   3. Parameter mapper (parameterMapper.ts) converts BF% + sliders → betas
 *   4. Shape engine (shapeEngine.ts) runs PCA: V = template + shapedirs @ betas
 *   5. SMPLMesh component renders the result in Three.js
 *
 * The Phase 1 radial deformation engine is preserved as fallback when
 * no SMPL model is loaded.
 */

export { computeShape, computeShapeWithSegments, zeroBetas } from './shapeEngine';
export { mapToBetas, estimateBfFromBetas, DEFAULT_MAPPING } from './parameterMapper';
export { parseSMPLModel, loadSMPLFromFile, loadSMPLFromURL } from './loader';
export type { BetaMappingConfig } from './parameterMapper';
