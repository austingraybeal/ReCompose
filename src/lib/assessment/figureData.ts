import type { AssessmentRecord, BIDSScores, TaskType } from '@/types/assessment';
import { SEGMENTS, SEGMENT_ORDER } from '@/lib/constants/segmentDefs';
import { getTaskDefinition } from './taskRegistry';
import type { DerivedRow } from './derivedValues';

/** Distinct series colors, assigned to tasks by administration order. */
const TASK_PALETTE = [
  '#a862f8', '#f0c84a', '#34d399', '#7f9cf5', '#e879d9',
  '#fb923c', '#4dd4c0', '#f472b6', '#c084fc', '#94a3b8',
];

export const ACTUAL_COLOR = '#e8eaed';

export interface BFColumn {
  label: string;
  value: number;
  color: string;
}

export interface RadarSeries {
  task: TaskType;
  label: string;
  color: string;
  /** One value per SEGMENT_ORDER entry, on the -15..+15 override scale. */
  values: number[];
}

export interface DesiredChangeRow {
  label: string;
  /** Change vs actual as % of actual (unit-free). */
  pct: number;
}

export interface EffortRow {
  task: TaskType;
  label: string;
  color: string;
  durationS: number;
  adjustments: number;
  pathLength: number;
}

export interface FigureData {
  taskColors: Partial<Record<TaskType, string>>;
  /** Fig 1 — global BF% per state: Actual first, then each task. */
  bfColumns: BFColumn[];
  /** Fig 2 — 8-segment profile per task. */
  radarAxes: string[];
  radarSeries: RadarSeries[];
  /** Fig 3 — desired change per measurement (% of actual). Null when the
      reference task has no derived rows. */
  desiredChange: { taskLabel: string; rows: DesiredChangeRow[] } | null;
  /** Fig 4 — time on task vs adjustments and path length. */
  effort: EffortRow[];
  /** Fig 5 — adjustments per control x task. */
  heatControls: string[];
  heatTasks: Array<{ task: TaskType; label: string }>;
  /** counts[taskIndex][controlIndex] */
  heatCounts: number[][];
  heatMax: number;
  /** Data-adaptive one-sentence read of the whole assessment. */
  headline: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function computeFigureData(
  record: AssessmentRecord,
  scores: BIDSScores,
  derived: DerivedRow[],
): FigureData {
  const tasks = record.selectedTasks;
  const comparisons = tasks.filter((t) => t !== 'perceived');
  const taskColors: Partial<Record<TaskType, string>> = {};
  tasks.forEach((t, i) => {
    taskColors[t] = TASK_PALETTE[i % TASK_PALETTE.length];
  });
  const shortLabel = (t: TaskType) => getTaskDefinition(t).shortLabel;

  // Fig 1 — BF columns
  const bfColumns: BFColumn[] = [
    { label: 'Actual', value: r1(record.actual.bodyFat), color: ACTUAL_COLOR },
    ...tasks.map((t) => ({
      label: shortLabel(t),
      value: r1(record.tasks[t]!.finalState.globalBodyFat),
      color: taskColors[t]!,
    })),
  ];

  // Fig 2 — radar
  const radarAxes = SEGMENT_ORDER.map(
    (id) => SEGMENTS.find((s) => s.id === id)?.label ?? id,
  );
  const radarSeries: RadarSeries[] = tasks.map((t) => ({
    task: t,
    label: shortLabel(t),
    color: taskColors[t]!,
    values: SEGMENT_ORDER.map((id) => record.tasks[t]!.finalState.segmentOverrides[id]),
  }));

  // Fig 3 — desired change vs actual, % of actual. Reference task: ideal
  // when administered, otherwise the first comparison.
  const refTask = tasks.includes('ideal') ? 'ideal' : comparisons[0];
  let desiredChange: FigureData['desiredChange'] = null;
  if (refTask) {
    const rows = derived
      .filter((d) => d.key !== 'heightCm' && d.actual > 0 && d.perTask[refTask] !== undefined)
      .map((d) => ({
        label: d.label,
        pct: r1(((d.perTask[refTask]! - d.actual) / d.actual) * 100),
      }));
    if (rows.length > 0) {
      desiredChange = { taskLabel: shortLabel(refTask), rows };
    }
  }

  // Fig 4 — effort combo
  const effort: EffortRow[] = tasks.map((t) => {
    const traj = scores.trajectories[t];
    return {
      task: t,
      label: shortLabel(t),
      color: taskColors[t]!,
      durationS: Math.round((scores.taskDurations[t] ?? 0) / 1000),
      adjustments: traj?.totalAdjustments ?? 0,
      pathLength: r1(traj?.totalPathLength ?? 0),
    };
  });

  // Fig 5 — heatmap: adjustments per control x task
  const heatControls = ['Global', ...radarAxes];
  const controlIds = ['global', ...SEGMENT_ORDER];
  const heatTasks = tasks.map((t) => ({ task: t, label: shortLabel(t) }));
  const heatCounts = tasks.map((t) => {
    const traj = scores.trajectories[t];
    return controlIds.map(
      (c) => traj?.perControl.find((p) => p.control === c)?.adjustmentCount ?? 0,
    );
  });
  const heatMax = Math.max(1, ...heatCounts.flat());

  return {
    taskColors,
    bfColumns,
    radarAxes,
    radarSeries,
    desiredChange,
    effort,
    heatControls,
    heatTasks,
    heatCounts,
    heatMax,
    headline: buildHeadline(record, scores, derived),
  };
}

/** Compose the adaptive headline sentence from the assessment data. */
function buildHeadline(
  record: AssessmentRecord,
  scores: BIDSScores,
  derived: DerivedRow[],
): string {
  const comparisons = record.selectedTasks.filter((t) => t !== 'perceived');
  const shortLabel = (t: TaskType) => getTaskDefinition(t).shortLabel;
  const parts: string[] = [];

  // Distortion clause
  const d = scores.distortion;
  const distortionWord = d >= 0 ? 'self-overestimation' : 'self-underestimation';
  const maxSegLabel = (
    SEGMENTS.find((s) => s.id === scores.maxDistortionSegment)?.label ??
    scores.maxDistortionSegment
  ).toLowerCase();
  parts.push(
    `${d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(1)} pt ${distortionWord} with max regional distortion at the ${maxSegLabel}`,
  );

  // Most extreme comparison clause
  if (comparisons.length > 0) {
    const extreme = comparisons.reduce((a, b) =>
      Math.abs(scores.taskDiscrepancies[b] ?? 0) > Math.abs(scores.taskDiscrepancies[a] ?? 0) ? b : a,
    );
    const extremeBF = record.tasks[extreme]!.finalState.globalBodyFat;
    const torso = derived.find((row) => row.key === 'torsoVolumeL');
    const torsoV = torso?.perTask[extreme];
    const torsoPct =
      torso && torsoV !== undefined && torso.actual > 0
        ? Math.round(((torsoV - torso.actual) / torso.actual) * 100)
        : null;
    let clause = `a ${shortLabel(extreme).toLowerCase()} body at ${extremeBF.toFixed(1)}% BF`;
    if (torsoPct !== null && Math.abs(torsoPct) >= 5) {
      clause += ` (${torsoPct > 0 ? '+' : ''}${torsoPct}% torso volume)`;
    }
    if (comparisons.length > 1) {
      const others = comparisons.filter((t) => t !== extreme);
      const nearest = others.reduce((a, b) =>
        Math.abs(scores.taskDiscrepancies[b] ?? 0) > Math.abs(scores.taskDiscrepancies[a] ?? 0) ? b : a,
      );
      const gap =
        Math.abs(scores.taskDiscrepancies[extreme] ?? 0) -
        Math.abs(scores.taskDiscrepancies[nearest] ?? 0);
      if (gap > 2) {
        clause += ` — well beyond the ${shortLabel(nearest).toLowerCase()} body`;
      }
    }
    parts.push(clause);
  }

  // Behavioral clause: the most worked-over task
  const trajTasks = record.selectedTasks.filter((t) => scores.trajectories[t]);
  if (trajTasks.length > 0) {
    const busiest = trajTasks.reduce((a, b) =>
      (scores.trajectories[b]!.totalAdjustments > scores.trajectories[a]!.totalAdjustments ? b : a),
    );
    const busy = scores.trajectories[busiest]!;
    const otherPaths = trajTasks
      .filter((t) => t !== busiest)
      .map((t) => scores.trajectories[t]!.totalPathLength);
    const avgOther =
      otherPaths.length > 0
        ? otherPaths.reduce((a, b) => a + b, 0) / otherPaths.length
        : 0;
    const ratio = avgOther > 0 ? busy.totalPathLength / avgOther : 0;
    const durS = Math.round((scores.taskDurations[busiest] ?? 0) / 1000);
    let clause = `the ${shortLabel(busiest).toLowerCase()} task drew the most work (${busy.totalAdjustments} adjustments`;
    if (ratio >= 1.5) clause += `, ${ratio.toFixed(1)}× the path length of the other tasks`;
    clause += ` in ${durS} s)`;
    parts.push(clause);
  }

  return parts.join('; ') + '.';
}
