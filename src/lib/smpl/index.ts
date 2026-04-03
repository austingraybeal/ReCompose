/**
 * SMPL Module — Phase 2 parametric body model engine.
 *
 * Architecture:
 *   1. Python tool (tools/extract_smpl.py) converts SMPL .pkl → JSON
 *   2. JSON is placed in public/models/smpl_neutral.json
 *   3. App auto-fetches on boot via smplStore.initialize()
 *   4. Loader (loader.ts) parses JSON → SMPLModelData typed arrays
 *   5. Parameter mapper (parameterMapper.ts) converts BF% + sliders → betas
 *   6. Shape engine (shapeEngine.ts) runs PCA: V = template + shapedirs @ betas
 *   7. SMPLMesh component renders the result in Three.js
 *
 * The Phase 1 radial deformation engine is preserved as fallback when
 * no SMPL model is available.
 */

export { computeShape, computeShapeWithSegments, zeroBetas } from './shapeEngine';
export { mapToBetas, estimateBfFromBetas, DEFAULT_MAPPING } from './parameterMapper';
export { parseSMPLModel, loadSMPLFromFile, loadSMPLFromURL } from './loader';
export type { BetaMappingConfig } from './parameterMapper';
