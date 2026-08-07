'use client';

import { useMemo } from 'react';
import type { AssessmentRecord, BIDSScores, TaskType } from '@/types/assessment';
import type { DerivedRow } from '@/lib/assessment/derivedValues';
import {
  computeFigureData,
  computeDesiredChange,
  type FigureData,
} from '@/lib/assessment/figureData';

function FigureCard({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: 'var(--rc-bg-surface)', border: '1px solid var(--rc-border-default)' }}
    >
      <div className="text-rc-xs font-mono font-bold mb-3" style={{ color: 'var(--rc-text-primary)' }}>
        <span style={{ color: 'var(--rc-accent)' }}>Fig {n}</span> — {title}
      </div>
      {children}
    </div>
  );
}

/** Fig 1 — column chart: global BF% per state. */
function BFColumns({ fig }: { fig: FigureData }) {
  const W = 400;
  const H = 150;
  const pad = { l: 24, r: 6, t: 14, b: 18 };
  const vMax = Math.max(10, ...fig.bfColumns.map((c) => c.value)) * 1.18;
  const n = fig.bfColumns.length;
  const slot = (W - pad.l - pad.r) / n;
  const barW = Math.min(34, slot * 0.55);
  const plotH = H - pad.t - pad.b;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--rc-border-default)" strokeWidth="1" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--rc-border-default)" strokeWidth="1" />
      <text x={pad.l - 3} y={pad.t + 3} fontSize="8" fill="var(--rc-text-dim)" textAnchor="end">{vMax.toFixed(0)}</text>
      <text x={pad.l - 3} y={H - pad.b} fontSize="8" fill="var(--rc-text-dim)" textAnchor="end">0</text>
      {fig.bfColumns.map((c, i) => {
        const x = pad.l + slot * i + (slot - barW) / 2;
        const h = (c.value / vMax) * plotH;
        return (
          <g key={c.label}>
            <rect x={x} y={H - pad.b - h} width={barW} height={h} rx={2} fill={c.color} />
            <text x={x + barW / 2} y={H - pad.b - h - 3} fontSize="8.5" fontWeight="bold" fill="var(--rc-text-primary)" textAnchor="middle">
              {c.value.toFixed(1)}
            </text>
            <text x={x + barW / 2} y={H - pad.b + 10} fontSize="7.5" fill="var(--rc-text-dim)" textAnchor="middle">
              {c.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Fig 2 — radar of the 8-segment profile per perspective. */
function SegmentRadar({ fig }: { fig: FigureData }) {
  const W = 400;
  const H = 230;
  const R = 82;
  const cx = 140;
  const cy = H / 2;
  const nAxes = fig.radarAxes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / nAxes;
  const pt = (i: number, v: number): [number, number] => {
    const r = ((v + 15) / 30) * R;
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  };
  const ringPath = (level: number) =>
    Array.from({ length: nAxes }, (_, i) => pt(i, level))
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ') + ' Z';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[-7.5, 7.5, 15].map((level) => (
        <path key={level} d={ringPath(level)} fill="none" stroke="var(--rc-border-subtle)" strokeWidth="1" />
      ))}
      <path d={ringPath(0)} fill="none" stroke="var(--rc-text-dim)" strokeWidth="1.2" />
      {fig.radarAxes.map((label, i) => {
        const [ex, ey] = pt(i, 15);
        const lx = cx + Math.cos(angle(i)) * (R + 10);
        const ly = cy + Math.sin(angle(i)) * (R + 10);
        const cos = Math.cos(angle(i));
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--rc-border-subtle)" strokeWidth="0.7" />
            <text
              x={lx}
              y={ly + 2.5}
              fontSize="7.5"
              fill="var(--rc-text-dim)"
              textAnchor={Math.abs(cos) <= 0.3 ? 'middle' : cos < 0 ? 'end' : 'start'}
            >
              {label}
            </text>
          </g>
        );
      })}
      {fig.radarSeries.map((s) => (
        <g key={s.task}>
          <path
            d={
              s.values.map((v, i) => {
                const [x, y] = pt(i, v);
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
              }).join(' ') + ' Z'
            }
            fill={s.color}
            fillOpacity="0.07"
            stroke={s.color}
            strokeWidth="1.6"
          />
          {s.values.map((v, i) => {
            const [x, y] = pt(i, v);
            return <circle key={i} cx={x} cy={y} r={2} fill={s.color} />;
          })}
        </g>
      ))}
      {/* Legend */}
      {fig.radarSeries.map((s, i) => (
        <g key={`legend-${s.task}`}>
          <rect x={278} y={26 + i * 15 - 6} width={9} height={9} rx={2} fill={s.color} />
          <text x={291} y={26 + i * 15 + 2} fontSize="8.5" fill="var(--rc-text-secondary)">{s.label}</text>
        </g>
      ))}
      <text x={278} y={36 + fig.radarSeries.length * 15} fontSize="7" fill="var(--rc-text-dim)">
        Middle ring = 0 (no change);
      </text>
      <text x={278} y={45 + fig.radarSeries.length * 15} fontSize="7" fill="var(--rc-text-dim)">
        outer = +15, center = −15.
      </text>
    </svg>
  );
}

