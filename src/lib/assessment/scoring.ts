import type { TaskResult, ActualMetrics, BIDSScores, SegmentDistortion } from '@/types/assessment';
import type { SegmentId } from '@/types/scan';
import { SEGMENTS, SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

/** BF% deviation threshold for clinical flag */
export const CLINICAL_THRESHOLD = 5.0;

const SEGMENT_IDS: readonly SegmentId[] = SEGMENT_ORDER;

export function calculateBIDSScores(
  perceived: TaskResult,
  ideal: TaskResult,
  partner: TaskResult,
  actual: ActualMetrics
): BIDSScores {
  // Global scores
  const distortion = perceived.finalState.globalBodyFat - actual.bodyFat;
  const dissatisfaction = ideal.finalState.globalBodyFat - perceived.finalState.globalBodyFat;
  const partnerDiscrepancy = partner.finalState.globalBodyFat - perceived.finalState.globalBodyFat;

  // Regional breakdown
  const segmentDistortions: SegmentDistortion[] = SEGMENT_IDS.map((id) => {
    const segDef = SEGMENTS.find((s) => s.id === id);
    return {
      segmentId: id,
      label: segDef?.label ?? id,
      perceivedDelta: perceived.finalState.segmentOverrides[id],
      idealDelta: ideal.finalState.segmentOverrides[id],
      partnerDelta: partner.finalState.segmentOverrides[id],
    };
  });

  // Find segments with highest absolute distortion
  let maxDistortionSeg: SegmentId = 'waist';
  let maxDistortionVal = 0;
  let maxDissatisfactionSeg: SegmentId = 'waist';
  let maxDissatisfactionVal = 0;

  for (const sd of segmentDistortions) {
    const absPerceived = Math.abs(sd.perceivedDelta);
    const absDissatisfaction = Math.abs(sd.idealDelta - sd.perceivedDelta);
    if (absPerceived > maxDistortionVal) {
      maxDistortionVal = absPerceived;
      maxDistortionSeg = sd.segmentId;
    }
    if (absDissatisfaction > maxDissatisfactionVal) {
      maxDissatisfactionVal = absDissatisfaction;
      maxDissatisfactionSeg = sd.segmentId;
    }
  }

  // Durations
  const perceivedTaskDuration = perceived.durationMs;
  const idealTaskDuration = ideal.durationMs;
  const partnerTaskDuration = partner.durationMs;
  const totalAssessmentDuration = perceivedTaskDuration + idealTaskDuration + partnerTaskDuration;

  return {
    distortion,
    dissatisfaction,
    partnerDiscrepancy,
    distortionMagnitude: Math.abs(distortion),
    dissatisfactionMagnitude: Math.abs(dissatisfaction),
    segmentDistortions,
    maxDistortionSegment: maxDistortionSeg,
    maxDissatisfactionSegment: maxDissatisfactionSeg,
    perceivedTaskDuration,
    idealTaskDuration,
    partnerTaskDuration,
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

/** Get auto-generated regional interpretation */
export function interpretRegionalDistortion(scores: BIDSScores): string {
  const maxSeg = scores.segmentDistortions.find(
    (s) => s.segmentId === scores.maxDistortionSegment
  );
  if (!maxSeg || Math.abs(maxSeg.perceivedDelta) < 1) {
    return 'No significant regional distortion detected.';
  }

  const region = maxSeg.label.toLowerCase();
  const direction = maxSeg.perceivedDelta > 0 ? 'larger' : 'smaller';
  return `Distortion is concentrated in the ${region} region (${maxSeg.perceivedDelta > 0 ? '+' : ''}${maxSeg.perceivedDelta.toFixed(1)}%), perceiving this area as ${direction} than baseline. This may indicate ${region}-focused body image concern.`;
}
