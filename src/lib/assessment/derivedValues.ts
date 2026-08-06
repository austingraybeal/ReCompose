import type { AssessmentRecord, TaskType } from '@/types/assessment';
import type { ScanData, SegmentOverrides } from '@/types/scan';
import type { BodyGender } from '@/lib/stores/genderStore';
import { projectMetrics } from '@/lib/morph/metricProjection';
import { computeAndroidness } from '@/lib/morph/sensitivityModel';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

export interface DerivedRow {
  key: string;
  label: string;
  unit: string;
  /** Value at the actual measured body. */
  actual: number;
  /** Implied value for each administered task's avatar state. */
  perTask: Partial<Record<TaskType, number>>;
}

const ZERO_OVERRIDES: SegmentOverrides = SEGMENT_ORDER.reduce((acc, id) => {
  acc[id] = 0;
  return acc;
}, {} as SegmentOverrides);

/**
 * Real-world measurement values implied by each task's avatar state:
 * the actual scanned circumferences, the values the perceived body would
 * have, and the values each comparison task's body would have — all via
 * the same projection model that drives the live metrics panel.
 */
export function computeDerivedValues(
  record: AssessmentRecord,
  scanData: ScanData,
  sex: BodyGender,
): DerivedRow[] {
  const { bodyComp, rings, measures } = scanData;
  const actualBF = record.actual.bodyFat;
  const androidness = computeAndroidness(sex, bodyComp.waistToHipRatio);

  const project = (bf: number, overrides: SegmentOverrides) =>
    projectMetrics(bodyComp, actualBF, bf, overrides, rings, measures, sex, androidness);

  const actualM = project(actualBF, ZERO_OVERRIDES);
  const perTaskM: Partial<Record<TaskType, ReturnType<typeof project>>> = {};
  for (const t of record.selectedTasks) {
    const task = record.tasks[t];
    if (!task) continue;
    perTaskM[t] = project(task.finalState.globalBodyFat, task.finalState.segmentOverrides);
  }

  const defs: Array<{ key: keyof ReturnType<typeof project>; label: string; unit: string }> = [
    { key: 'weight', label: 'Weight', unit: 'lbs' },
    { key: 'bmi', label: 'BMI', unit: '' },
    { key: 'waistCirc', label: 'Waist', unit: 'cm' },
    { key: 'hipCirc', label: 'Hip', unit: 'cm' },
    { key: 'shoulderCirc', label: 'Shoulder', unit: 'cm' },
    { key: 'torsoVolumeL', label: 'Torso Volume', unit: 'L' },
    { key: 'chestCirc', label: 'Chest', unit: 'cm' },
    { key: 'bicepCirc', label: 'Upper Arm', unit: 'cm' },
    { key: 'forearmCirc', label: 'Forearm', unit: 'cm' },
    { key: 'thighCirc', label: 'Thigh', unit: 'cm' },
    { key: 'calfCirc', label: 'Calf', unit: 'cm' },
  ];

  return defs
    .filter((d) => (actualM[d.key] as number) > 0)
    .map((d) => ({
      key: d.key as string,
      label: d.label,
      unit: d.unit,
      actual: actualM[d.key] as number,
      perTask: Object.fromEntries(
        Object.entries(perTaskM).map(([t, m]) => [t, m![d.key] as number]),
      ) as Partial<Record<TaskType, number>>,
    }));
}
