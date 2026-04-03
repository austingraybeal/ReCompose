import { create } from 'zustand';
import type {
  TaskType,
  TaskResult,
  AssessmentRecord,
  AssessmentStep,
  AdjustmentEvent,
  SliderState,
  ActualMetrics,
} from '@/types/assessment';
import type { SegmentId } from '@/types/scan';
import { calculateBIDSScores } from '@/lib/assessment/scoring';

interface AssessmentState {
  // Flow state
  isAssessmentMode: boolean;
  currentStep: AssessmentStep | null;

  // Task data
  taskResults: {
    perceived?: TaskResult;
    ideal?: TaskResult;
    partner?: TaskResult;
  };

  // Current task tracking
  taskStartTime: number | null;
  adjustmentTrajectory: AdjustmentEvent[];
  resetCount: number;

  // Canvas snapshots (data URLs) captured at each task confirm
  snapshots: {
    perceived?: string;
    ideal?: string;
    partner?: string;
  };

  // Final record
  assessmentRecord: AssessmentRecord | null;

  // Actions
  startAssessment: () => void;
  beginFirstTask: () => void;
  recordAdjustment: (control: 'global' | SegmentId, value: number) => void;
  recordReset: () => void;
  confirmTask: (finalState: SliderState, snapshot?: string) => void;
  goBack: () => void;
  completeAssessment: (actual: ActualMetrics, scanId: string) => void;
  resetAssessment: () => void;
}

const TASK_ORDER: TaskType[] = ['perceived', 'ideal', 'partner'];

function getNextStep(current: TaskType): AssessmentStep {
  const idx = TASK_ORDER.indexOf(current);
  if (idx < TASK_ORDER.length - 1) return TASK_ORDER[idx + 1];
  return 'complete';
}

function getPrevStep(current: TaskType): AssessmentStep | null {
  const idx = TASK_ORDER.indexOf(current);
  if (idx > 0) return TASK_ORDER[idx - 1];
  return null;
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  isAssessmentMode: false,
  currentStep: null,
  taskResults: {},
  taskStartTime: null,
  adjustmentTrajectory: [],
  resetCount: 0,
  snapshots: {},
  assessmentRecord: null,

  startAssessment: () =>
    set({
      isAssessmentMode: true,
      currentStep: 'welcome',
      taskResults: {},
      taskStartTime: null,
      adjustmentTrajectory: [],
      resetCount: 0,
      snapshots: {},
      assessmentRecord: null,
    }),

  beginFirstTask: () =>
    set({
      currentStep: 'perceived',
      taskStartTime: Date.now(),
      adjustmentTrajectory: [],
      resetCount: 0,
    }),

  recordAdjustment: (control, value) => {
    const { taskStartTime, adjustmentTrajectory } = get();
    if (!taskStartTime) return;
    const event: AdjustmentEvent = {
      timestamp: Date.now() - taskStartTime,
      control,
      value,
    };
    set({ adjustmentTrajectory: [...adjustmentTrajectory, event] });
  },

  recordReset: () => {
    set((s) => ({ resetCount: s.resetCount + 1 }));
  },

  confirmTask: (finalState, snapshot) => {
    const { currentStep, taskStartTime, adjustmentTrajectory, resetCount, taskResults, snapshots } = get();
    if (!currentStep || currentStep === 'welcome' || currentStep === 'complete' || !taskStartTime) return;

    const taskType = currentStep as TaskType;
    const result: TaskResult = {
      taskType,
      finalState,
      adjustmentTrajectory: [...adjustmentTrajectory],
      durationMs: Date.now() - taskStartTime,
      resetCount,
    };

    const nextStep = getNextStep(taskType);
    set({
      taskResults: { ...taskResults, [taskType]: result },
      snapshots: { ...snapshots, ...(snapshot ? { [taskType]: snapshot } : {}) },
      currentStep: nextStep,
      taskStartTime: nextStep !== 'complete' ? Date.now() : null,
      adjustmentTrajectory: [],
      resetCount: 0,
    });
  },

  goBack: () => {
    const { currentStep } = get();
    if (!currentStep || currentStep === 'welcome' || currentStep === 'perceived') return;

    const taskType = currentStep as TaskType;
    const prevStep = getPrevStep(taskType);
    if (!prevStep) return;

    set({
      currentStep: prevStep,
      taskStartTime: Date.now(),
      adjustmentTrajectory: [],
      resetCount: 0,
    });
  },

  completeAssessment: (actual, scanId) => {
    const { taskResults, snapshots } = get();
    const perceived = taskResults.perceived;
    const ideal = taskResults.ideal;
    const partner = taskResults.partner;
    if (!perceived || !ideal || !partner) return;

    const scores = calculateBIDSScores(perceived, ideal, partner, actual);
    const record: AssessmentRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      scanId,
      actual,
      tasks: { perceived, ideal, partner },
      scores,
    };

    set({ assessmentRecord: record, currentStep: 'complete' });
  },

  resetAssessment: () =>
    set({
      isAssessmentMode: false,
      currentStep: null,
      taskResults: {},
      taskStartTime: null,
      adjustmentTrajectory: [],
      resetCount: 0,
      snapshots: {},
      assessmentRecord: null,
    }),
}));
