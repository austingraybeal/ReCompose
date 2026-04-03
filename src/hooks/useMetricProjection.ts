'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { projectMetrics } from '@/lib/morph/metricProjection';
import type { ProjectedMetrics } from '@/types/scan';

/**
 * Hook that computes projected metrics based on current slider positions.
 * Returns both current projected metrics and the original values for delta display.
 */
export function useMetricProjection(): {
  metrics: ProjectedMetrics | null;
  originalMetrics: ProjectedMetrics | null;
} {
  const scanData = useScanStore((s) => s.scanData);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const segmentOverrides = useMorphStore((s) => s.segmentOverrides);

  const metrics = useMemo(() => {
    if (!scanData) return null;
    return projectMetrics(
      scanData.bodyComp,
      originalBodyFat,
      globalBodyFat,
      segmentOverrides,
      scanData.rings,
      scanData.measures
    );
  }, [scanData, originalBodyFat, globalBodyFat, segmentOverrides]);

  const originalMetrics = useMemo(() => {
    if (!scanData) return null;
    const zeroOverrides = { shoulders: 0, arms: 0, torso: 0, waist: 0, hips: 0, thighs: 0, legs: 0 };
    return projectMetrics(
      scanData.bodyComp,
      originalBodyFat,
      originalBodyFat,
      zeroOverrides,
      scanData.rings,
      scanData.measures
    );
  }, [scanData, originalBodyFat]);

  return { metrics, originalMetrics };
}
