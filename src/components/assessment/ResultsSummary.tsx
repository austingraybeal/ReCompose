'use client';

import { motion } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import {
  formatDuration,
  interpretDistortion,
  interpretDissatisfaction,
  interpretPartnerDiscrepancy,
  interpretRegionalDistortion,
} from '@/lib/assessment/scoring';
import type { BIDSScores } from '@/types/assessment';

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

function SegmentBar({ label, value }: { label: string; value: number }) {
  const absValue = Math.abs(value);
  const maxBar = 25;
  const barWidth = Math.min((absValue / maxBar) * 100, 100);
  const isPositive = value >= 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-rc-xs font-mono w-20 shrink-0" style={{ color: 'var(--rc-text-secondary)' }}>
        {label}
      </span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--rc-bg-primary)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${barWidth}%`,
              background: isPositive
                ? 'linear-gradient(90deg, var(--rc-accent), #f0c84a)'
                : 'linear-gradient(90deg, #4ac8e8, var(--rc-accent))',
            }}
          />
        </div>
        <span
          className="text-rc-xs font-mono w-12 text-right tabular-nums"
          style={{
            color: absValue < 1
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

export default function ResultsSummary() {
  const record = useAssessmentStore((s) => s.assessmentRecord);
  const snapshots = useAssessmentStore((s) => s.snapshots);
  const resetAssessment = useAssessmentStore((s) => s.resetAssessment);

  if (!record) return null;

  const { scores } = record;

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
            Body Image Assessment Results
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

        {/* Snapshots */}
        {(snapshots.perceived || snapshots.ideal || snapshots.partner) && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            {(['perceived', 'ideal', 'partner'] as const).map((key) => {
              const snap = snapshots[key];
              const labels = { perceived: 'Perceived', ideal: 'Ideal', partner: 'Partner' };
              return (
                <div key={key} className="text-center">
                  <div
                    className="rounded-xl overflow-hidden mb-2 aspect-[3/4]"
                    style={{
                      background: 'var(--rc-bg-surface)',
                      border: key === 'ideal' ? '2px solid var(--rc-accent)' : '1px solid var(--rc-border-default)',
                    }}
                  >
                    {snap ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={snap} alt={labels[key]} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
                        No capture
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-[2px] font-mono"
                    style={{ color: key === 'ideal' ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}
                  >
                    {labels[key]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Score cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <ScoreCard
            label="Body Image Distortion (BIDS-D)"
            value={`${scores.distortion > 0 ? '+' : ''}${scores.distortion.toFixed(1)}%`}
            interpretation={interpretDistortion(scores.distortion)}
            severity={getSeverity(scores.distortionMagnitude)}
          />
          <ScoreCard
            label="Dissatisfaction (BIDS-S)"
            value={`${scores.dissatisfaction > 0 ? '+' : ''}${scores.dissatisfaction.toFixed(1)}%`}
            interpretation={interpretDissatisfaction(scores.dissatisfaction)}
            severity={getSeverity(scores.dissatisfactionMagnitude)}
          />
          <ScoreCard
            label="Partner Discrepancy (BIDS-P)"
            value={`${scores.partnerDiscrepancy > 0 ? '+' : ''}${scores.partnerDiscrepancy.toFixed(1)}%`}
            interpretation={interpretPartnerDiscrepancy(scores.partnerDiscrepancy)}
            severity={getSeverity(Math.abs(scores.partnerDiscrepancy))}
          />
        </div>

        {/* Regional distortion breakdown */}
        <div
          className="p-5 rounded-xl mb-8"
          style={{
            background: 'var(--rc-bg-surface)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[2px] font-mono mb-4" style={{ color: 'var(--rc-text-dim)' }}>
            Regional Distortion (Perceived)
          </div>
          {scores.segmentDistortions.map((sd) => (
            <SegmentBar key={sd.segmentId} label={sd.label} value={sd.perceivedDelta} />
          ))}
          <div className="mt-4 text-rc-xs leading-relaxed" style={{ color: 'var(--rc-text-secondary)' }}>
            {interpretRegionalDistortion(scores)}
          </div>
        </div>

        {/* Three-column table */}
        <div
          className="rounded-xl overflow-hidden mb-8"
          style={{
            background: 'var(--rc-bg-surface)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <table className="w-full text-rc-xs font-mono">
            <thead>
              <tr style={{ background: 'var(--rc-bg-elevated)' }}>
                <th className="text-left px-4 py-3" style={{ color: 'var(--rc-text-dim)' }}></th>
                <th className="text-right px-4 py-3" style={{ color: 'var(--rc-text-dim)' }}>Perceived</th>
                <th className="text-right px-4 py-3" style={{ color: 'var(--rc-text-dim)' }}>Ideal</th>
                <th className="text-right px-4 py-3" style={{ color: 'var(--rc-text-dim)' }}>Partner</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
                <td className="px-4 py-2.5" style={{ color: 'var(--rc-text-secondary)' }}>Global BF%</td>
                <td className="text-right px-4 py-2.5 tabular-nums" style={{ color: 'var(--rc-text-primary)' }}>
                  {record.tasks.perceived.finalState.globalBodyFat.toFixed(1)}%
                </td>
                <td className="text-right px-4 py-2.5 tabular-nums" style={{ color: 'var(--rc-text-primary)' }}>
                  {record.tasks.ideal.finalState.globalBodyFat.toFixed(1)}%
                </td>
                <td className="text-right px-4 py-2.5 tabular-nums" style={{ color: 'var(--rc-text-primary)' }}>
                  {record.tasks.partner.finalState.globalBodyFat.toFixed(1)}%
                </td>
              </tr>
              {scores.segmentDistortions.map((sd) => (
                <tr key={sd.segmentId} style={{ borderTop: '1px solid var(--rc-border-subtle)' }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--rc-text-secondary)' }}>{sd.label}</td>
                  <td className="text-right px-4 py-2.5 tabular-nums" style={{
                    color: sd.perceivedDelta !== 0 ? 'var(--rc-text-primary)' : 'var(--rc-text-dim)',
                  }}>
                    {sd.perceivedDelta > 0 ? '+' : ''}{sd.perceivedDelta.toFixed(0)}%
                  </td>
                  <td className="text-right px-4 py-2.5 tabular-nums" style={{
                    color: sd.idealDelta !== 0 ? 'var(--rc-text-primary)' : 'var(--rc-text-dim)',
                  }}>
                    {sd.idealDelta > 0 ? '+' : ''}{sd.idealDelta.toFixed(0)}%
                  </td>
                  <td className="text-right px-4 py-2.5 tabular-nums" style={{
                    color: sd.partnerDelta !== 0 ? 'var(--rc-text-primary)' : 'var(--rc-text-dim)',
                  }}>
                    {sd.partnerDelta > 0 ? '+' : ''}{sd.partnerDelta.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Behavioral metrics */}
        <div
          className="p-5 rounded-xl mb-8"
          style={{
            background: 'var(--rc-bg-surface)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[2px] font-mono mb-3" style={{ color: 'var(--rc-text-dim)' }}>
            Behavioral Metrics
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <BehaviorStat label="Perceived" value={formatDuration(scores.perceivedTaskDuration)} sub={`${record.tasks.perceived.resetCount} resets`} />
            <BehaviorStat label="Ideal" value={formatDuration(scores.idealTaskDuration)} sub={`${record.tasks.ideal.resetCount} resets`} />
            <BehaviorStat label="Partner" value={formatDuration(scores.partnerTaskDuration)} sub={`${record.tasks.partner.resetCount} resets`} />
            <BehaviorStat label="Total" value={formatDuration(scores.totalAssessmentDuration)} sub="total time" />
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
  const handleClick = async () => {
    const { generatePDFReport } = await import('@/lib/assessment/pdfReport');
    generatePDFReport(record, scores);
  };
  return (
    <button
      onClick={handleClick}
      className="px-5 py-2.5 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
      style={{
        background: 'linear-gradient(135deg, var(--rc-accent), #2aa88e)',
        color: '#0a0b0f',
        boxShadow: '0 4px 16px rgba(62, 207, 180, 0.25)',
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
  const handleClick = async () => {
    const { generateCSVExport } = await import('@/lib/assessment/csvExport');
    const csv = generateCSVExport(record, scores);
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
