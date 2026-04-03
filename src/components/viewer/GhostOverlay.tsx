'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { useSmplStore } from '@/lib/stores/smplStore';
import { Color } from 'three';

const GHOST_COLOR = new Color('#3ecfb4');

/**
 * Renders the original (undeformed) mesh as a translucent wireframe overlay.
 * Uses a SEPARATE clone of the geometry so it never interferes with the
 * deformed BodyMesh. Rendered behind the solid mesh with no depth writing
 * so it only shows where the solid mesh doesn't occlude it.
 */
export default function GhostOverlay() {
  const scanData = useScanStore((s) => s.scanData);
  const ghostOverlay = useViewStore((s) => s.ghostOverlay);
  const useSmpl = useSmplStore((s) => s.useSmpl);

  // Clone geometry once for the ghost so it's independent of BodyMesh's clone
  const ghostGeometry = useMemo(() => {
    if (!scanData) return null;
    return scanData.geometry.clone();
  }, [scanData]);

  // Hide ghost overlay when SMPL model is active (no scan mesh to compare against)
  if (useSmpl) return null;
  if (!scanData || !ghostOverlay || !ghostGeometry) return null;

  return (
    <mesh geometry={ghostGeometry} renderOrder={-1}>
      <meshBasicMaterial
        color={GHOST_COLOR}
        wireframe
        transparent
        opacity={0.12}
        depthWrite={false}
        depthTest={true}
      />
    </mesh>
  );
}
