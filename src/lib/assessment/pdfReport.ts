import type { AssessmentRecord, BIDSScores, TaskType } from '@/types/assessment';
import {
  formatDuration,
  interpretDistortion,
  interpretTaskDiscrepancy,
  getTopRegionalChanges,
  describeRegionalChanges,
} from './scoring';
import { getTaskDefinition } from './taskRegistry';
import type { DerivedRow } from './derivedValues';

export interface PDFReportExtras {
  /** Ghost-overlay snapshots captured at each task confirm (data URLs). */
  snapshots?: Partial<Record<TaskType, string>>;
  /** Implied real-world measurements (actual + per task). */
  derived?: DerivedRow[];
}

type RGB = [number, number, number];

const BG: RGB = [10, 11, 15];
const SURFACE: RGB = [26, 29, 40];
const ACCENT: RGB = [168, 98, 248];
const TEXT: RGB = [232, 234, 237];
const TEXT_SECONDARY: RGB = [156, 160, 174];
const TEXT_DIM: RGB = [107, 112, 128];
const WARM: RGB = [224, 68, 90];
const COOL: RGB = [74, 200, 232];
const BORDER: RGB = [38, 42, 56];

/** Blend the surface color toward warm (positive) or cool (negative). */
function heatColor(frac: number): RGB {
  const f = Math.max(-1, Math.min(1, frac));
  const target = f >= 0 ? WARM : COOL;
  const t = Math.abs(f) * 0.55; // cap so overlaid text stays readable
  return [
    Math.round(SURFACE[0] + (target[0] - SURFACE[0]) * t),
    Math.round(SURFACE[1] + (target[1] - SURFACE[1]) * t),
    Math.round(SURFACE[2] + (target[2] - SURFACE[2]) * t),
  ];
}

function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 3, h: img.naturalHeight || 4 });
    img.onerror = () => resolve({ w: 3, h: 4 });
    img.src = src;
  });
}

/**
 * Generate the clinical PDF report. Adapts to whatever task set was
 * administered (record.selectedTasks) and, when provided, embeds the
 * per-task ghost snapshots, implied-measurement heat maps, tabulated
 * behavioral metrics, and per-task adjustment-trajectory figures.
 * Dynamically imports jsPDF to avoid SSR issues.
 */
