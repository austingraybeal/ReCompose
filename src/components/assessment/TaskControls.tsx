'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import type { TaskType } from '@/types/assessment';
import type { SegmentId } from '@/types/scan';

interface TaskControlsProps {
  taskType: TaskType;
  onCaptureSnapshot: () => string | undefined;
}

const CONFIRM_LABELS: Record<TaskType, string> = {
  perceived: 'Confirm Perceived Body',
  ideal: 'Confirm Ideal Body',
  partner: 'Confirm Partner Preference',
};

export default function TaskControls({ taskType, onCaptureSnapshot }: TaskControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const confirmTask = useAssessmentStore((s) => s.confirmTask);
  const goBack = useAssessmentStore((s) => s.goBack);
  const recordReset = useAssessmentStore((s) => s.recordReset);

  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const segmentOverrides = useMorphStore((s) => s.segmentOverrides);
  const setGlobalBodyFat = useMorphStore((s) => s.setGlobalBodyFat);
  const resetRegionalOverrides = useMorphStore((s) => s.resetRegionalOverrides);

  const canGoBack = taskType !== 'perceived';

  const handleResetToActual = useCallback(() => {
    setGlobalBodyFat(originalBodyFat);
    resetRegionalOverrides();
    recordReset();
  }, [setGlobalBodyFat, originalBodyFat, resetRegionalOverrides, recordReset]);

  const handleConfirmClick = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // Second click confirms
    const snapshot = onCaptureSnapshot();
    confirmTask(
      {
        globalBodyFat,
        segmentOverrides: { ...segmentOverrides } as Record<SegmentId, number>,
      },
      snapshot
    );
    setConfirmed(true);
    // Reset sliders to actual for next task
    setGlobalBodyFat(originalBodyFat);
    resetRegionalOverrides();
  }, [
    confirming, onCaptureSnapshot, confirmTask, globalBodyFat,
    segmentOverrides, setGlobalBodyFat, originalBodyFat, resetRegionalOverrides,
  ]);

  const handleCancelConfirm = useCallback(() => {
    setConfirming(false);
  }, []);

  const handleGoBack = useCallback(() => {
    // Reset sliders to actual before going back
    setGlobalBodyFat(originalBodyFat);
    resetRegionalOverrides();
    goBack();
  }, [setGlobalBodyFat, originalBodyFat, resetRegionalOverrides, goBack]);

  // Reset confirming state when taskType changes
  useEffect(() => {
    setConfirmed(false);
    setConfirming(false);
  }, [taskType]);

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {/* Back button */}
      {canGoBack && (
        <button
          onClick={handleGoBack}
          className="px-3 py-2 rounded-lg text-rc-xs font-mono tracking-wide transition-all duration-150"
          style={{
            background: 'var(--rc-bg-elevated)',
            color: 'var(--rc-text-secondary)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          Back
        </button>
      )}

      {/* Reset to Actual */}
      <button
        onClick={handleResetToActual}
        className="px-3 py-2 rounded-lg text-rc-xs font-mono tracking-wide transition-all duration-150"
        style={{
          background: 'var(--rc-bg-elevated)',
          color: 'var(--rc-text-secondary)',
          border: '1px solid var(--rc-border-default)',
        }}
      >
        Reset to Actual
      </button>

      <div className="flex-1" />

      {/* Confirm / Are you sure */}
      <AnimatePresence mode="wait">
        {confirming ? (
          <motion.div
            key="confirm-prompt"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-2"
          >
            <span className="text-rc-xs font-mono" style={{ color: 'var(--rc-text-secondary)' }}>
              Are you sure?
            </span>
            <button
              onClick={handleCancelConfirm}
              className="px-3 py-2 rounded-lg text-rc-xs font-mono transition-all duration-150"
              style={{
                background: 'var(--rc-bg-elevated)',
                color: 'var(--rc-text-secondary)',
                border: '1px solid var(--rc-border-default)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClick}
              className="px-5 py-2.5 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, var(--rc-accent), #2aa88e)',
                color: '#0a0b0f',
                boxShadow: '0 4px 16px rgba(62, 207, 180, 0.3)',
              }}
            >
              Confirm
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="confirm-button"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={handleConfirmClick}
            className="px-6 py-2.5 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, var(--rc-accent), #2aa88e)',
              color: '#0a0b0f',
              boxShadow: '0 4px 16px rgba(62, 207, 180, 0.25)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(62, 207, 180, 0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(62, 207, 180, 0.25)'; }}
          >
            {CONFIRM_LABELS[taskType]}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
