import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { BufferGeometry, BufferAttribute, Group } from 'three';

/**
 * Parse OBJ file text into a merged BufferGeometry.
 * Handles multi-group OBJ files by merging all geometry.
 */
export function parseOBJ(objText: string): BufferGeometry {
  const loader = new OBJLoader();
  const group: Group = loader.parse(objText);

  // Collect all geometries from the parsed group
  const geometries: BufferGeometry[] = [];
  group.traverse((child) => {
    if ('geometry' in child && child.geometry instanceof BufferGeometry) {
      geometries.push(child.geometry);
    }
  });

  if (geometries.length === 0) {
    throw new Error('No geometry found in OBJ file');
  }

  // If single geometry, use it directly
  if (geometries.length === 1) {
    const geo = geometries[0];
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
  }

  // Merge multiple geometries
  let totalPositions = 0;
  let totalNormals = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (pos) totalPositions += pos.count;
    const norm = g.getAttribute('normal');
    if (norm) totalNormals += norm.count;
  }

  const mergedPositions = new Float32Array(totalPositions * 3);
  let offset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (pos) {
      const arr = pos.array as Float32Array;
      mergedPositions.set(arr, offset);
      offset += arr.length;
    }
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(mergedPositions, 3));
  merged.computeVertexNormals();
  merged.computeBoundingBox();

  return merged;
}

/** Transform parameters from normalization */
export interface NormalizeTransform {
  centerX: number;
  centerZ: number;
  minY: number;
  scale: number;
}

/**
 * Auto-center and normalize geometry to unit height at origin.
 * Returns the transform parameters so other data can be transformed to match.
 */
export function normalizeGeometry(geometry: BufferGeometry): NormalizeTransform {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;

  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  const minY = box.min.y;
  const height = box.max.y - box.min.y;

  // Scale to unit height
  const scale = height > 0 ? 1 / height : 1;

  const positions = geometry.getAttribute('position');
  const arr = positions.array as Float32Array;

  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = (arr[i] - centerX) * scale;
    arr[i + 1] = (arr[i + 1] - minY) * scale;
    arr[i + 2] = (arr[i + 2] - centerZ) * scale;
  }

  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  return { centerX, centerZ, minY, scale };
}
