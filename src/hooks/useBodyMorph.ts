'use client';

import { useCallback, useRef } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { deformMesh } from '@/lib/morph/morphEngine';
import type { BufferGeometry } from 'three';

/**
 * Hook that applies morph deformations to the loaded mesh geometry.
 * Returns an update function that should be called when sliders change.
 */
export function useBodyMorph() {
  const scanData = useScanStore((s) => s.scanData);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const segmentOverrides = useMorphStore((s) => s.segmentOverrides);
  const lastUpdateRef = useRef(0);

  const applyMorph = useCallback((geometry: BufferGeometry) => {
    if (!scanData) return;

    const now = performance.now();
    // Throttle to ~60fps
    if (now - lastUpdateRef.current < 14) return;
    lastUpdateRef.current = now;

    const positions = geometry.getAttribute('position');
    if (!positions) return;

    const posArray = positions.array as Float32Array;
    const deltaBodyFat = globalBodyFat - originalBodyFat;

    deformMesh(
      posArray,
      scanData.originalPositions,
      scanData.vertexBindings,
      scanData.rings,
      deltaBodyFat,
      segmentOverrides
    );

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [scanData, originalBodyFat, globalBodyFat, segmentOverrides]);

  return { applyMorph, globalBodyFat, originalBodyFat, segmentOverrides };
}
