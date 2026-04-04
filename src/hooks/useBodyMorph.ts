'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useSmplStore } from '@/lib/stores/smplStore';
import { deformMeshHybrid } from '@/lib/morph/hybridMorphEngine';
import { computeConstraints } from '@/lib/smpl/constraints';
import type { SMPLConstraints } from '@/lib/smpl/constraints';
import type { BufferGeometry } from 'three';

/**
 * Hook that applies morph deformations to the loaded mesh geometry.
 * Uses the hybrid engine with SMPL displacement fields when available,
 * falling back to radial deformation otherwise.
 * Returns an update function that should be called when sliders change.
 */
export function useBodyMorph() {
  const scanData = useScanStore((s) => s.scanData);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const segmentOverrides = useMorphStore((s) => s.segmentOverrides);
  const displacementField = useSmplStore((s) => s.displacementField);
  const modelData = useSmplStore((s) => s.modelData);
  const lastUpdateRef = useRef(0);

  const smplConstraints = useMemo<SMPLConstraints | null>(() => {
    if (!modelData) return null;
    return computeConstraints(modelData);
  }, [modelData]);

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
    const componentCount = modelData?.shapeComponentCount ?? 10;

    deformMeshHybrid(
      posArray,
      scanData.originalPositions,
      scanData.vertexBindings,
      scanData.rings,
      deltaBodyFat,
      segmentOverrides,
      scanData.adjacency,
      displacementField,
      smplConstraints,
      componentCount
    );

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [scanData, originalBodyFat, globalBodyFat, segmentOverrides, displacementField, smplConstraints, modelData]);

  return { applyMorph, globalBodyFat, originalBodyFat, segmentOverrides };
}
