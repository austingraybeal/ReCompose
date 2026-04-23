'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import type { SegmentId } from '@/types/scan';

/**
 * Hook that provides segment classification data for the loaded scan.
 * Returns a map of vertex index → segment ID for use in highlighting.
 */
export function useSegmentClassifier() {
  const scanData = useScanStore((s) => s.scanData);

  const segmentMap = useMemo(() => {
    if (!scanData) return null;

    const map = new Map<number, SegmentId>();
    for (let i = 0; i < scanData.vertexBindings.length; i++) {
      map.set(i, scanData.vertexBindings[i].segmentId as SegmentId);
    }
    return map;
  }, [scanData]);

  /** Get segment colors as a Float32Array for vertex coloring */
  const segmentColors = useMemo(() => {
    if (!scanData) return null;

    const colors = new Float32Array(scanData.vertexBindings.length * 3);

    const colorMap: Record<string, [number, number, number]> = {
      shoulders: [0.29, 0.78, 0.91],  // #4ac8e8
      upper_arms: [0.36, 0.91, 0.82], // #5de8d0
      forearms: [0.48, 0.94, 0.88],   // #7af0e0
      torso: [0.29, 0.81, 0.63],      // #4acfa0
      waist: [0.94, 0.78, 0.29],      // #f0c84a
      hips: [0.94, 0.46, 0.29],       // #f0764a
      thighs: [0.65, 0.55, 0.98],     // #a78bfa
      calves: [0.77, 0.65, 1.0],      // #c4a7ff
    };

    for (let i = 0; i < scanData.vertexBindings.length; i++) {
      const seg = scanData.vertexBindings[i].segmentId;
      const c = colorMap[seg] ?? [0.5, 0.5, 0.5];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }

    return colors;
  }, [scanData]);

  return { segmentMap, segmentColors };
}
