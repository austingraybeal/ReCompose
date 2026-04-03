'use client';

import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { Color } from 'three';

const GHOST_COLOR = new Color('#3ecfb4');

/**
 * Renders the original mesh as a translucent wireframe overlay.
 * Shows the user the original scan shape for comparison with the morphed version.
 */
export default function GhostOverlay() {
  const scanData = useScanStore((s) => s.scanData);
  const ghostOverlay = useViewStore((s) => s.ghostOverlay);

  if (!scanData || !ghostOverlay) return null;

  return (
    <mesh geometry={scanData.geometry} renderOrder={-1}>
      <meshBasicMaterial
        color={GHOST_COLOR}
        wireframe
        transparent
        opacity={0.15}
        depthWrite={false}
      />
    </mesh>
  );
}
