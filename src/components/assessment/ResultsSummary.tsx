'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import { useScanStore } from '@/lib/stores/scanStore';
import { useGenderStore } from '@/lib/stores/genderStore';
import {
  formatDuration,
  interpretDistortion,
  interpretTaskDiscrepancy,
  getTopRegionalChanges,
  describeRegionalChanges,
} from '@/lib/assessment/scoring';
import { getTaskDefinition } from '@/lib/assessment/taskRegistry';
import { computeDerivedValues } from '@/lib/assessment/derivedValues';
import type { BIDSScores, TaskType, SegmentDistortion } from '@/types/assessment';

function ScoreCard({
  label,
  value,
  interpretation,
  severity,
}: {
  label: string;
  value: string;
  interpretation: string;
  severity: 'low' | 'moderate' | 'high';
}) {
  const colorMap = {
    low: 'var(--rc-accent)',
    moderate: '#f0c84a',
    high: '#e0445a',
  };
  const color = colorMap[severity];

  return (
    <div
      className="p-4 rounded-xl"
      style={{
        background: 'var(--rc-bg-surface)',
        border: '1px solid var(--rc-border-default)',
      }}
    >
      <div className="text-[9px] uppercase tracking-[2px] font-mono mb-2" style={{ color: 'var(--rc-text-dim)' }}>
        {label}
      </div>
      <div className="font-mono font-bold text-xl mb-1" style={{ color }}>
        {value}
      </div>
      <div className="text-rc-xs" style={{ color: 'var(--rc-text-secondary)' }}>
        {interpretation}
      </div>
    </div>
  );
}

function getSeverity(magnitude: number): 'low' | 'moderate' | 'high' {
  if (magnitude < 3) return 'low';
  if (magnitude < 5) return 'moderate';
  return 'high';
}

