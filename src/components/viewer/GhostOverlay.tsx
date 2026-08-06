'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { Color, Plane, Vector3 } from 'three';

const GHOST_COLOR = new Color('#a862f8');

/**
 * Renders the original (undeformed) mesh as a translucent wireframe overlay.
 * Uses a SEPARATE clone of the geometry so it never interferes with the
 * deformed BodyMesh. Rendered behind the solid mesh with no depth writing
 * so it only shows where the solid mesh doesn't occlude it.
 */
export default function GhostOverlay() {
  const scanData = useScanStore((s) => s.scanData);
  const ghostOverlay = useViewStore((s) => s.ghostOverlay);

  // Clone geometry once for the ghost so it's independent of BodyMesh's clone
  const ghostGeometry = useMemo(() => {
    if (!scanData) return null;
    return scanData.geometry.clone();
  }, [scanData]);

  // Same collar-height clip as BodyMesh so the ghost has no floating head.
  const clipPlanes = useMemo(() => {
    if (!scanData) return [];
    const collar = scanData.rings.find((r) => r.name === 'Collar');
    return [new Plane(new Vector3(0, -1, 0), (collar?.height ?? 0.86) + 0.01)];
  }, [scanData]);

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
        clippingPlanes={clipPlanes}
      />
    </mesh>
  );
}
