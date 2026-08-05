import type { AssessmentRecord, BIDSScores, TaskType } from '@/types/assessment';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

const TASKS: readonly TaskType[] = ['perceived', 'ideal', 'partner'];

/**
 * Generate CSV export of assessment scores for SPSS/R/Excel import.
 *
 * Structure (three sections separated by blank lines, each with its own
 * header row — split on the '#' marker lines for programmatic import):
 *   1. Wide single-row summary: endpoints, BIDS scores, durations, and
 *      per-task trajectory summaries.
 *   2. '# trajectory_metrics' — long format, one row per task x control:
 *      path length, direction reversals, overshoot, dwell, visits,
 *      revisits, first-touch order.
 *   3. '# raw_adjustment_events' — the complete adjustment stream, one
 *      row per slider event with ms-since-task-start timestamps.
 */
export function generateCSVExport(record: AssessmentRecord, scores: BIDSScores): string {
  const perceivedSegHeaders = SEGMENT_ORDER.map((id) => `perceived_${id}`);
  const idealSegHeaders = SEGMENT_ORDER.map((id) => `ideal_${id}`);
  const partnerSegHeaders = SEGMENT_ORDER.map((id) => `partner_${id}`);

  const headers = [
    'assessment_id',
    'timestamp',
    'actual_bf',
    'actual_weight',
    'actual_bmi',
    'actual_waist',
    'actual_hip',
    'actual_whr',
    'perceived_global_bf',
    'ideal_global_bf',
    'partner_global_bf',
    ...perceivedSegHeaders,
    ...idealSegHeaders,
    ...partnerSegHeaders,
    'bids_distortion',
    'bids_dissatisfaction',
    'bids_partner_discrepancy',
    'distortion_magnitude',
    'dissatisfaction_magnitude',
    'max_distortion_segment',
    'max_dissatisfaction_segment',
    'perceived_duration_ms',
    'ideal_duration_ms',
    'partner_duration_ms',
    'total_duration_ms',
    'perceived_resets',
    'ideal_resets',
    'partner_resets',
    ...TASKS.flatMap((t) => [
      `${t}_traj_adjustments`,
      `${t}_traj_path_length`,
      `${t}_traj_reversals`,
      `${t}_traj_revisits`,
      `${t}_traj_engagement_order`,
      `${t}_traj_longest_dwell_control`,
    ]),
    'clinical_flag',
  ];

  const p = record.tasks.perceived.finalState;
  const i = record.tasks.ideal.finalState;
  const pt = record.tasks.partner.finalState;

  const values = [
    record.id,
    record.timestamp,
    record.actual.bodyFat,
    record.actual.weight,
    record.actual.bmi,
    record.actual.waistCirc,
    record.actual.hipCirc,
    record.actual.whr,
    p.globalBodyFat,
    i.globalBodyFat,
    pt.globalBodyFat,
    ...SEGMENT_ORDER.map((id) => p.segmentOverrides[id]),
    ...SEGMENT_ORDER.map((id) => i.segmentOverrides[id]),
    ...SEGMENT_ORDER.map((id) => pt.segmentOverrides[id]),
    scores.distortion,
    scores.dissatisfaction,
    scores.partnerDiscrepancy,
    scores.distortionMagnitude,
    scores.dissatisfactionMagnitude,
    scores.maxDistortionSegment,
    scores.maxDissatisfactionSegment,
    scores.perceivedTaskDuration,
    scores.idealTaskDuration,
    scores.partnerTaskDuration,
    scores.totalAssessmentDuration,
    record.tasks.perceived.resetCount,
    record.tasks.ideal.resetCount,
    record.tasks.partner.resetCount,
    ...TASKS.flatMap((t) => {
      const m = scores.trajectories[t];
      return [
        m.totalAdjustments,
        m.totalPathLength.toFixed(2),
        m.totalDirectionReversals,
        m.totalRevisits,
        `"${m.engagementOrder.join('>')}"`,
        m.longestDwellControl ?? '',
      ];
    }),
    scores.clinicalFlag ? 1 : 0,
  ];

  const lines: string[] = [headers.join(','), values.join(',')];

  // Section 2: per-control trajectory metrics (long format)
  lines.push('');
  lines.push('# trajectory_metrics');
  lines.push(
    [
      'assessment_id',
      'task',
      'control',
      'adjustment_count',
      'path_length',
      'direction_reversals',
      'overshoot_magnitude',
      'dwell_time_ms',
      'visit_count',
      'revisit_count',
      'first_touch_order',
    ].join(','),
  );
  for (const t of TASKS) {
    for (const m of scores.trajectories[t].perControl) {
      lines.push(
        [
          record.id,
          t,
          m.control,
          m.adjustmentCount,
          m.pathLength.toFixed(2),
          m.directionReversals,
          m.overshootMagnitude.toFixed(2),
          m.dwellTimeMs,
          m.visitCount,
          m.revisitCount,
          m.firstTouchOrder,
        ].join(','),
      );
    }
  }

  // Section 3: complete raw adjustment stream
  lines.push('');
  lines.push('# raw_adjustment_events');
  lines.push(['assessment_id', 'task', 'timestamp_ms', 'control', 'value'].join(','));
  for (const t of TASKS) {
    for (const ev of record.tasks[t].adjustmentTrajectory) {
      lines.push([record.id, t, ev.timestamp, ev.control, ev.value].join(','));
    }
  }

  return lines.join('\n') + '\n';
}