/**
 * Fig 3 — desired change per measurement, % of the comparison baseline.
 * Labels live in a fixed left column and values in a fixed right column,
 * fully separated from the bar area so nothing can ever overlap.
 */
function DesiredChangeBars({ dc }: { dc: NonNullable<ReturnType<typeof computeDesiredChange>> }) {
  const W = 420;
  const rowH = 17;
  const H = dc.rows.length * rowH + 8;
  const labelW = 84;
  const valueColW = 48;
  const chartX = labelW + 8;
  const chartW = W - chartX - valueColW - 8;
  const half = chartW / 2;
  const xc = chartX + half;
  const maxAbs = Math.max(5, ...dc.rows.map((r) => Math.abs(r.pct)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={xc} y1={2} x2={xc} y2={H - 6} stroke="var(--rc-border-default)" strokeWidth="1" />
      {dc.rows.map((r, i) => {
        const cy = i * rowH + rowH / 2 + 2;
        const len = (Math.abs(r.pct) / maxAbs) * half;
        return (
          <g key={r.label}>
            <text x={labelW} y={cy + 3} fontSize="8.5" fill="var(--rc-text-secondary)" textAnchor="end">
              {r.label}
            </text>
            <rect
              x={r.pct >= 0 ? xc : xc - len}
              y={cy - 4.5}
              width={Math.max(1, len)}
              height={9}
              rx={2}
              fill="var(--rc-accent)"
            />
            <text
              x={W - 4}
              y={cy + 3}
              fontSize="8"
              fill="var(--rc-text-primary)"
              textAnchor="end"
            >
              {r.pct > 0 ? '+' : ''}{r.pct.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Fig 4 — combo: seconds on task (bars) vs adjustments + path length (lines). */
function EffortCombo({ fig }: { fig: FigureData }) {
  const W = 400;
  const H = 170;
  const pad = { l: 28, r: 28, t: 12, b: 30 };
  const plotH = H - pad.t - pad.b;
  const tMax = Math.max(10, ...fig.effort.map((e) => e.durationS)) * 1.2;
  const sMax = Math.max(
    5,
    ...fig.effort.map((e) => e.adjustments),
    ...fig.effort.map((e) => e.pathLength),
  ) * 1.15;
  const n = fig.effort.length;
  const slot = (W - pad.l - pad.r) / n;
  const barW = Math.min(30, slot * 0.5);
  const centerX = (i: number) => pad.l + slot * i + slot / 2;
  const secY = (v: number) => pad.t + plotH - (v / sMax) * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--rc-border-default)" strokeWidth="1" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--rc-border-default)" strokeWidth="1" />
      <line x1={W - pad.r} y1={pad.t} x2={W - pad.r} y2={H - pad.b} stroke="var(--rc-border-default)" strokeWidth="1" />
      <text x={pad.l - 3} y={pad.t + 3} fontSize="8" fill="var(--rc-text-dim)" textAnchor="end">{Math.round(tMax)}s</text>
      <text x={pad.l - 3} y={H - pad.b} fontSize="8" fill="var(--rc-text-dim)" textAnchor="end">0</text>
      <text x={W - pad.r + 3} y={pad.t + 3} fontSize="8" fill="var(--rc-text-dim)">{Math.round(sMax)}</text>
      <text x={W - pad.r + 3} y={H - pad.b} fontSize="8" fill="var(--rc-text-dim)">0</text>
      {fig.effort.map((e, i) => {
        const h = (e.durationS / tMax) * plotH;
        const x = centerX(i) - barW / 2;
        return (
          <g key={e.task}>
            <rect x={x} y={H - pad.b - h} width={barW} height={h} rx={2} fill={e.color} fillOpacity={0.85} />
            <text x={centerX(i)} y={H - pad.b + 11} fontSize="7.5" fill="var(--rc-text-dim)" textAnchor="middle">{e.label}</text>
          </g>
        );
      })}
      <polyline
        points={fig.effort.map((e, i) => `${centerX(i)},${secY(e.adjustments)}`).join(' ')}
        fill="none" stroke="var(--rc-text-primary)" strokeWidth="1.6"
      />
      {fig.effort.map((e, i) => (
        <circle key={`a-${e.task}`} cx={centerX(i)} cy={secY(e.adjustments)} r={2.4} fill="var(--rc-text-primary)" />
      ))}
      <polyline
        points={fig.effort.map((e, i) => `${centerX(i)},${secY(e.pathLength)}`).join(' ')}
        fill="none" stroke="#7f9cf5" strokeWidth="1.6" strokeDasharray="5 4"
      />
      {fig.effort.map((e, i) => (
        <circle key={`p-${e.task}`} cx={centerX(i)} cy={secY(e.pathLength)} r={2.4} fill="#7f9cf5" />
      ))}
      <text x={pad.l} y={H - 4} fontSize="7" fill="var(--rc-text-dim)">
        Bars: seconds on task. Solid line: adjustments; dashed: path length (right axis).
      </text>
    </svg>
  );
}

/** Fig 5 — heatmap of adjustments per control x task. */
function AdjustmentHeatmap({ fig }: { fig: FigureData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-rc-xs font-mono" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {fig.heatControls.map((c) => (
              <th key={c} className="px-1 pb-1 font-normal text-[9px]" style={{ color: 'var(--rc-text-dim)' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fig.heatTasks.map((t, ti) => (
            <tr key={t.task}>
              <td className="pr-2 text-right whitespace-nowrap" style={{ color: 'var(--rc-text-secondary)' }}>
                {t.label}
              </td>
              {fig.heatCounts[ti].map((count, ci) => {
                const intensity = (count / fig.heatMax) * 0.85;
                return (
                  <td
                    key={ci}
                    className="text-center rounded tabular-nums"
                    style={{
                      background: `rgba(168, 98, 248, ${(intensity * 0.9).toFixed(2)})`,
                      color: intensity > 0.45 ? '#0a0b0f' : 'var(--rc-text-secondary)',
                      padding: '6px 2px',
                    }}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 text-[10px]" style={{ color: 'var(--rc-text-dim)' }}>
        Cell intensity scales with adjustment count.
      </div>
    </div>
  );
}

/** The five assessment figures plus the adaptive headline. */
export default function ResultFigures({
  record,
  scores,
  derived,
  selectedView,
}: {
  record: AssessmentRecord;
  scores: BIDSScores;
  derived: DerivedRow[];
  selectedView: TaskType;
}) {
  const fig = useMemo(
    () => computeFigureData(record, scores, derived),
    [record, scores, derived],
  );
  // Fig 3 follows the clicked image: perceived vs actual, others vs perceived.
  const dc = useMemo(
    () => computeDesiredChange(derived, selectedView),
    [derived, selectedView],
  );

  return (
    <div className="mb-8">
      <div className="text-[10px] uppercase tracking-[2px] font-mono mb-2" style={{ color: 'var(--rc-text-dim)' }}>
        Figures
      </div>
      <div
        className="mb-4 px-4 py-3 rounded-xl text-rc-sm leading-relaxed italic"
        style={{
          background: 'var(--rc-bg-surface)',
          border: '1px solid var(--rc-border-default)',
          color: 'var(--rc-text-primary)',
        }}
      >
        {fig.headline}
      </div>
      <div className="grid grid-cols-1 gap-4">
        <FigureCard n={1} title="Global body fat by state (%)">
          <BFColumns fig={fig} />
        </FigureCard>
        <FigureCard n={2} title="Regional profile across perspectives (−15 to +15)">
          <SegmentRadar fig={fig} />
        </FigureCard>
        {dc && (
          <FigureCard n={3} title={`Desired change — ${dc.taskLabel} ${dc.vsLabel} (% of ${dc.vsLabel === 'vs Perceived' ? 'perceived' : 'actual'})`}>
            <DesiredChangeBars dc={dc} />
          </FigureCard>
        )}
        <FigureCard n={4} title="Time on task vs adjustments and path length">
          <EffortCombo fig={fig} />
        </FigureCard>
        <FigureCard n={5} title="Adjustments per control × task">
          <AdjustmentHeatmap fig={fig} />
        </FigureCard>
      </div>
    </div>
  );
}
