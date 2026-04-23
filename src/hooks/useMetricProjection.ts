'use client';

import { useMemo } from 'react';
import { useScanStore } from '@/lib/stores/scanStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useGenderStore } from '@/lib/stores/genderStore';
import { projectMetrics } from '@/lib/morph/metricProjection';
import type { ProjectedMetrics, SegmentOverrides } from '@/types/scan';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

const ZERO_OVERRIDES: SegmentOverrides = SEGMENT_ORDER.reduce((acc, id) => {
  acc[id] = 0;
  return acc;
}, {} as SegmentOverrides);

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
  const sex = useGenderStore((s) => s.gender);

  const metrics = useMemo(() => {
    if (!scanData) return null;
    return projectMetrics(
      scanData.bodyComp,
      originalBodyFat,
      globalBodyFat,
      segmentOverrides,
      scanData.rings,
      scanData.measures,
      sex,
    );
  }, [scanData, originalBodyFat, globalBodyFat, segmentOverrides, sex]);

  const originalMetrics = useMemo(() => {
    if (!scanData) return null;
    return projectMetrics(
      scanData.bodyComp,
      originalBodyFat,
      originalBodyFat,
      ZERO_OVERRIDES,
      scanData.rings,
      scanData.measures,
      sex,
    );
  }, [scanData, originalBodyFat, sex]);

  return { metrics, originalMetrics };
}
