import type {
  TaskResult,
  TaskType,
  ActualMetrics,
  BIDSScores,
  SegmentDistortion,
} from '@/types/assessment';
import type { SegmentId } from '@/types/scan';
import { SEGMENTS, SEGMENT_ORDER } from '@/lib/constants/segmentDefs';
import { computeTrajectoryMetrics } from './trajectoryMetrics';
import { getTaskDefinition } from './taskRegistry';

/** BF% deviation threshold for clinical flag */
export const CLINICAL_THRESHOLD = 5.0;

/** Below this BF% magnitude a discrepancy is not considered meaningful. */
export const MEANINGFUL_THRESHOLD = 2.0;

export type DiscrepancySeverity = 'low' | 'moderate' | 'high';

/**
 * Severity band for a global BF% discrepancy, symmetric in both
 * directions: <2 not meaningful (green), 2-5 meaningful (yellow),
 * >5 clinical (red).
 */
export function getDiscrepancySeverity(magnitude: number): DiscrepancySeverity {
  const m = Math.abs(magnitude);
  if (m < MEANINGFUL_THRESHOLD) return 'low';
  if (m <= CLINICAL_THRESHOLD) return 'moderate';
  return 'high';
}

const SEGMENT_IDS: readonly SegmentId[] = SEGMENT_ORDER;

/**
 * Calculate BIDS scores from a dynamic task selection. 'perceived' is
 * required; every other selected task is scored as a discrepancy against
 * the perceived body (global and per segment).
 */
export function calculateBIDSScores(
  results: Partial<Record<TaskType, TaskResult>>,
  selectedTasks: TaskType[],
  actual: ActualMetrics,
): BIDSScores {
  const perceived = results.perceived;
  if (!perceived) {
    throw new Error('calculateBIDSScores requires a perceived task result');
  }
  const comparisons = selectedTasks.filter(
    (t): t is TaskType => t !== 'perceived' && !!results[t],
  );

  // Global scores
  const distortion = perceived.finalState.globalBodyFat - actual.bodyFat;
  const taskDiscrepancies: Partial<Record<TaskType, number>> = {};
  for (const t of comparisons) {
    taskDiscrepancies[t] =
      results[t]!.finalState.globalBodyFat - perceived.finalState.globalBodyFat;
  }

  // Regional breakdown
  const segmentDistortions: SegmentDistortion[] = SEGMENT_IDS.map((id) => {
    const segDef = SEGMENTS.find((s) => s.id === id);
    const perceivedDelta = perceived.finalState.segmentOverrides[id];
    const taskDeltas: Partial<Record<TaskType, number>> = {};
    for (const t of comparisons) {
      taskDeltas[t] = results[t]!.finalState.segmentOverrides[id] - perceivedDelta;
    }
    return {
      segmentId: id,
      label: segDef?.label ?? id,
      perceivedDelta,
      taskDeltas,
    };
  });

  // Peak distortion segments
  let maxDistortionSeg: SegmentId = 'waist';
  let maxDistortionVal = 0;
  let maxDissatisfactionSeg: SegmentId | undefined;
  let maxDissatisfactionVal = 0;

  for (const sd of segmentDistortions) {
    const absPerceived = Math.abs(sd.perceivedDelta);
    if (absPerceived > maxDistortionVal) {
      maxDistortionVal = absPerceived;
      maxDistortionSeg = sd.segmentId;
    }
    const idealDelta = sd.taskDeltas.ideal;
    if (idealDelta !== undefined && Math.abs(idealDelta) > maxDissatisfactionVal) {
      maxDissatisfactionVal = Math.abs(idealDelta);
      maxDissatisfactionSeg = sd.segmentId;
    }
  }

  // Adjustment-trajectory metrics per administered task
  const trajectories: BIDSScores['trajectories'] = {};
  const taskDurations: BIDSScores['taskDurations'] = {};
  let totalAssessmentDuration = 0;
  for (const t of selectedTasks) {
    const r = results[t];
    if (!r) continue;
    trajectories[t] = computeTrajectoryMetrics(r.adjustmentTrajectory, actual.bodyFat);
    taskDurations[t] = r.durationMs;
    totalAssessmentDuration += r.durationMs;
  }

  const dissatisfaction = taskDiscrepancies.ideal;
  const partnerDiscrepancy = taskDiscrepancies.partner;

  return {
    distortion,
    distortionMagnitude: Math.abs(distortion),
    taskDiscrepancies,
    ...(dissatisfaction !== undefined
      ? { dissatisfaction, dissatisfactionMagnitude: Math.abs(dissatisfaction) }
      : {}),
    ...(partnerDiscrepancy !== undefined ? { partnerDiscrepancy } : {}),
    segmentDistortions,
    maxDistortionSegment: maxDistortionSeg,
    ...(maxDissatisfactionSeg ? { maxDissatisfactionSegment: maxDissatisfactionSeg } : {}),
    trajectories,
    taskDurations,
    totalAssessmentDuration,
    clinicalFlag: Math.abs(distortion) > CLINICAL_THRESHOLD,
  };
}

