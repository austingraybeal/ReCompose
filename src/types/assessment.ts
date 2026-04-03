import type { SegmentId } from './scan';

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

export type TaskType = 'perceived' | 'ideal' | 'partner';

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
  perceivedDelta: number;
  idealDelta: number;
  partnerDelta: number;
}

/** BIDS scores calculated from three tasks */
export interface BIDSScores {
  // Global scores (BF% units)
  distortion: number;
  dissatisfaction: number;
  partnerDiscrepancy: number;

  // Absolute magnitudes
  distortionMagnitude: number;
  dissatisfactionMagnitude: number;

  // Regional breakdown
  segmentDistortions: SegmentDistortion[];

  // Peak distortion segments
  maxDistortionSegment: SegmentId;
  maxDissatisfactionSegment: SegmentId;

  // Behavioral
  perceivedTaskDuration: number;
  idealTaskDuration: number;
  partnerTaskDuration: number;
  totalAssessmentDuration: number;

  // Flags
  clinicalFlag: boolean;
}

/** Full assessment record */
export interface AssessmentRecord {
  id: string;
  timestamp: string;       // ISO 8601
  scanId: string;

  actual: ActualMetrics;

  tasks: {
    perceived: TaskResult;
    ideal: TaskResult;
    partner: TaskResult;
  };

  scores: BIDSScores;
}

/** Assessment flow step for the state machine */
export type AssessmentStep = TaskType | 'welcome' | 'complete';
