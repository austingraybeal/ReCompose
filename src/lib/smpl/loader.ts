/**
 * SMPL Model Loader — reads extracted JSON and hydrates typed arrays.
 *
 * The JSON format uses base64-encoded binary for efficiency:
 *   vTemplate: base64 → Float32Array (vertexCount * 3)
 *   shapedirs: base64 → Float32Array (vertexCount * 3 * shapeComponentCount)
 *   faces:     base64 → Uint32Array  (faceCount * 3)
 */

import type { SMPLModelData, SMPLModelJSON } from '@/types/smpl';

/**
 * Decode a base64 string to an ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Parse SMPL model JSON into typed SMPLModelData.
 */
export function parseSMPLModel(json: SMPLModelJSON): SMPLModelData {
  const vTemplate = new Float32Array(base64ToArrayBuffer(json.vTemplate));
  const shapedirs = new Float32Array(base64ToArrayBuffer(json.shapedirs));
  const faces = new Uint32Array(base64ToArrayBuffer(json.faces));

  // Validate sizes
  const expectedVT = json.vertexCount * 3;
  if (vTemplate.length !== expectedVT) {
    throw new Error(
      `vTemplate size mismatch: got ${vTemplate.length}, expected ${expectedVT}`
    );
  }

  const expectedSD = json.vertexCount * 3 * json.shapeComponentCount;
  if (shapedirs.length !== expectedSD) {
    throw new Error(
      `shapedirs size mismatch: got ${shapedirs.length}, expected ${expectedSD}`
    );
  }

  const expectedF = json.faceCount * 3;
  if (faces.length !== expectedF) {
    throw new Error(
      `faces size mismatch: got ${faces.length}, expected ${expectedF}`
    );
  }

  return {
    vertexCount: json.vertexCount,
    shapeComponentCount: json.shapeComponentCount,
    vTemplate,
    shapedirs,
    faces,
    faceCount: json.faceCount,
    segmentLabels: json.segmentLabels,
    gender: json.gender,
  };
}

/**
 * Load an SMPL model from a JSON file (File input or fetch).
 */
export async function loadSMPLFromFile(file: File): Promise<SMPLModelData> {
  const text = await file.text();
  const json: SMPLModelJSON = JSON.parse(text);
  return parseSMPLModel(json);
}

/**
 * Load an SMPL model from a URL.
 */
export async function loadSMPLFromURL(url: string): Promise<SMPLModelData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch SMPL model: ${response.statusText}`);
  }
  const json: SMPLModelJSON = await response.json();
  return parseSMPLModel(json);
}
