'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import type { SegmentId } from '@/types/scan';
import { SEGMENT_COLOR_HEX } from '@/lib/constants/segmentColors';

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

    const colorMap: Record<string, [number, number, number]> = Object.fromEntries(
      Object.entries(SEGMENT_COLOR_HEX).map(([id, hex]) => {
        const n = parseInt(hex.slice(1), 16);
        return [id, [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]];
      }),
    );

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
