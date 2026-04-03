/**
 * SMPL Module — Phase 2 anatomical constraint engine.
 *
 * SMPL data is used to CONSTRAIN how the user's scan mesh deforms,
 * not to render a separate body. The scan mesh is always what's shown.
 *
 * Architecture:
 *   1. Python tool (tools/extract_smpl.py) converts SMPL .pkl → JSON
 *   2. JSON is placed in public/models/smpl_{gender}.json
 *   3. App auto-fetches on boot via smplStore.initialize()
 *   4. Constraints module computes per-height sensitivity + scale limits
 *   5. Morph engine uses constraints to guide scan deformation
 */

export { computeShape, computeShapeWithSegments, zeroBetas } from './shapeEngine';
export { computeConstraints, smplSensitivity, smplScaleLimits } from './constraints';
export { parseSMPLModel, loadSMPLFromFile, loadSMPLFromURL } from './loader';
export type { SMPLConstraints } from './constraints';
