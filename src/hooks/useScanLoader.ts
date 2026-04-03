'use client';

import { useCallback } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { parseOBJ, normalizeGeometry } from '@/lib/pipeline/objParser';
import { parseCoreMeasuresCSV, parseBodyCompositionCSV } from '@/lib/pipeline/csvParser';
import { groupLandmarksIntoRings } from '@/lib/pipeline/landmarkGrouper';
import { classifyVertices, computeArmThreshold } from '@/lib/morph/segmentClassifier';
import { validateOBJContent, validateCoreMeasuresCSV, validateBodyCompCSV } from '@/lib/pipeline/validator';
import type { ScanData, LandmarkRing } from '@/types/scan';

/**
 * Build vertex adjacency list from geometry index buffer.
 * Each vertex gets a list of its connected neighbor vertex indices.
 */
function buildAdjacency(geometry: import('three').BufferGeometry): Uint32Array[] {
  const vertexCount = geometry.getAttribute('position').count;
  const neighbors: Set<number>[] = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) neighbors[i] = new Set();

  const index = geometry.getIndex();
  if (index) {
    const indices = index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      neighbors[a].add(b); neighbors[a].add(c);
      neighbors[b].add(a); neighbors[b].add(c);
      neighbors[c].add(a); neighbors[c].add(b);
    }
  } else {
    // Non-indexed geometry: every 3 vertices form a face
    const count = geometry.getAttribute('position').count;
    for (let i = 0; i < count; i += 3) {
      const a = i, b = i + 1, c = i + 2;
      if (b < count && c < count) {
        neighbors[a].add(b); neighbors[a].add(c);
        neighbors[b].add(a); neighbors[b].add(c);
        neighbors[c].add(a); neighbors[c].add(b);
      }
    }
  }

  return neighbors.map(s => new Uint32Array(Array.from(s)));
}

/**
 * Hook that orchestrates loading scan files (OBJ + 2 CSVs) into the store.
 */
export function useScanLoader() {
  const { setScanData, setLoading, setError } = useScanStore();
  const { setOriginalBodyFat } = useMorphStore();

  const loadScan = useCallback(async (
    objText: string,
    coreMeasuresText: string,
    bodyCompText: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const objValidation = validateOBJContent(objText);
      if (!objValidation.valid) throw new Error(objValidation.errors.join('; '));

      const csvValidation = validateCoreMeasuresCSV(coreMeasuresText);
      if (!csvValidation.valid) throw new Error(csvValidation.errors.join('; '));

      const bodyCompValidation = validateBodyCompCSV(bodyCompText);
      if (!bodyCompValidation.valid) throw new Error(bodyCompValidation.errors.join('; '));

      // Parse OBJ
      const geometry = parseOBJ(objText);
      const rawPositions = (geometry.getAttribute('position').array as Float32Array).slice();

      // Parse CSVs
      const { measures, landmarks } = parseCoreMeasuresCSV(coreMeasuresText);
      const bodyComp = parseBodyCompositionCSV(bodyCompText);

      // Group landmarks into rings (mm space)
      const rings = groupLandmarksIntoRings(landmarks);

      // Compute arm threshold (mm space)
      const armThresholdMM = computeArmThreshold(rings);

      // Classify vertices using raw mm positions
      const vertexBindings = classifyVertices(rawPositions, rings, armThresholdMM);

      // Normalize geometry
      const transform = normalizeGeometry(geometry);

      // Transform rings to normalized space
      const normalizedRings: LandmarkRing[] = rings.map(ring => ({
        ...ring,
        center: {
          x: (ring.center.x - transform.centerX) * transform.scale,
          y: (ring.center.y - transform.minY) * transform.scale,
          z: (ring.center.z - transform.centerZ) * transform.scale,
        },
        height: (ring.height - transform.minY) * transform.scale,
        front: {
          x: (ring.front.x - transform.centerX) * transform.scale,
          y: (ring.front.y - transform.minY) * transform.scale,
          z: (ring.front.z - transform.centerZ) * transform.scale,
        },
        back: {
          x: (ring.back.x - transform.centerX) * transform.scale,
          y: (ring.back.y - transform.minY) * transform.scale,
          z: (ring.back.z - transform.centerZ) * transform.scale,
        },
        left: {
          x: (ring.left.x - transform.centerX) * transform.scale,
          y: (ring.left.y - transform.minY) * transform.scale,
          z: (ring.left.z - transform.centerZ) * transform.scale,
        },
        right: {
          x: (ring.right.x - transform.centerX) * transform.scale,
          y: (ring.right.y - transform.minY) * transform.scale,
          z: (ring.right.z - transform.centerZ) * transform.scale,
        },
        radius: {
          front: ring.radius.front * transform.scale,
          back: ring.radius.back * transform.scale,
          left: ring.radius.left * transform.scale,
          right: ring.radius.right * transform.scale,
        },
      }));

      const armThreshold = armThresholdMM * transform.scale;

      // Store normalized original positions
      const originalPositions = (geometry.getAttribute('position').array as Float32Array).slice();

      // Build mesh adjacency for Laplacian smoothing
      const adjacency = buildAdjacency(geometry);

      const scanData: ScanData = {
        geometry,
        originalPositions,
        measures,
        landmarks,
        rings: normalizedRings,
        bodyComp,
        vertexBindings,
        armThreshold,
        adjacency,
      };

      setScanData(scanData);
      setOriginalBodyFat(bodyComp.bodyFat);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load scan data';
      setError(message);
    }
  }, [setScanData, setLoading, setError, setOriginalBodyFat]);

  return { loadScan };
}
