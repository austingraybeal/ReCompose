'use client';

import { useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { useTrajectoryRecorder } from '@/hooks/useTrajectoryRecorder';
import WelcomeScreen from './WelcomeScreen';
import ProgressBar from './ProgressBar';
import InstructionCard from './InstructionCard';
import TaskControls from './TaskControls';
import ResultsSummary from './ResultsSummary';
import type { TaskType, ActualMetrics } from '@/types/assessment';

interface AssessmentOverlayProps {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export default function AssessmentOverlay({ canvasRef }: AssessmentOverlayProps) {
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);
  const currentStep = useAssessmentStore((s) => s.currentStep);
  const selectedTasks = useAssessmentStore((s) => s.selectedTasks);
  const taskResults = useAssessmentStore((s) => s.taskResults);
  const assessmentRecord = useAssessmentStore((s) => s.assessmentRecord);
  const completeAssessment = useAssessmentStore((s) => s.completeAssessment);

  const scanData = useScanStore((s) => s.scanData);
  const scanFileName = useScanStore((s) => s.scanFileName);
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const setGlobalBodyFat = useMorphStore((s) => s.setGlobalBodyFat);
  const resetRegionalOverrides = useMorphStore((s) => s.resetRegionalOverrides);

  // Start trajectory recording
  useTrajectoryRecorder();

  // Reset sliders to actual when entering a new task
  useEffect(() => {
    if (isAssessmentMode && currentStep && currentStep !== 'welcome' && currentStep !== 'complete') {
      setGlobalBodyFat(originalBodyFat);
      resetRegionalOverrides();
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ghost starts off whenever an assessment begins (toggle available in
  // the task bar).
  useEffect(() => {
    if (isAssessmentMode) {
      const view = useViewStore.getState();
      if (view.ghostOverlay) view.toggleGhostOverlay();
    }
  }, [isAssessmentMode]);

  // Auto-complete assessment when all selected tasks are done
  const allDone = selectedTasks.every((t) => !!taskResults[t]);
  useEffect(() => {
    if (
      currentStep === 'complete' &&
      !assessmentRecord &&
      allDone &&
      scanData
    ) {
      const metrics = scanData.bodyComp;
      const measures = scanData.measures;
      // Same measure sources as the live metrics panel (the old keys
      // 'WaistCirc'/'HipCirc' don't exist in scan exports and produced
      // zeros in the PDF scan summary).
      const waist =
        measures['NarrowWaistTapeMeasure'] ?? measures['NarrowWaist'] ??
        measures['WaistCircumference'] ?? 0;
      const hip = measures['HipCircumference'] ?? measures['HipWidestCircumference'] ?? 0;
      const actual: ActualMetrics = {
        bodyFat: metrics.bodyFat,
        weight: metrics.weight,
        bmi: metrics.bmi,
        waistCirc: waist,
        hipCirc: hip,
        whr: metrics.waistToHipRatio || (hip > 0 ? Math.round((waist / hip) * 100) / 100 : 0),
      };
      // Scan ID: the upload file name truncated through _AM/_PM when
      // present (scanner exports embed the capture time that way).
      const rawName = scanFileName ?? 'scan-' + Date.now();
      const ampm = rawName.match(/^(.*?_[AP]M)/);
      completeAssessment(actual, ampm ? ampm[1] : rawName.replace(/\.obj$/i, ''));
    }
  }, [currentStep, assessmentRecord, allDone, scanData, completeAssessment, scanFileName]);

  // Capture two canvas snapshots per confirm: one with the actual-body
  // ghost shell and one without, so the results page can toggle the ghost
  // on the static images after the fact.
  const captureSnapshot = useCallback(async (): Promise<{
    ghost?: string;
    plain?: string;
  }> => {
    try {
      const canvas = canvasRef?.current ?? document.querySelector('canvas');
      if (!canvas) return {};

      const waitFrames = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      const setGhost = (on: boolean) => {
        const view = useViewStore.getState();
        if (view.ghostOverlay !== on) view.toggleGhostOverlay();
      };

      const hadGhost = useViewStore.getState().ghostOverlay;

      setGhost(false);
      await waitFrames();
      const plain = canvas.toDataURL('image/png');

      setGhost(true);
      await waitFrames();
      const ghost = canvas.toDataURL('image/png');

      setGhost(hadGhost);
      return { ghost, plain };
    } catch {
      return {};
    }
  }, [canvasRef]);

  if (!isAssessmentMode) return null;

  const completedTasks = new Set<TaskType>(
    selectedTasks.filter((t) => !!taskResults[t]),
  );

  // Welcome screen
  if (currentStep === 'welcome') {
    return <WelcomeScreen />;
  }

  // Results screen (or waiting for scores to compute)
  if (currentStep === 'complete') {
    if (assessmentRecord) {
      return <ResultsSummary />;
    }
    // Scores are being calculated — show a brief loading state
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(10, 11, 15, 0.95)', backdropFilter: 'blur(24px)' }}
      >
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: 'var(--rc-accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-rc-sm font-mono" style={{ color: 'var(--rc-text-dim)' }}>
            Calculating scores...
          </p>
        </div>
      </div>
    );
  }

  // Guard: only render task UI for a selected task step
  if (!selectedTasks.includes(currentStep as TaskType)) {
    return null;
  }

  // Active task
  const taskType = currentStep as TaskType;
  const taskIndex = selectedTasks.indexOf(taskType);

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-40 pointer-events-none flex flex-col">
        {/* Top bar: Progress + Instructions (pointer-events enabled) */}
        <div className="pointer-events-auto" style={{
          background: 'linear-gradient(to bottom, rgba(10, 11, 15, 0.9) 0%, transparent 100%)',
        }}>
          <ProgressBar currentStep={currentStep!} selectedTasks={selectedTasks} completedTasks={completedTasks} />
          <InstructionCard taskType={taskType} taskIndex={taskIndex} taskCount={selectedTasks.length} />
        </div>

        {/* Spacer — pass clicks through to 3D viewer */}
        <div className="flex-1" />

        {/* Bottom bar: Task controls (pointer-events enabled) */}
        <div
          className="pointer-events-auto"
          style={{
            background: 'linear-gradient(to top, rgba(10, 11, 15, 0.9) 0%, transparent 100%)',
          }}
        >
          <TaskControls taskType={taskType} onCaptureSnapshot={captureSnapshot} />
        </div>
      </div>
    </AnimatePresence>
  );
}
