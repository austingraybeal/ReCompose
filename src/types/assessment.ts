import type { SegmentId } from './scan';
import type { TaskTrajectoryMetrics } from '@/lib/assessment/trajectoryMetrics';
import type { TaskId } from '@/lib/assessment/taskRegistry';

/** Current slider state captured at a moment in time */
export interface SliderState {
  globalBodyFat: number;
  segmentOverrides: Record<SegmentId, number>;
}

/** A single slider adjustment event with timestamp */
export interface AdjustmentEvent {
  timestamp: number;        // ms since task start
  control: 'global' | SegmentId;
  value: number;
}

/**
 * A task identifier. 'perceived' is always present; the remaining tasks
 * are chosen per assessment from the task registry.
 */
export type TaskType = TaskId;

/** Result from a single assessment task */
export interface TaskResult {
  taskType: TaskType;
  finalState: SliderState;
  adjustmentTrajectory: AdjustmentEvent[];
  durationMs: number;
  resetCount: number;
}

/** Ground truth from the loaded scan */
export interface ActualMetrics {
  bodyFat: number;
  weight: number;
  bmi: number;
  waistCirc: number;
  hipCirc: number;
  whr: number;
}

/** Per-segment distortion breakdown */
export interface SegmentDistortion {
  segmentId: SegmentId;
  label: string;
  /** Perceived override vs actual (actual = 0 by construction). */
  perceivedDelta: number;
  /**
   * Each non-perceived selected task's override minus the perceived
   * override for this segment (task-vs-perceived discrepancy).
   */
  taskDeltas: Partial<Record<TaskType, number>>;
}

/** BIDS scores calculated from the selected tasks */
export interface BIDSScores {
  /** Perceived global BF minus actual BF. */
  distortion: number;
  distortionMagnitude: number;

  /**
   * Global BF discrepancy of each non-perceived selected task vs the
   * perceived body (task minus perceived).
   */
  taskDiscrepancies: Partial<Record<TaskType, number>>;

  /** Convenience aliases when the corresponding task was selected. */
  dissatisfaction?: number;        // ideal - perceived
  dissatisfactionMagnitude?: number;
  partnerDiscrepancy?: number;     // partner - perceived

  // Regional breakdown
  segmentDistortions: SegmentDistortion[];

  // Peak distortion segments
  maxDistortionSegment: SegmentId;
  maxDissatisfactionSegment?: SegmentId;

  // Behavioral
  trajectories: Partial<Record<TaskType, TaskTrajectoryMetrics>>;
  taskDurations: Partial<Record<TaskType, number>>;
  totalAssessmentDuration: number;

  // Flags
  clinicalFlag: boolean;
}

/** Full assessment record */
export interface AssessmentRecord {
  id: string;
  timestamp: string;       // ISO 8601
  scanId: string;
  /** Researcher-entered participant/session identifier (optional). */
  participantId?: string;

  actual: ActualMetrics;

  /** Tasks administered in this assessment, in administration order. */
  selectedTasks: TaskType[];
  tasks: Partial<Record<TaskType, TaskResult>>;

  scores: BIDSScores;
}

/** Assessment flow step for the state machine */
export type AssessmentStep = TaskType | 'welcome' | 'complete';
