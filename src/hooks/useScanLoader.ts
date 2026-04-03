'use client';

import { useCallback } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { parseOBJ, normalizeGeometry } from '@/lib/pipeline/objParser';
import { parseCoreMeasuresCSV, parseBodyCompositionCSV } from '@/lib/pipeline/csvParser';
import { groupLandmarksIntoRings } from '@/lib/pipeline/landmarkGrouper';
import { classifyVertices, computeArmThreshold } from '@/lib/morph/segmentClassifier';
import { validateOBJContent, validateCoreMeasuresCSV, validateBodyCompCSV } from '@/lib/pipeline/validator';
import type { ScanData } from '@/types/scan';

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

      // Group landmarks into rings
      const rings = groupLandmarksIntoRings(landmarks);

      // Compute arm threshold
      const armThreshold = computeArmThreshold(rings);

      // Classify vertices (using raw mm positions before normalization)
      const vertexBindings = classifyVertices(rawPositions, rings, armThreshold);

      // Normalize geometry for display (auto-center, unit height)
      normalizeGeometry(geometry);

      // Store normalized original positions
      const originalPositions = (geometry.getAttribute('position').array as Float32Array).slice();

      const scanData: ScanData = {
        geometry,
        originalPositions,
        measures,
        landmarks,
        rings,
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
