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
import {
  TASK_DEFINITIONS,
  DEFAULT_SELECTED_TASKS,
  getTaskDefinition,
} from '@/lib/assessment/taskRegistry';

interface AssessmentState {
  // Flow state
  isAssessmentMode: boolean;
  currentStep: AssessmentStep | null;

  /** Tasks chosen for this assessment, in registry (administration) order. */
  selectedTasks: TaskType[];

  // Task data
  taskResults: Partial<Record<TaskType, TaskResult>>;

  // Current task tracking
  taskStartTime: number | null;
  adjustmentTrajectory: AdjustmentEvent[];
  resetCount: number;

  /** In-task numeric readouts hidden by default during BIDS tasks. */
  showValues: boolean;

  // Canvas snapshots (data URLs) captured at each task confirm
  snapshots: Partial<Record<TaskType, string>>;

  // Final record
  assessmentRecord: AssessmentRecord | null;

  // Actions
  startAssessment: () => void;
  toggleTask: (task: TaskType) => void;
  toggleShowValues: () => void;
  beginFirstTask: () => void;
  recordAdjustment: (control: 'global' | SegmentId, value: number) => void;
  recordReset: () => void;
  confirmTask: (finalState: SliderState, snapshot?: string) => void;
  goBack: () => void;
  completeAssessment: (actual: ActualMetrics, scanId: string) => void;
  resetAssessment: () => void;
}

/** Registry order is administration order; filter to the selection. */
export function orderedSelection(selected: TaskType[]): TaskType[] {
  return TASK_DEFINITIONS.filter((d) => selected.includes(d.id)).map((d) => d.id);
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  isAssessmentMode: false,
  currentStep: null,
  selectedTasks: [...DEFAULT_SELECTED_TASKS],
  taskResults: {},
  taskStartTime: null,
  adjustmentTrajectory: [],
  resetCount: 0,
  showValues: false,
  snapshots: {},
  assessmentRecord: null,

  startAssessment: () =>
    set({
      isAssessmentMode: true,
      currentStep: 'welcome',
      selectedTasks: [...DEFAULT_SELECTED_TASKS],
      taskResults: {},
      taskStartTime: null,
      adjustmentTrajectory: [],
      resetCount: 0,
      showValues: false,
      snapshots: {},
      assessmentRecord: null,
    }),

  toggleTask: (task) => {
    if (getTaskDefinition(task).mandatory) return;
    set((s) => ({
      selectedTasks: s.selectedTasks.includes(task)
        ? s.selectedTasks.filter((t) => t !== task)
        : orderedSelection([...s.selectedTasks, task]),
    }));
  },

  toggleShowValues: () => set((s) => ({ showValues: !s.showValues })),

  beginFirstTask: () => {
    const first = orderedSelection(get().selectedTasks)[0];
    if (!first) return;
    set({
      currentStep: first,
      taskStartTime: Date.now(),
      adjustmentTrajectory: [],
      resetCount: 0,
    });
  },

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
    const {
      currentStep, taskStartTime, adjustmentTrajectory, resetCount,
      taskResults, snapshots, selectedTasks,
    } = get();
    if (!currentStep || currentStep === 'welcome' || currentStep === 'complete' || !taskStartTime) return;

    const order = orderedSelection(selectedTasks);
    const taskType = currentStep as TaskType;
    const result: TaskResult = {
      taskType,
      finalState,
      adjustmentTrajectory: [...adjustmentTrajectory],
      durationMs: Date.now() - taskStartTime,
      resetCount,
    };

    const idx = order.indexOf(taskType);
    const nextStep: AssessmentStep = idx < order.length - 1 ? order[idx + 1] : 'complete';
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
    const { currentStep, selectedTasks } = get();
    if (!currentStep || currentStep === 'welcome' || currentStep === 'complete') return;
    const order = orderedSelection(selectedTasks);
    const idx = order.indexOf(currentStep as TaskType);
    if (idx <= 0) return;
    set({
      currentStep: order[idx - 1],
      taskStartTime: Date.now(),
      adjustmentTrajectory: [],
      resetCount: 0,
    });
  },

  completeAssessment: (actual, scanId) => {
    const { taskResults, selectedTasks } = get();
    const order = orderedSelection(selectedTasks);
    if (!order.every((t) => taskResults[t])) return;

    const scores = calculateBIDSScores(taskResults, order, actual);
    const record: AssessmentRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      scanId,
      actual,
      selectedTasks: order,
      tasks: { ...taskResults },
      scores,
    };

    set({ assessmentRecord: record, currentStep: 'complete' });
  },

  resetAssessment: () =>
    set({
      isAssessmentMode: false,
      currentStep: null,
      selectedTasks: [...DEFAULT_SELECTED_TASKS],
      taskResults: {},
      taskStartTime: null,
      adjustmentTrajectory: [],
      resetCount: 0,
      showValues: false,
      snapshots: {},
      assessmentRecord: null,
    }),
}));
