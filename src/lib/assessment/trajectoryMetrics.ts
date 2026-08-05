import type { AdjustmentEvent } from '@/types/assessment';
import type { SegmentId } from '@/types/scan';
import { SEGMENT_ORDER } from '@/lib/constants/segmentDefs';

export type TrajectoryControl = 'global' | SegmentId;

/** Derived trajectory metrics for one slider control within one task. */
export interface ControlTrajectoryMetrics {
  control: TrajectoryControl;
  /** Number of recorded adjustment events for this control. */
  adjustmentCount: number;
  /**
   * Total path length: the summed absolute value change across all
   * adjustments, in the control's native units (BF percentage points for
   * the global slider, override % for segments). Distance traveled, not
   * displacement — repeated back-and-forth accumulates.
   */
  pathLength: number;
  /** Sign changes between consecutive value deltas (indecision marker). */
  directionReversals: number;
  /**
   * Maximum excursion beyond the final answer along the direction of
   * approach — how far past their eventual answer the participant went
   * before coming back. 0 when the final value was approached monotonically.
   */
  overshootMagnitude: number;
  /** Time between this control's first and last adjustment. */
  dwellTimeMs: number;
  /**
   * Number of separate engagement episodes: consecutive runs of events on
   * this control, broken by adjustments to any other control.
   */
  visitCount: number;
  /** Revisits = max(0, visitCount - 1). */
  revisitCount: number;
  /** 1-based order in which this control was FIRST touched (0 = untouched). */
  firstTouchOrder: number;
}

/** Derived trajectory metrics for one complete assessment task. */
export interface TaskTrajectoryMetrics {
  totalAdjustments: number;
  /** Path length summed over all controls (mixed units; use per-control for analysis). */
  totalPathLength: number;
  totalDirectionReversals: number;
  totalRevisits: number;
  /** Controls in the order first engaged, e.g. ['global','waist','hips']. */
  engagementOrder: TrajectoryControl[];
  /** Control with the longest dwell time (null when no adjustments). */
  longestDwellControl: TrajectoryControl | null;
  perControl: ControlTrajectoryMetrics[];
}

const ALL_CONTROLS: readonly TrajectoryControl[] = ['global', ...SEGMENT_ORDER];

/**
 * Compute the full trajectory-metric set from a task's raw adjustment
 * event stream.
 *
 * Value-series convention: each control's series is seeded with its known
 * task-start value (segments start at 0; the global slider starts at the
 * participant's actual measured BF, passed as `startGlobalBF`), so the
 * first movement away from baseline counts toward path length, reversals,
 * and overshoot.
 */
export function computeTrajectoryMetrics(
  trajectory: AdjustmentEvent[],
  startGlobalBF: number,
): TaskTrajectoryMetrics {
  const startValue = (control: TrajectoryControl): number =>
    control === 'global' ? startGlobalBF : 0;

  // Group per control, preserving global order for visits / first-touch.
  const byControl = new Map<TrajectoryControl, AdjustmentEvent[]>();
  const firstTouch = new Map<TrajectoryControl, number>();
  let visitBoundaryControl: TrajectoryControl | null = null;
  const visitCounts = new Map<TrajectoryControl, number>();

  for (const ev of trajectory) {
    if (!byControl.has(ev.control)) {
      byControl.set(ev.control, []);
      firstTouch.set(ev.control, firstTouch.size + 1);
    }
    byControl.get(ev.control)!.push(ev);
    if (visitBoundaryControl !== ev.control) {
      visitCounts.set(ev.control, (visitCounts.get(ev.control) ?? 0) + 1);
      visitBoundaryControl = ev.control;
    }
  }

  const perControl: ControlTrajectoryMetrics[] = [];
  for (const control of ALL_CONTROLS) {
    const events = byControl.get(control) ?? [];
    if (events.length === 0) {
      perControl.push({
        control,
        adjustmentCount: 0,
        pathLength: 0,
        directionReversals: 0,
        overshootMagnitude: 0,
        dwellTimeMs: 0,
        visitCount: 0,
        revisitCount: 0,
        firstTouchOrder: 0,
      });
      continue;
    }

    const series = [startValue(control), ...events.map((e) => e.value)];
    let pathLength = 0;
    let reversals = 0;
    let prevDelta = 0;
    for (let k = 1; k < series.length; k++) {
      const delta = series[k] - series[k - 1];
      pathLength += Math.abs(delta);
      if (delta !== 0) {
        if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) {
          reversals++;
        }
        prevDelta = delta;
      }
    }

    const finalValue = series[series.length - 1];
    const approachDir = Math.sign(finalValue - series[0]);
    let overshoot = 0;
    for (const v of series) {
      const beyond =
        approachDir !== 0 ? (v - finalValue) * approachDir : Math.abs(v - finalValue);
      if (beyond > overshoot) overshoot = beyond;
    }

    const visitCount = visitCounts.get(control) ?? 0;
    perControl.push({
      control,
      adjustmentCount: events.length,
      pathLength,
      directionReversals: reversals,
      overshootMagnitude: overshoot,
      dwellTimeMs: events[events.length - 1].timestamp - events[0].timestamp,
      visitCount,
      revisitCount: Math.max(0, visitCount - 1),
      firstTouchOrder: firstTouch.get(control) ?? 0,
    });
  }

  const engagementOrder = [...firstTouch.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([control]) => control);

  let longestDwellControl: TrajectoryControl | null = null;
  let longestDwell = -1;
  for (const m of perControl) {
    if (m.adjustmentCount > 0 && m.dwellTimeMs > longestDwell) {
      longestDwell = m.dwellTimeMs;
      longestDwellControl = m.control;
    }
  }

  return {
    totalAdjustments: trajectory.length,
    totalPathLength: perControl.reduce((s, m) => s + m.pathLength, 0),
    totalDirectionReversals: perControl.reduce((s, m) => s + m.directionReversals, 0),
    totalRevisits: perControl.reduce((s, m) => s + m.revisitCount, 0),
    engagementOrder,
    longestDwellControl,
    perControl,
  };
}
