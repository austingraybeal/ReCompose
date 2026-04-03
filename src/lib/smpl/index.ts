/**
 * SMPL Module — anatomical displacement transfer engine.
 *
 * SMPL shape data is used to compute a displacement field that guides
 * how the user's scan mesh deforms. Each vertex moves in an anatomically
 * correct direction learned from thousands of real body scans.
 *
 * Architecture:
 *   1. Python tool (tools/extract_smpl.py) converts SMPL .pkl → JSON
 *   2. JSON is placed in public/models/smpl_{gender}.json
 *   3. App auto-fetches on boot via smplStore.initialize()
 *   4. Displacement field is pre-computed from shape components
 *   5. Morph engine samples the field to deform the scan mesh
 */

export { computeShape, computeShapeWithSegments, zeroBetas } from './shapeEngine';
export { buildDisplacementFields, sampleDisplacement } from './displacementField';
export type { DisplacementField } from './displacementField';
export { parseSMPLModel, loadSMPLFromFile, loadSMPLFromURL } from './loader';
export { mapToBetas, estimateBfFromBetas } from './parameterMapper';
