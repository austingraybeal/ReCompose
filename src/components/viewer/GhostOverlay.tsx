'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { Color, Plane, Vector3 } from 'three';

const GHOST_COLOR = new Color('#a862f8');

/**
 * Renders the original (undeformed) mesh as a translucent wireframe shell.
 *
 * Drawn with depth testing DISABLED and after the body (renderOrder 2), so
 * it can never be hidden inside the figure (when the body grows) or bury
 * the figure (when the body shrinks). Opacity adapts to the current global
 * BF delta: brighter when the ghost sits inside a larger figure (it needs
 * to punch through), fainter when it surrounds a smaller figure (the
 * figure needs to stay readable underneath).
 */
export default function GhostOverlay() {
  const scanData = useScanStore((s) => s.scanData);
  const ghostOverlay = useViewStore((s) => s.ghostOverlay);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);

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

  // deltaBF > 0: figure larger than actual, ghost inside -> brighten.
  // deltaBF < 0: figure smaller, ghost surrounds it -> keep faint.
  const deltaBF = globalBodyFat - originalBodyFat;
  const t = Math.max(-1, Math.min(1, deltaBF / 20));
  const opacity = t >= 0 ? 0.16 + 0.2 * t : Math.max(0.08, 0.16 + 0.08 * t);

  return (
    <mesh geometry={ghostGeometry} renderOrder={2}>
      <meshBasicMaterial
        color={GHOST_COLOR}
        wireframe
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={false}
        clippingPlanes={clipPlanes}
      />
    </mesh>
  );
}
