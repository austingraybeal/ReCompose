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
      // Validate inputs
      const objValidation = validateOBJContent(objText);
      if (!objValidation.valid) {
        throw new Error(objValidation.errors.join('; '));
      }

      const csvValidation = validateCoreMeasuresCSV(coreMeasuresText);
      if (!csvValidation.valid) {
        throw new Error(csvValidation.errors.join('; '));
      }

      const bodyCompValidation = validateBodyCompCSV(bodyCompText);
      if (!bodyCompValidation.valid) {
        throw new Error(bodyCompValidation.errors.join('; '));
      }

      // Parse OBJ
      const geometry = parseOBJ(objText);

      // Store original positions before normalization (in mm space)
      const rawPositions = (geometry.getAttribute('position').array as Float32Array).slice();

      // Parse CSVs
      const { measures, landmarks } = parseCoreMeasuresCSV(coreMeasuresText);
      const bodyComp = parseBodyCompositionCSV(bodyCompText);

      // Group landmarks into rings (mm space)
      const rings = groupLandmarksIntoRings(landmarks);

      // Compute arm threshold (mm space)
      const armThresholdMM = computeArmThreshold(rings);

      // Classify vertices using raw mm positions and mm-space rings
      const vertexBindings = classifyVertices(rawPositions, rings, armThresholdMM);

      // Normalize geometry for display (auto-center, unit height)
      const transform = normalizeGeometry(geometry);

      // Transform ring centers into the same normalized coordinate space
      // so the morph engine works correctly
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

      // Also normalize arm threshold
      const armThreshold = armThresholdMM * transform.scale;

      // Store normalized original positions
      const originalPositions = (geometry.getAttribute('position').array as Float32Array).slice();

      const scanData: ScanData = {
        geometry,
        originalPositions,
        measures,
        landmarks,
        rings: normalizedRings,
        bodyComp,
        vertexBindings,
        armThreshold,
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
