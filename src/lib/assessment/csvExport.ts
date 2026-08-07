import type { AssessmentRecord, BIDSScores } from '@/types/assessment';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';
import { getTaskDefinition } from './taskRegistry';
import type { DerivedRow } from './derivedValues';

/**
 * Generate CSV export of assessment scores for SPSS/R/Excel import.
 * Adapts to whatever task set was administered (record.selectedTasks).
 *
 * Structure (sections separated by blank lines, each with its own header
 * row — split on the '#' marker lines for programmatic import):
 *   1. Wide single-row summary: endpoints, BIDS scores, per-task global
 *      discrepancies vs perceived, durations, and per-task trajectory
 *      summaries.
 *   2. '# trajectory_metrics' — long format, one row per task x control.
 *   3. '# raw_adjustment_events' — the complete adjustment stream.
 */
export function generateCSVExport(
  record: AssessmentRecord,
  scores: BIDSScores,
  derived?: DerivedRow[],
): string {
  const tasks = record.selectedTasks;
  const comparisons = tasks.filter((t) => t !== 'perceived');

  const headers = [
    'assessment_id',
    'participant_id',
    'scan_id',
    'timestamp',
    'selected_tasks',
    'actual_bf',
    'actual_weight',
    'actual_bmi',
    'actual_waist',
    'actual_hip',
    'actual_whr',
    ...tasks.map((t) => `${t}_global_bf`),
    ...comparisons.map((t) => `${t}_vs_perceived_global_bf`),
    ...tasks.flatMap((t) => SEGMENT_ORDER.map((id) => `${t}_${id}`)),
    'bids_distortion',
    'distortion_magnitude',
    'max_distortion_segment',
    ...tasks.map((t) => `${t}_duration_ms`),
    'total_duration_ms',
    ...tasks.map((t) => `${t}_resets`),
    'coefficient_profile',
    ...tasks.flatMap((t) => [
      `${t}_traj_adjustments`,
      `${t}_traj_path_length`,
      `${t}_traj_reversals`,
      `${t}_traj_visits`,
      `${t}_traj_revisits`,
      `${t}_traj_peak_overshoot`,
      `${t}_traj_longest_dwell_control`,
    ]),
    'clinical_flag',
  ];

  const values: (string | number)[] = [
    record.id,
    `"${record.participantId ?? ''}"`,
    `"${record.scanId}"`,
    record.timestamp,
    `"${tasks.join('>')}"`,
    record.actual.bodyFat,
    record.actual.weight,
    record.actual.bmi,
    record.actual.waistCirc,
    record.actual.hipCirc,
    record.actual.whr,
    ...tasks.map((t) => record.tasks[t]!.finalState.globalBodyFat),
    ...comparisons.map((t) => (scores.taskDiscrepancies[t] ?? 0).toFixed(2)),
    ...tasks.flatMap((t) =>
      SEGMENT_ORDER.map((id) => record.tasks[t]!.finalState.segmentOverrides[id]),
    ),
    scores.distortion,
    scores.distortionMagnitude,
    scores.maxDistortionSegment,
    ...tasks.map((t) => scores.taskDurations[t] ?? 0),
    scores.totalAssessmentDuration,
    ...tasks.map((t) => record.tasks[t]!.resetCount),
    `"${record.coefficientProfile ?? 'default'}"`,
    ...tasks.flatMap((t) => {
      const m = scores.trajectories[t];
      if (!m) return [0, '0', 0, 0, 0, '0', ''];
      const visits = m.perControl.reduce((sum, c) => sum + c.visitCount, 0);
      const peakOvershoot = Math.max(0, ...m.perControl.map((c) => c.overshootMagnitude));
      return [
        m.totalAdjustments,
        m.totalPathLength.toFixed(2),
        m.totalDirectionReversals,
        visits,
        m.totalRevisits,
        peakOvershoot.toFixed(2),
        m.longestDwellControl ?? '',
      ];
    }),
    scores.clinicalFlag ? 1 : 0,
  ];

  const lines: string[] = [
    '# ReCompose BIDS Assessment Export',
    `# scan: ${record.scanId}  |  exported: ${record.timestamp}`,
    '',
    '# summary',
    headers.join(','),
    values.join(','),
  ];

  // Derived real-world values implied by each task's avatar state
  if (derived && derived.length > 0) {
    lines.push('');
    lines.push('# derived_measurements');
    lines.push(
      ['measure', 'unit', 'actual', ...tasks.map((t) => t), ...tasks.map((t) => `${t}_delta_vs_actual`)].join(','),
    );
    for (const row of derived) {
      lines.push(
        [
          `"${row.label}"`,
          row.unit,
          row.actual,
          ...tasks.map((t) => row.perTask[t] ?? ''),
          ...tasks.map((t) => {
            const v = row.perTask[t];
            return v === undefined ? '' : (v - row.actual).toFixed(row.precision ?? 1);
          }),
        ].join(','),
      );
    }
  }

  // Engagement order matrix: one row per task, one column per control,
  // cell = the rank at which the control was first touched ('untouched'
  // when it was never moved).
  lines.push('');
  lines.push('# engagement_order');
  lines.push(['task', 'task_label', 'global', ...SEGMENT_ORDER].join(','));
  for (const t of tasks) {
    const traj = scores.trajectories[t];
    const rank = (control: string): string => {
      const c = traj?.perControl.find((p) => p.control === control);
      return c && c.firstTouchOrder > 0 ? String(c.firstTouchOrder) : 'untouched';
    };
    lines.push(
      [
        t,
        `"${getTaskDefinition(t).shortLabel}"`,
        rank('global'),
        ...SEGMENT_ORDER.map((id) => rank(id)),
      ].join(','),
    );
  }

  // Section 2: per-control trajectory metrics (long format)
  lines.push('');
  lines.push('# trajectory_metrics');
  lines.push(
    [
      'assessment_id',
      'task',
      'task_label',
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
  for (const t of tasks) {
    const traj = scores.trajectories[t];
    if (!traj) continue;
    const label = getTaskDefinition(t).shortLabel;
    for (const m of traj.perControl) {
      lines.push(
        [
          record.id,
          t,
          `"${label}"`,
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
  for (const t of tasks) {
    for (const ev of record.tasks[t]!.adjustmentTrajectory) {
      lines.push([record.id, t, ev.timestamp, ev.control, ev.value].join(','));
    }
  }

  return lines.join('\n') + '\n';
}
