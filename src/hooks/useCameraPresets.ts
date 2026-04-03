'use client';

import { useCallback, useRef } from 'react';
import { useViewStore } from '@/lib/stores/viewStore';
import type { CameraPreset } from '@/types/scan';
import type { Camera } from 'three';
import { Vector3 } from 'three';

const PRESET_POSITIONS: Record<CameraPreset, [number, number, number]> = {
  front: [0, 0.5, 2.5],
  side: [2.5, 0.5, 0],
  back: [0, 0.5, -2.5],
  quarter: [1.8, 0.6, 1.8],
};

const LOOK_AT = new Vector3(0, 0.45, 0);

/**
 * Hook providing animated camera transitions between preset viewpoints.
 */
export function useCameraPresets() {
  const cameraPreset = useViewStore((s) => s.cameraPreset);
  const setCameraPreset = useViewStore((s) => s.setCameraPreset);
  const animRef = useRef<number | null>(null);

  const animateToPreset = useCallback((
    camera: Camera,
    preset: CameraPreset,
    onComplete?: () => void
  ) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const target = PRESET_POSITIONS[preset];
    const startPos = camera.position.clone();
    const endPos = new Vector3(target[0], target[1], target[2]);
    const duration = 600; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease in-out
      const ease = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      camera.position.lerpVectors(startPos, endPos, ease);
      camera.lookAt(LOOK_AT);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = null;
        onComplete?.();
      }
    };

    animRef.current = requestAnimationFrame(animate);
    setCameraPreset(preset);
  }, [setCameraPreset]);

  return { cameraPreset, animateToPreset, PRESET_POSITIONS, LOOK_AT };
}