/** Zero-centered diverging bar: negative extends left, positive right. */
function DivergingBar({ label, value }: { label: string; value: number }) {
  const maxBar = 15;
  const pct = Math.min(Math.abs(value) / maxBar, 1) * 50; // % of half-width
  const isPositive = value >= 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-rc-xs font-mono w-20 shrink-0" style={{ color: 'var(--rc-text-secondary)' }}>
        {label}
      </span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2.5 rounded-full relative overflow-hidden" style={{ background: 'var(--rc-bg-primary)' }}>
          {/* center line */}
          <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--rc-border-default)' }} />
          <div
            className="absolute top-0 bottom-0 transition-all duration-500"
            style={{
              left: isPositive ? '50%' : `${50 - pct}%`,
              width: `${pct}%`,
              background: isPositive
                ? 'linear-gradient(90deg, var(--rc-accent), #f0c84a)'
                : 'linear-gradient(90deg, #7f9cf5, var(--rc-accent))',
              borderRadius: '9999px',
            }}
          />
        </div>
        <span
          className="text-rc-xs font-mono w-14 text-right tabular-nums"
          style={{
            color: Math.abs(value) < 1
              ? 'var(--rc-text-dim)'
              : isPositive
                ? 'var(--rc-delta-positive)'
                : 'var(--rc-delta-negative)',
          }}
        >
          {value > 0 ? '+' : ''}{value.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/** Plain-language explanations for the behavioral metrics. */
const BEHAVIOR_LEGEND: Array<[string, string]> = [
  ['Adjustments', 'total slider movements made during the task'],
  ['Path length', 'total distance the sliders traveled, not just where they ended — searching before committing'],
  ['Reversals', 'direction changes (up-down-up) — indecision within a region'],
  ['Revisits', 'times a slider was left and returned to — inability to leave an answer alone'],
  ['Longest dwell', 'the body region engaged for the longest time'],
  ['Engagement order', 'which controls were touched first'],
];

export default function ResultsSummary() {
  const record = useAssessmentStore((s) => s.assessmentRecord);
  const ghostSnapshots = useAssessmentStore((s) => s.snapshots);
  const plainSnapshots = useAssessmentStore((s) => s.snapshotsPlain);
  const resetAssessment = useAssessmentStore((s) => s.resetAssessment);
  const scanData = useScanStore((s) => s.scanData);
  const sex = useGenderStore((s) => s.gender);

  const tasks = record?.selectedTasks ?? [];
  const defaultView: TaskType = tasks.includes('ideal')
    ? 'ideal'
    : (tasks.find((t) => t !== 'perceived') ?? 'perceived');
  const [selectedView, setSelectedView] = useState<TaskType>(defaultView);
  // Ghost shell on the result images — defaults on; falls back to the
  // ghost captures when a plain capture is missing.
  const [showGhostImages, setShowGhostImages] = useState(true);
  const snapshots = showGhostImages
    ? ghostSnapshots
    : { ...ghostSnapshots, ...plainSnapshots };

  const derived = useMemo(
    () => (record && scanData ? computeDerivedValues(record, scanData, sex) : []),
    [record, scanData, sex],
  );

  if (!record) return null;

  const { scores } = record;
  const comparisons = tasks.filter((t) => t !== 'perceived');

  // Regional deltas for the selected view: perceived => vs actual;
  // any other task => vs perceived.
  const viewDelta = (sd: SegmentDistortion): number | undefined =>
    selectedView === 'perceived' ? sd.perceivedDelta : sd.taskDeltas[selectedView];
  const viewGlobal = record.tasks[selectedView]!.finalState.globalBodyFat;
  const viewDisplacement =
    selectedView === 'perceived'
      ? scores.distortion
      : (scores.taskDiscrepancies[selectedView] ?? 0);
  const viewComparisonLabel =
    selectedView === 'perceived' ? 'perceived vs actual' : `${getTaskDefinition(selectedView).shortLabel.toLowerCase()} vs perceived`;
  const viewHighlights = getTopRegionalChanges(scores.segmentDistortions, viewDelta);
  const viewTrajectory = scores.trajectories[selectedView];

  // Per-image pill value: perceived shows distortion vs actual; others vs perceived.
  const imagePill = (t: TaskType): number =>
    t === 'perceived' ? scores.distortion : (scores.taskDiscrepancies[t] ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 overflow-y-auto"
      style={{ background: 'rgba(10, 11, 15, 0.95)', backdropFilter: 'blur(24px)' }}
    >
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-[10px] uppercase tracking-[3px] font-mono mb-2" style={{ color: 'var(--rc-accent)' }}>
            Assessment Complete
          </div>
          <h2 className="font-mono font-bold text-xl" style={{ color: 'var(--rc-text-primary)' }}>
            BIDS Assessment Results
          </h2>
        </div>

        {/* Clinical flag banner */}
        {scores.clinicalFlag && (
          <div
            className="mb-6 px-4 py-3 rounded-xl flex items-start gap-3"
            style={{
              background: 'rgba(224, 68, 90, 0.1)',
              border: '1px solid rgba(224, 68, 90, 0.3)',
            }}
          >
            <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="#e0445a" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <div className="text-rc-sm font-medium" style={{ color: '#e0445a' }}>
                Clinical Threshold Exceeded
              </div>
              <div className="text-rc-xs mt-0.5" style={{ color: 'var(--rc-text-secondary)' }}>
                Body image distortion exceeds clinical threshold ({scores.distortionMagnitude.toFixed(1)} BF% units). Consider further assessment.
              </div>
            </div>
          </div>
        )}

        {/* Snapshots — clickable; drive the regional/behavioral views */}
        <div className="flex flex-wrap justify-center gap-3 mb-2">
          {tasks.map((key) => {
            const snap = snapshots[key];
            const def = getTaskDefinition(key);
            const active = key === selectedView;
            const pill = imagePill(key);
            return (
              <button
                key={key}
                onClick={() => setSelectedView(key)}
                className="text-center transition-all duration-200"
                style={{ width: 'calc(33.333% - 0.5rem)' }}
              >
                <div
                  className="rounded-xl overflow-hidden mb-2 aspect-[3/4]"
                  style={{
                    background: 'var(--rc-bg-surface)',
                    border: active ? '2px solid var(--rc-accent)' : '1px solid var(--rc-border-default)',
                    boxShadow: active ? '0 0 20px rgba(168, 98, 248, 0.25)' : 'none',
                  }}
                >
                  {snap ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={snap} alt={def.shortLabel} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
                      No capture
                    </div>
                  )}
                </div>
                <div
                  className="text-[13px] uppercase tracking-[2px] font-mono font-bold mb-1"
                  style={{ color: active ? 'var(--rc-accent)' : 'var(--rc-text-secondary)' }}
                >
                  {def.shortLabel}
                </div>
                <span
                  className="inline-block px-3 py-1 rounded-full text-[12px] font-mono font-bold leading-none"
                  style={{
                    background: 'var(--rc-bg-surface)',
                    border: '1px solid var(--rc-border-default)',
                    color: Math.abs(pill) < 1
                      ? 'var(--rc-text-dim)'
                      : pill > 0
                        ? 'var(--rc-delta-positive)'
                        : 'var(--rc-delta-negative)',
                  }}
                >
                  {pill > 0 ? '+' : ''}{pill.toFixed(1)}%{key === 'perceived' ? ' vs actual' : ' vs perceived'}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
            Click an image to explore its regional and behavioral results.
          </span>
          <button
            onClick={() => setShowGhostImages((v) => !v)}
            className="px-3 py-1 rounded-full text-rc-xs font-mono transition-all duration-150"
            style={{
              background: showGhostImages ? 'rgba(168, 98, 248, 0.12)' : 'var(--rc-bg-elevated)',
              color: showGhostImages ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
              border: showGhostImages
                ? '1px solid rgba(168, 98, 248, 0.3)'
                : '1px solid var(--rc-border-default)',
            }}
          >
            Ghost {showGhostImages ? 'On' : 'Off'}
          </button>
        </div>

        {/* Score cards: distortion + every selected comparison vs perceived */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <ScoreCard
            label="Body Image Distortion (BIDS-D)"
            value={`${scores.distortion > 0 ? '+' : ''}${scores.distortion.toFixed(1)}%`}
            interpretation={interpretDistortion(scores.distortion)}
            severity={getSeverity(scores.distortionMagnitude)}
          />
          {comparisons.map((t) => {
            const d = scores.taskDiscrepancies[t] ?? 0;
            const def = getTaskDefinition(t);
            return (
              <ScoreCard
                key={t}
                label={`${def.shortLabel} vs Perceived`}
                value={`${d > 0 ? '+' : ''}${d.toFixed(1)}%`}
                interpretation={interpretTaskDiscrepancy(t, d)}
                severity={getSeverity(Math.abs(d))}
              />
            );
          })}
        </div>

        {/* Regional distortion for the selected view (zero-centered bars) */}
        <div
          className="p-5 rounded-xl mb-8"
          style={{
            background: 'var(--rc-bg-surface)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-[10px] uppercase tracking-[2px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>
              Regional Distortion
            </div>
            <div className="text-rc-xs font-mono" style={{ color: 'var(--rc-accent)' }}>
              {getTaskDefinition(selectedView).shortLabel} ({viewComparisonLabel})
            </div>
          </div>
          {scores.segmentDistortions.map((sd) => (
            <DivergingBar key={sd.segmentId} label={sd.label} value={viewDelta(sd) ?? 0} />
          ))}
          <div className="mt-4 text-rc-sm leading-relaxed" style={{ color: 'var(--rc-text-secondary)' }}>
            {describeRegionalChanges(viewHighlights, viewComparisonLabel)}
          </div>
          {/* Global displacement for the selected view */}
          <div className="mt-3 pt-3 flex items-baseline gap-3" style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
            <span className="text-rc-xs font-mono uppercase tracking-[1.5px]" style={{ color: 'var(--rc-text-dim)' }}>
              Global BF%
            </span>
            <span className="font-mono font-bold text-rc-base" style={{ color: 'var(--rc-text-primary)' }}>
              {viewGlobal.toFixed(1)}%
            </span>
            <span
              className="font-mono text-rc-sm"
              style={{
                color: Math.abs(viewDisplacement) < 1
                  ? 'var(--rc-text-dim)'
                  : viewDisplacement > 0
                    ? 'var(--rc-delta-positive)'
                    : 'var(--rc-delta-negative)',
              }}
            >
              ({viewDisplacement > 0 ? '+' : ''}{viewDisplacement.toFixed(1)} {viewComparisonLabel})
            </span>
          </div>
        </div>

        {/* Per-task table with global displacement row */}
        <div
          className="rounded-xl overflow-x-auto mb-8"
          style={{
            background: 'var(--rc-bg-surface)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <table className="w-full text-rc-xs font-mono">
            <thead>
              <tr style={{ background: 'var(--rc-bg-elevated)' }}>
                <th className="text-left px-4 py-3" style={{ color: 'var(--rc-text-dim)' }}></th>
                {tasks.map((t) => (
                  <th key={t} className="text-right px-4 py-3" style={{ color: t === selectedView ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}>
                    {getTaskDefinition(t).shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
                <td className="px-4 py-2.5" style={{ color: 'var(--rc-text-secondary)' }}>Global BF%</td>
                {tasks.map((t) => (
                  <td key={t} className="text-right px-4 py-2.5 tabular-nums" style={{ color: 'var(--rc-text-primary)' }}>
                    {record.tasks[t]!.finalState.globalBodyFat.toFixed(1)}%
                  </td>
                ))}
              </tr>
              <tr style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
                <td className="px-4 py-2.5" style={{ color: 'var(--rc-text-secondary)' }}>Displacement</td>
                {tasks.map((t) => {
                  const d = imagePill(t);
                  return (
                    <td key={t} className="text-right px-4 py-2.5 tabular-nums" style={{
                      color: Math.abs(d) < 1 ? 'var(--rc-text-dim)' : d > 0 ? 'var(--rc-delta-positive)' : 'var(--rc-delta-negative)',
                    }}>
                      {d > 0 ? '+' : ''}{d.toFixed(1)}%
                    </td>
                  );
                })}
              </tr>
              {scores.segmentDistortions.map((sd) => (
                <tr key={sd.segmentId} style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--rc-text-secondary)' }}>{sd.label}</td>
                  {tasks.map((t) => {
                    const v = record.tasks[t]!.finalState.segmentOverrides[sd.segmentId];
                    return (
                      <td key={t} className="text-right px-4 py-2.5 tabular-nums" style={{
                        color: v !== 0 ? 'var(--rc-text-primary)' : 'var(--rc-text-dim)',
                      }}>
                        {v > 0 ? '+' : ''}{v.toFixed(0)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Derived real-world measurements per task */}
        {derived.length > 0 && (
          <div
            className="rounded-xl overflow-x-auto mb-8"
            style={{
              background: 'var(--rc-bg-surface)',
              border: '1px solid var(--rc-border-default)',
            }}
          >
            <div className="px-4 pt-4 text-[10px] uppercase tracking-[2px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>
              Implied Measurements
            </div>
            <div className="px-4 pt-1 pb-2 text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
              Real-world values each avatar state corresponds to, from the same projection model as the live metrics.
            </div>
            <table className="w-full text-rc-xs font-mono">
              <thead>
                <tr style={{ background: 'var(--rc-bg-elevated)' }}>
                  <th className="text-left px-4 py-2.5" style={{ color: 'var(--rc-text-dim)' }}>Measure</th>
                  <th className="text-right px-4 py-2.5" style={{ color: 'var(--rc-text-dim)' }}>Actual</th>
                  {tasks.map((t) => (
                    <th key={t} className="text-right px-4 py-2.5" style={{ color: t === selectedView ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}>
                      {getTaskDefinition(t).shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {derived.map((row) => (
                  <tr key={row.key} style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--rc-text-secondary)' }}>
                      {row.label}{row.unit ? ` (${row.unit})` : ''}
                    </td>
                    <td className="text-right px-4 py-2 tabular-nums" style={{ color: 'var(--rc-text-primary)' }}>
                      {row.actual.toFixed(row.precision ?? 1)}
                    </td>
                    {tasks.map((t) => {
                      const v = row.perTask[t];
                      return (
                        <td key={t} className="text-right px-4 py-2 tabular-nums" style={{ color: 'var(--rc-text-primary)' }}>
                          {v === undefined ? '—' : v.toFixed(row.precision ?? 1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Behavioral metrics for the selected view */}
        <div
          className="p-5 rounded-xl mb-8"
          style={{
            background: 'var(--rc-bg-surface)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[2px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>
              Behavioral Metrics
            </div>
            <div className="text-rc-xs font-mono" style={{ color: 'var(--rc-accent)' }}>
              {getTaskDefinition(selectedView).shortLabel}
            </div>
          </div>
          {viewTrajectory ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <BehaviorStat
                label="Duration"
                value={formatDuration(scores.taskDurations[selectedView] ?? 0)}
                sub={`${record.tasks[selectedView]!.resetCount} resets`}
              />
              <BehaviorStat label="Adjustments" value={`${viewTrajectory.totalAdjustments}`} sub={`path ${viewTrajectory.totalPathLength.toFixed(1)}`} />
              <BehaviorStat label="Reversals" value={`${viewTrajectory.totalDirectionReversals}`} sub={`${viewTrajectory.totalRevisits} revisits`} />
              <BehaviorStat
                label="Longest Dwell"
                value={viewTrajectory.longestDwellControl ?? '—'}
                sub={`order: ${viewTrajectory.engagementOrder.slice(0, 3).join(' > ') || '—'}${viewTrajectory.engagementOrder.length > 3 ? ' …' : ''}`}
              />
            </div>
          ) : (
            <div className="text-rc-xs mb-4" style={{ color: 'var(--rc-text-dim)' }}>No trajectory data.</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {BEHAVIOR_LEGEND.map(([term, expl]) => (
              <div key={term} className="text-rc-xs leading-relaxed" style={{ color: 'var(--rc-text-dim)' }}>
                <span style={{ color: 'var(--rc-text-secondary)' }}>{term}:</span> {expl}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 justify-center">
          <DownloadPDFButton record={record} scores={scores} />
          <DownloadJSONButton record={record} />
          <DownloadCSVButton record={record} scores={scores} />
          <button
            onClick={resetAssessment}
            className="px-5 py-2.5 rounded-xl font-mono text-rc-xs tracking-wide transition-all duration-150"
            style={{
              background: 'var(--rc-bg-elevated)',
              color: 'var(--rc-text-secondary)',
              border: '1px solid var(--rc-border-default)',
            }}
          >
            Return to Viewer
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function BehaviorStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[1.5px] font-mono mb-1" style={{ color: 'var(--rc-text-dim)' }}>{label}</div>
      <div className="font-mono font-bold text-rc-base" style={{ color: 'var(--rc-text-primary)' }}>{value}</div>
      <div className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>{sub}</div>
    </div>
  );
}

function DownloadPDFButton({ record, scores }: { record: import('@/types/assessment').AssessmentRecord; scores: BIDSScores }) {
  const snapshots = useAssessmentStore((s) => s.snapshots);
  const scanData = useScanStore((s) => s.scanData);
  const sex = useGenderStore((s) => s.gender);
  const handleClick = async () => {
    const { generatePDFReport } = await import('@/lib/assessment/pdfReport');
    const derived = scanData ? computeDerivedValues(record, scanData, sex) : undefined;
    generatePDFReport(record, scores, { snapshots, derived });
  };
  return (
    <button
      onClick={handleClick}
      className="px-5 py-2.5 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
      style={{
        background: 'linear-gradient(135deg, var(--rc-accent), #4d1979)',
        color: '#0a0b0f',
        boxShadow: '0 4px 16px rgba(168, 98, 248, 0.25)',
      }}
    >
      Download PDF Report
    </button>
  );
}

function DownloadJSONButton({ record }: { record: import('@/types/assessment').AssessmentRecord }) {
  const handleClick = () => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recompose-assessment-${record.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={handleClick}
      className="px-5 py-2.5 rounded-xl font-mono text-rc-xs tracking-wide transition-all duration-150"
      style={{
        background: 'var(--rc-bg-elevated)',
        color: 'var(--rc-text-secondary)',
        border: '1px solid var(--rc-border-default)',
      }}
    >
      Download JSON
    </button>
  );
}

function DownloadCSVButton({ record, scores }: { record: import('@/types/assessment').AssessmentRecord; scores: BIDSScores }) {
  const scanData = useScanStore((s) => s.scanData);
  const sex = useGenderStore((s) => s.gender);
  const handleClick = async () => {
    const { generateCSVExport } = await import('@/lib/assessment/csvExport');
    const derived = scanData ? computeDerivedValues(record, scanData, sex) : undefined;
    const csv = generateCSVExport(record, scores, derived);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recompose-assessment-${record.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={handleClick}
      className="px-5 py-2.5 rounded-xl font-mono text-rc-xs tracking-wide transition-all duration-150"
      style={{
        background: 'var(--rc-bg-elevated)',
        color: 'var(--rc-text-secondary)',
        border: '1px solid var(--rc-border-default)',
      }}
    >
      Download CSV
    </button>
  );
}