/** Format milliseconds as "Xm Xs" */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Get a human-readable interpretation of a score */
export function interpretDistortion(score: number): string {
  if (Math.abs(score) < 1) return 'Accurate self-perception';
  if (score > 0) return 'Perceives body as heavier than actual';
  return 'Perceives body as thinner than actual';
}

export function interpretDissatisfaction(score: number): string {
  if (Math.abs(score) < 1) return 'Satisfied with perceived body';
  if (score < 0) return 'Desires a thinner body than perceived';
  return 'Desires a larger body than perceived';
}

export function interpretPartnerDiscrepancy(score: number): string {
  if (Math.abs(score) < 1) return 'Believes partner preference matches self-perception';
  if (score < 0) return 'Believes partner prefers a thinner body';
  return 'Believes partner prefers a larger body';
}

/**
 * Generic interpretation for any task-vs-perceived global discrepancy.
 * Uses the bespoke wording for the legacy ideal/partner tasks and a
 * registry-driven phrasing for everything else.
 */
export function interpretTaskDiscrepancy(task: TaskType, score: number): string {
  if (task === 'ideal') return interpretDissatisfaction(score);
  if (task === 'partner') return interpretPartnerDiscrepancy(score);
  const label = getTaskDefinition(task).label.toLowerCase();
  if (Math.abs(score) < 1) return `Matches self-perception (${label})`;
  if (score < 0) return `Believes a thinner body fits "${label}"`;
  return `Believes a larger body fits "${label}"`;
}

export interface RegionalHighlight {
  segmentId: SegmentId;
  label: string;
  delta: number;
  exceedsThreshold: boolean;
}

/**
 * Top regional changes for a delta accessor, largest magnitude first,
 * always including anything beyond the clinical threshold. Used by the
 * results page and the PDF regional interpretation.
 */
export function getTopRegionalChanges(
  segmentDistortions: SegmentDistortion[],
  getDelta: (sd: SegmentDistortion) => number | undefined,
  topN: number = 3,
): RegionalHighlight[] {
  const entries = segmentDistortions
    .map((sd) => ({ sd, delta: getDelta(sd) }))
    .filter((e): e is { sd: SegmentDistortion; delta: number } => e.delta !== undefined)
    .map(({ sd, delta }) => ({
      segmentId: sd.segmentId,
      label: sd.label,
      delta,
      exceedsThreshold: Math.abs(delta) > CLINICAL_THRESHOLD,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = entries.slice(0, topN);
  for (const e of entries.slice(topN)) {
    if (e.exceedsThreshold) top.push(e);
  }
  return top;
}

/** Sentence-form summary of the top regional changes for one comparison. */
export function describeRegionalChanges(
  highlights: RegionalHighlight[],
  comparisonLabel: string,
): string {
  const meaningful = highlights.filter((h) => Math.abs(h.delta) >= 1);
  if (meaningful.length === 0) {
    return `No significant regional change detected (${comparisonLabel}).`;
  }
  const parts = meaningful.map(
    (h) =>
      `${h.label} ${h.delta > 0 ? '+' : ''}${h.delta.toFixed(1)}%${h.exceedsThreshold ? ' (exceeds clinical threshold)' : ''}`,
  );
  return `Largest changes (${comparisonLabel}): ${parts.join('; ')}.`;
}

/** Get auto-generated regional interpretation (perceived vs actual). */
export function interpretRegionalDistortion(scores: BIDSScores): string {
  const highlights = getTopRegionalChanges(
    scores.segmentDistortions,
    (sd) => sd.perceivedDelta,
  );
  const maxSeg = highlights[0];
  if (!maxSeg || Math.abs(maxSeg.delta) < 1) {
    return 'No significant regional distortion detected.';
  }
  const region = maxSeg.label.toLowerCase();
  const direction = maxSeg.delta > 0 ? 'larger' : 'smaller';
  const lead = `Distortion is concentrated in the ${region} region (${maxSeg.delta > 0 ? '+' : ''}${maxSeg.delta.toFixed(1)}%), perceiving this area as ${direction} than baseline.`;
  return `${lead} ${describeRegionalChanges(highlights, 'perceived vs actual')}`;
}
