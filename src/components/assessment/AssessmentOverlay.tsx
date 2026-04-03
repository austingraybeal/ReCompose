'use client';

import { useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import { useMorphStore } from '@/lib/stores/morphStore';
import { useScanStore } from '@/lib/stores/scanStore';
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
  const taskResults = useAssessmentStore((s) => s.taskResults);
  const assessmentRecord = useAssessmentStore((s) => s.assessmentRecord);
  const completeAssessment = useAssessmentStore((s) => s.completeAssessment);

  const scanData = useScanStore((s) => s.scanData);
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

  // Auto-complete assessment when all tasks done
  useEffect(() => {
    if (
      currentStep === 'complete' &&
      !assessmentRecord &&
      taskResults.perceived &&
      taskResults.ideal &&
      taskResults.partner &&
      scanData
    ) {
      const metrics = scanData.bodyComp;
      const measures = scanData.measures;
      const actual: ActualMetrics = {
        bodyFat: metrics.bodyFat,
        weight: metrics.weight,
        bmi: metrics.bmi,
        waistCirc: measures['WaistCirc'] ?? measures['Waist'] ?? 0,
        hipCirc: measures['HipCirc'] ?? measures['HipWidest'] ?? 0,
        whr: metrics.waistToHipRatio,
      };
      completeAssessment(actual, 'scan-' + Date.now());
    }
  }, [currentStep, assessmentRecord, taskResults, scanData, completeAssessment]);

  // Capture canvas snapshot — find the WebGL canvas in the DOM
  const captureSnapshot = useCallback((): string | undefined => {
    try {
      // Try the ref first, then fall back to DOM query
      const canvas = canvasRef?.current ?? document.querySelector('canvas');
      if (!canvas) return undefined;
      return canvas.toDataURL('image/png');
    } catch {
      return undefined;
    }
  }, [canvasRef]);

  if (!isAssessmentMode) return null;

  const completedTasks = new Set<TaskType>();
  if (taskResults.perceived) completedTasks.add('perceived');
  if (taskResults.ideal) completedTasks.add('ideal');
  if (taskResults.partner) completedTasks.add('partner');

  // Welcome screen
  if (currentStep === 'welcome') {
    return <WelcomeScreen />;
  }

  // Results screen
  if (currentStep === 'complete' && assessmentRecord) {
    return <ResultsSummary />;
  }

  // Active task
  const taskType = currentStep as TaskType;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-40 pointer-events-none flex flex-col">
        {/* Top bar: Progress + Instructions (pointer-events enabled) */}
        <div className="pointer-events-auto" style={{
          background: 'linear-gradient(to bottom, rgba(10, 11, 15, 0.9) 0%, transparent 100%)',
        }}>
          <ProgressBar currentStep={currentStep!} completedTasks={completedTasks} />
          <InstructionCard taskType={taskType} />
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
