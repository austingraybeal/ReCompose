'use client';

import { useEffect, useRef } from 'react';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import type { SegmentId } from '@/types/scan';

const DEBOUNCE_MS = 100;

/**
 * Records slider adjustments during assessment tasks.
 * Uses debounced subscriptions to capture meaningful state changes.
 */
export function useTrajectoryRecorder() {
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);
  const currentStep = useAssessmentStore((s) => s.currentStep);
  const recordAdjustment = useAssessmentStore((s) => s.recordAdjustment);

  const lastGlobalRef = useRef<number | null>(null);
  const lastOverridesRef = useRef<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTaskActive = isAssessmentMode &&
    currentStep !== null &&
    currentStep !== 'welcome' &&
    currentStep !== 'complete';

  useEffect(() => {
    if (!isTaskActive) {
      lastGlobalRef.current = null;
      lastOverridesRef.current = {};
      return;
    }

    // Subscribe to morph store changes
    const unsubscribe = useMorphStore.subscribe((state) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Check global BF change
        if (lastGlobalRef.current !== null && state.globalBodyFat !== lastGlobalRef.current) {
          recordAdjustment('global', state.globalBodyFat);
        }
        lastGlobalRef.current = state.globalBodyFat;

        // Check segment override changes
        const segments: SegmentId[] = ['shoulders', 'arms', 'torso', 'waist', 'hips', 'legs'];
        for (const seg of segments) {
          const prev = lastOverridesRef.current[seg];
          const curr = state.segmentOverrides[seg];
          if (prev !== undefined && curr !== prev) {
            recordAdjustment(seg, curr);
          }
          lastOverridesRef.current[seg] = curr;
        }
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isTaskActive, recordAdjustment]);
}