export async function generatePDFReport(
  record: AssessmentRecord,
  scores: BIDSScores,
  extras: PDFReportExtras = {},
) {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const tasks = record.selectedTasks;
  const comparisons = tasks.filter((t) => t !== 'perceived');
  const shortLabel = (t: TaskType) => getTaskDefinition(t).shortLabel;

  const paintBackground = () => {
    doc.setFillColor(...BG);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      paintBackground();
      y = margin;
    }
  };

  const sectionTitle = (title: string, room = 14) => {
    ensureRoom(room);
    doc.setTextColor(...ACCENT);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 6;
  };

  paintBackground();

  // ── Header ────────────────────────────────────────────────────────────
  doc.setTextColor(...ACCENT);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ReCompose BIDS Assessment', margin, y);
  y += 8;

  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(record.timestamp).toLocaleString();
  doc.text(`Assessment Date: ${dateStr}  |  Scan ID: ${record.scanId}`, margin, y);
  y += 10;

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Scan summary ──────────────────────────────────────────────────────
  sectionTitle('SCAN SUMMARY');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const scanMetrics = [
    `Actual Body Fat: ${record.actual.bodyFat.toFixed(1)}%`,
    `Weight: ${record.actual.weight.toFixed(1)} lbs`,
    `BMI: ${record.actual.bmi.toFixed(1)}`,
    `Waist: ${record.actual.waistCirc.toFixed(1)} cm`,
    `Hip: ${record.actual.hipCirc.toFixed(1)} cm`,
    `WHR: ${record.actual.whr.toFixed(2)}`,
  ];
  const summaryColW = contentWidth / 3;
  scanMetrics.forEach((m, i) => {
    doc.text(m, margin + (i % 3) * summaryColW, y + Math.floor(i / 3) * 5);
  });
  y += Math.ceil(scanMetrics.length / 3) * 5 + 6;

  // ── Task snapshots (ghost images), rows of 3, centered remainder ─────
  const snapshots = extras.snapshots ?? {};
  const snapTasks = tasks.filter((t) => snapshots[t]);
  if (snapTasks.length > 0) {
    const gap = 4;
    const perRow = 3;
    const imgW = (contentWidth - gap * (perRow - 1)) / perRow;
    const sizes = await Promise.all(snapTasks.map((t) => loadImageSize(snapshots[t]!)));
    const imgH = Math.max(
      ...sizes.map((s) => imgW * (s.h / s.w)),
    );
    const cellH = imgH + 10; // image + label + pill line

    sectionTitle('TASK AVATARS (ghost = actual body)', cellH + 14);
    for (let rowStart = 0; rowStart < snapTasks.length; rowStart += perRow) {
      const row = snapTasks.slice(rowStart, rowStart + perRow);
      ensureRoom(cellH + 2);
      const rowWidth = row.length * imgW + (row.length - 1) * gap;
      const startX = margin + (contentWidth - rowWidth) / 2; // center remainder
      row.forEach((t, i) => {
        const x = startX + i * (imgW + gap);
        const size = sizes[snapTasks.indexOf(t)];
        const h = imgW * (size.h / size.w);
        doc.setFillColor(...SURFACE);
        doc.rect(x, y, imgW, imgH, 'F');
        try {
          doc.addImage(snapshots[t]!, 'PNG', x, y + (imgH - h) / 2, imgW, h);
        } catch {
          // corrupt data URL — leave the placeholder box
        }
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.3);
        doc.rect(x, y, imgW, imgH, 'S');

        doc.setTextColor(...TEXT);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(shortLabel(t), x + imgW / 2, y + imgH + 4, { align: 'center' });

        const pill =
          t === 'perceived' ? scores.distortion : (scores.taskDiscrepancies[t] ?? 0);
        const pillLabel = t === 'perceived' ? 'vs actual' : 'vs perceived';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const sig = Math.abs(pill) >= 1;
        doc.setTextColor(...(sig ? (pill > 0 ? WARM : COOL) : TEXT_DIM));
        doc.text(
          `${pill > 0 ? '+' : ''}${pill.toFixed(1)}% ${pillLabel}`,
          x + imgW / 2,
          y + imgH + 8,
          { align: 'center' },
        );
      });
      y += cellH + 2;
    }
    y += 4;
  }

  // ── BIDS scores (tabulated) ──────────────────────────────────────────
  sectionTitle('BIDS SCORES', 24);
  const scoreRows: Array<{ label: string; value: number; desc: string; flagged: boolean }> = [
    {
      label: 'Distortion (Perceived vs Actual)',
      value: scores.distortion,
      desc: interpretDistortion(scores.distortion),
      flagged: scores.clinicalFlag,
    },
    ...comparisons.map((t) => {
      const d = scores.taskDiscrepancies[t] ?? 0;
      return {
        label: `${shortLabel(t)} vs Perceived`,
        value: d,
        desc: interpretTaskDiscrepancy(t, d),
        flagged: false,
      };
    }),
  ];

  const scLabelW = 58;
  const scValueW = 22;
  doc.setFillColor(...SURFACE);
  doc.rect(margin, y - 4, contentWidth, 6, 'F');
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Comparison', margin + 1.5, y);
  doc.text('Score (BF%)', margin + scLabelW, y);
  doc.text('Interpretation', margin + scLabelW + scValueW, y);
  y += 5;

  for (const row of scoreRows) {
    const descLines = doc.splitTextToSize(
      row.desc,
      contentWidth - scLabelW - scValueW - 2,
    ) as string[];
    const rowH = Math.max(5, descLines.length * 3.5 + 1.5);
    ensureRoom(rowH + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(row.label, margin + 1.5, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(row.flagged ? WARM : TEXT));
    doc.text(`${row.value > 0 ? '+' : ''}${row.value.toFixed(1)}`, margin + scLabelW, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(descLines, margin + scLabelW + scValueW, y);
    if (row.flagged) {
      doc.setTextColor(...WARM);
      doc.text('exceeds clinical threshold', margin + scLabelW, y + 3.5);
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowH - 2.5, pageWidth - margin, y + rowH - 2.5);
    y += rowH + 1;
  }
  y += 4;

  // ── Assessment results (per-task table, heat-mapped) ─────────────────
  const labelColW = 32;
  const taskColW = (contentWidth - labelColW) / tasks.length;
  const colX = (i: number) => margin + labelColW + i * taskColW;
  const tableFont = tasks.length > 5 ? 6 : 7;

  sectionTitle('ASSESSMENT RESULTS', 30);
  doc.setFillColor(...SURFACE);
  doc.rect(margin, y - 4, contentWidth, 6, 'F');
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(tableFont);
  doc.setFont('helvetica', 'bold');
  tasks.forEach((t, i) => doc.text(shortLabel(t), colX(i), y));
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tableFont);

  const tableRow = (
    label: string,
    values: Array<{ text: string; heat?: number }>,
  ) => {
    ensureRoom(6);
    values.forEach((v, i) => {
      if (v.heat !== undefined && Math.abs(v.heat) > 0.01) {
        doc.setFillColor(...heatColor(v.heat));
        doc.rect(colX(i) - 1, y - 3.2, taskColW - 1, 4.6, 'F');
      }
    });
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(label, margin, y);
    doc.setTextColor(...TEXT);
    values.forEach((v, i) => doc.text(v.text, colX(i), y));
    y += 5;
  };

  tableRow(
    'Global BF%',
    tasks.map((t) => ({
      text: `${record.tasks[t]!.finalState.globalBodyFat.toFixed(1)}%`,
    })),
  );
  tableRow(
    'Displacement',
    tasks.map((t) => {
      const d = t === 'perceived' ? scores.distortion : (scores.taskDiscrepancies[t] ?? 0);
      return { text: `${d > 0 ? '+' : ''}${d.toFixed(1)}%`, heat: d / 10 };
    }),
  );
  for (const sd of scores.segmentDistortions) {
    tableRow(
      sd.label,
      tasks.map((t) => {
        const v = record.tasks[t]!.finalState.segmentOverrides[sd.segmentId];
        return { text: `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, heat: v / 15 };
      }),
    );
  }
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(6);
  doc.text(
    'Displacement: perceived is vs actual; all other tasks are vs perceived. Cell color intensity tracks magnitude (warm = larger, cool = smaller).',
    margin,
    y,
  );
  y += 8;

  // ── Regional interpretation: top changes + threshold callouts ────────
  sectionTitle('REGIONAL DISTORTION SUMMARY', 24);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const regionalBlocks: string[] = [
    describeRegionalChanges(
      getTopRegionalChanges(scores.segmentDistortions, (sd) => sd.perceivedDelta),
      'perceived vs actual',
    ),
    ...comparisons.map((t) =>
      describeRegionalChanges(
        getTopRegionalChanges(scores.segmentDistortions, (sd) => sd.taskDeltas[t]),
        `${shortLabel(t).toLowerCase()} vs perceived`,
      ),
    ),
  ];
  for (const block of regionalBlocks) {
    const lines = doc.splitTextToSize(block, contentWidth) as string[];
    ensureRoom(lines.length * 4 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }
  y += 4;

  // ── Implied measurements (heat-mapped vs actual) ─────────────────────
  const derived = extras.derived ?? [];
  if (derived.length > 0) {
    const dLabelW = 30;
    const dActualW = 16;
    const dTaskW = (contentWidth - dLabelW - dActualW) / tasks.length;
    const dColX = (i: number) => margin + dLabelW + dActualW + i * dTaskW;

    sectionTitle('IMPLIED MEASUREMENTS', 30);
    doc.setFillColor(...SURFACE);
    doc.rect(margin, y - 4, contentWidth, 6, 'F');
    doc.setTextColor(...TEXT_DIM);
    doc.setFontSize(tableFont);
    doc.setFont('helvetica', 'bold');
    doc.text('Measure', margin + 1.5, y);
    doc.text('Actual', margin + dLabelW, y);
    tasks.forEach((t, i) => doc.text(shortLabel(t), dColX(i), y));
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(tableFont);
    for (const row of derived) {
      ensureRoom(6);
      tasks.forEach((t, i) => {
        const v = row.perTask[t];
        if (v === undefined || row.actual === 0) return;
        const frac = (v - row.actual) / (0.2 * Math.abs(row.actual));
        if (Math.abs(frac) > 0.02) {
          doc.setFillColor(...heatColor(frac));
          doc.rect(dColX(i) - 1, y - 3.2, dTaskW - 1, 4.6, 'F');
        }
      });
      doc.setTextColor(...TEXT_SECONDARY);
      doc.text(`${row.label}${row.unit ? ` (${row.unit})` : ''}`, margin + 1.5, y);
      doc.setTextColor(...TEXT);
      doc.text(row.actual.toFixed(1), margin + dLabelW, y);
      tasks.forEach((t, i) => {
        const v = row.perTask[t];
        doc.text(v === undefined ? '-' : v.toFixed(1), dColX(i), y);
      });
      y += 5;
    }
    doc.setTextColor(...TEXT_DIM);
    doc.setFontSize(6);
    doc.text(
      'Real-world values each avatar state implies, from the same projection model as the live metrics panel. Color = deviation from actual.',
      margin,
      y,
    );
    y += 8;
  }

  // ── Behavioral metrics (tabulated) ───────────────────────────────────
  sectionTitle('BEHAVIORAL METRICS', 40);
  doc.setFillColor(...SURFACE);
  doc.rect(margin, y - 4, contentWidth, 6, 'F');
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(tableFont);
  doc.setFont('helvetica', 'bold');
  tasks.forEach((t, i) => doc.text(shortLabel(t), colX(i), y));
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tableFont);
  const behaviorRow = (label: string, get: (t: TaskType) => string) => {
    ensureRoom(6);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(label, margin, y);
    doc.setTextColor(...TEXT);
    tasks.forEach((t, i) => doc.text(get(t), colX(i), y));
    y += 4.5;
  };
  behaviorRow('Duration', (t) => formatDuration(scores.taskDurations[t] ?? 0));
  behaviorRow('Resets', (t) => `${record.tasks[t]!.resetCount}`);
  behaviorRow('Adjustments', (t) => `${scores.trajectories[t]?.totalAdjustments ?? 0}`);
  behaviorRow('Path length', (t) => (scores.trajectories[t]?.totalPathLength ?? 0).toFixed(1));
  behaviorRow('Reversals', (t) => `${scores.trajectories[t]?.totalDirectionReversals ?? 0}`);
  behaviorRow('Revisits', (t) => `${scores.trajectories[t]?.totalRevisits ?? 0}`);
  behaviorRow('Longest dwell', (t) => scores.trajectories[t]?.longestDwellControl ?? '-');
  behaviorRow('First control', (t) => scores.trajectories[t]?.engagementOrder[0] ?? '-');
  ensureRoom(6);
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(6);
  doc.text(
    `Total assessment duration: ${formatDuration(scores.totalAssessmentDuration)}. Path length = total slider travel; reversals = direction changes; revisits = returns to a previously adjusted control.`,
    margin,
    y,
  );
  y += 8;

  // ── Adjustment trajectory figures ────────────────────────────────────
  const chartH = 26;
  const axisPad = 12;
  sectionTitle('ADJUSTMENT TRAJECTORY', chartH + 20);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');

  for (const t of tasks) {
    const result = record.tasks[t]!;
    const events = result.adjustmentTrajectory;
    const durationMs = Math.max(result.durationMs, 1);

    ensureRoom(chartH + 14);

    // Chart frame
    const x0 = margin + axisPad;
    const chartW = contentWidth - axisPad;
    doc.setTextColor(...TEXT);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(shortLabel(t), margin, y);
    y += 3;

    doc.setFillColor(...SURFACE);
    doc.rect(x0, y, chartW, chartH, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(x0, y, chartW, chartH, 'S');

    // Global BF series: step line starting at actual BF
    const globalEvents = events.filter((e) => e.control === 'global');
    const series: Array<{ ms: number; v: number }> = [
      { ms: 0, v: record.actual.bodyFat },
      ...globalEvents.map((e) => ({ ms: e.timestamp, v: e.value })),
    ];
    let vMin = Math.min(...series.map((s) => s.v));
    let vMax = Math.max(...series.map((s) => s.v));
    if (vMax - vMin < 2) {
      const mid = (vMax + vMin) / 2;
      vMin = mid - 1;
      vMax = mid + 1;
    }
    const pad = (vMax - vMin) * 0.12;
    vMin -= pad;
    vMax += pad;

    const px = (ms: number) => x0 + (Math.min(ms, durationMs) / durationMs) * chartW;
    const py = (v: number) => y + chartH - ((v - vMin) / (vMax - vMin)) * (chartH - 6) - 3;

    // Actual-BF reference line
    doc.setDrawColor(...TEXT_DIM);
    doc.setLineWidth(0.15);
    const refY = py(record.actual.bodyFat);
    for (let dx = 0; dx < chartW; dx += 3) {
      doc.line(x0 + dx, refY, x0 + Math.min(dx + 1.5, chartW), refY);
    }

    // Step line for global BF
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.5);
    for (let i = 0; i < series.length; i++) {
      const cur = series[i];
      const nextMs = i + 1 < series.length ? series[i + 1].ms : durationMs;
      doc.line(px(cur.ms), py(cur.v), px(nextMs), py(cur.v)); // horizontal hold
      if (i + 1 < series.length) {
        doc.line(px(nextMs), py(cur.v), px(nextMs), py(series[i + 1].v)); // vertical step
      }
    }

    // Segment adjustment events as ticks along the bottom strip
    doc.setDrawColor(...COOL);
    doc.setLineWidth(0.4);
    for (const e of events) {
      if (e.control === 'global') continue;
      const ex = px(e.timestamp);
      doc.line(ex, y + chartH - 2.5, ex, y + chartH - 0.5);
    }

    // Axis labels
    doc.setTextColor(...TEXT_DIM);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${vMax.toFixed(0)}%`, x0 - 1.5, y + 3.5, { align: 'right' });
    doc.text(`${vMin.toFixed(0)}%`, x0 - 1.5, y + chartH - 1, { align: 'right' });
    doc.text('0s', x0, y + chartH + 3);
    doc.text(`${Math.round(durationMs / 1000)}s`, x0 + chartW, y + chartH + 3, {
      align: 'right',
    });
    y += chartH + 7;
  }
  ensureRoom(6);
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(6);
  doc.text(
    'Solid line: global BF% over time (dashed = actual). Blue ticks: segment slider adjustments.',
    margin,
    y,
  );
  y += 8;

  // ── Footer ───────────────────────────────────────────────────────────
  ensureRoom(20);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(6);
  doc.text('Assessment conducted using ReCompose BIDS Assessment Protocol v1.0', margin, y);
  y += 3.5;
  doc.text('This report is generated for research/clinical purposes. BIDS thresholds are preliminary and subject to validation.', margin, y);
  y += 3.5;
  doc.text('Privacy: Scan data processed client-side. No biometric data was transmitted to external servers.', margin, y);

  doc.save(`recompose-assessment-${record.scanId || record.id.slice(0, 8)}.pdf`);
}
