import type { AssessmentRecord, BIDSScores, TaskType } from '@/types/assessment';
import {
  formatDuration,
  interpretDistortion,
  interpretTaskDiscrepancy,
  getTopRegionalChanges,
  getDiscrepancySeverity,
  CLINICAL_THRESHOLD,
  type DiscrepancySeverity,
} from './scoring';
// (describeRegionalChanges superseded by the podium blocks)
import { getTaskDefinition } from './taskRegistry';
import type { DerivedRow } from './derivedValues';
import { computeFigureData } from './figureData';

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

/** Severity colors: green (<2 BF%), yellow (2-5), red (>5), symmetric. */
const SEV_RGB: Record<DiscrepancySeverity, RGB> = {
  low: [52, 211, 153],
  moderate: [240, 200, 74],
  high: [224, 68, 90],
};

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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

    sectionTitle('SUBJECTIVE PERCEPTIONS', cellH + 14);
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
        doc.setTextColor(...SEV_RGB[getDiscrepancySeverity(pill)]);
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

  // ── BIDS scores (tabulated, severity-colored) ────────────────────────
  sectionTitle('BIDS SCORES', 24);
  const constructName = (t: TaskType): string =>
    t === 'ideal'
      ? 'Dissatisfaction'
      : `Pressure — ${shortLabel(t)}`;
  const scoreRows: Array<{ label: string; value: number; desc: string }> = [
    {
      label: 'Distortion (Perceived vs Actual)',
      value: scores.distortion,
      desc: interpretDistortion(scores.distortion),
    },
    ...comparisons.map((t) => {
      const d = scores.taskDiscrepancies[t] ?? 0;
      return {
        label: `${constructName(t)} (vs Perceived)`,
        value: d,
        desc: interpretTaskDiscrepancy(t, d),
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
    const sev = getDiscrepancySeverity(row.value);
    const flagged = sev === 'high';
    const descLines = doc.splitTextToSize(
      row.desc,
      contentWidth - scLabelW - scValueW - 2,
    ) as string[];
    // Row height covers the wrapped description AND the flag line, so the
    // threshold label can never bleed into the next row.
    const linesTall = Math.max(descLines.length, flagged ? 2 : 1);
    const rowH = linesTall * 3.5 + 2.5;
    ensureRoom(rowH + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(row.label, margin + 1.5, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...SEV_RGB[sev]);
    doc.text(`${row.value > 0 ? '+' : ''}${row.value.toFixed(1)}`, margin + scLabelW, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(descLines, margin + scLabelW + scValueW, y);
    if (flagged) {
      doc.setTextColor(...WARM);
      doc.text('exceeds clinical threshold', margin + scLabelW, y + 3.5);
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowH - 2, pageWidth - margin, y + rowH - 2);
    y += rowH + 1;
  }
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(6);
  doc.text(
    'Severity: green <2 BF% (not meaningful) · yellow 2-5 (meaningful) · red >5 (clinical threshold), in either direction.',
    margin,
    y,
  );
  y += 6;

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
    values: Array<{ text: string; heat?: number; textRgb?: RGB }>,
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
    values.forEach((v, i) => {
      doc.setTextColor(...(v.textRgb ?? TEXT));
      doc.text(v.text, colX(i), y);
    });
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
      return {
        text: `${d > 0 ? '+' : ''}${d.toFixed(1)}%`,
        textRgb: SEV_RGB[getDiscrepancySeverity(d)],
      };
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
    'Displacement: perceived is vs actual; others vs perceived, colored by severity (green <2, yellow 2-5, red >5 BF%). Segment cells: warm = larger, cool = smaller.',
    margin,
    y,
  );
  y += 8;

  // ── Regional distortion summary: podium blocks per comparison ────────
  {
    const podiums = [
      {
        title: 'Perceived vs Actual',
        highlights: getTopRegionalChanges(scores.segmentDistortions, (sd) => sd.perceivedDelta),
      },
      ...comparisons.map((t) => ({
        title: `${shortLabel(t)} vs Perceived`,
        highlights: getTopRegionalChanges(scores.segmentDistortions, (sd) => sd.taskDeltas[t]),
      })),
    ];

    const gap = 5;
    const blockW = (contentWidth - gap) / 2;
    const maxRows = Math.max(1, ...podiums.map((p) => p.highlights.length));
    const blockH = 8 + maxRows * 4.5 + 2;

    sectionTitle('REGIONAL DISTORTION SUMMARY', blockH + 14);
    for (let rowStart = 0; rowStart < podiums.length; rowStart += 2) {
      const row = podiums.slice(rowStart, rowStart + 2);
      ensureRoom(blockH + 3);
      const rowWidth = row.length * blockW + (row.length - 1) * gap;
      const startX = margin + (contentWidth - rowWidth) / 2; // center remainder
      row.forEach((p, i) => {
        const x = startX + i * (blockW + gap);
        doc.setFillColor(...SURFACE);
        doc.rect(x, y, blockW, blockH, 'F');
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.25);
        doc.rect(x, y, blockW, blockH, 'S');

        doc.setTextColor(...ACCENT);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(p.title, x + 3, y + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        let ry = y + 10;
        if (p.highlights.length === 0) {
          doc.setTextColor(...TEXT_DIM);
          doc.text('No regional change', x + 3, ry);
        }
        p.highlights.forEach((h, rank) => {
          const over = h.exceedsThreshold;
          doc.setTextColor(...TEXT_DIM);
          doc.text(`${rank + 1}.`, x + 3, ry);
          doc.setTextColor(...TEXT_SECONDARY);
          doc.text(h.label, x + 8, ry);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...(over ? WARM : Math.abs(h.delta) >= 2 ? SEV_RGB.moderate : TEXT));
          doc.text(
            `${h.delta > 0 ? '+' : ''}${h.delta.toFixed(1)}%${over ? ' !' : ''}`,
            x + blockW - 3,
            ry,
            { align: 'right' },
          );
          doc.setFont('helvetica', 'normal');
          ry += 4.5;
        });
      });
      y += blockH + 3;
    }
    doc.setTextColor(...TEXT_DIM);
    doc.setFontSize(6);
    doc.text(
      `Top regional changes per comparison (largest first; ! = exceeds the ${CLINICAL_THRESHOLD.toFixed(0)}% clinical threshold).`,
      margin,
      y,
    );
    y += 8;
  }

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
      const prec = row.precision ?? 1;
      doc.setTextColor(...TEXT_SECONDARY);
      doc.text(`${row.label}${row.unit ? ` (${row.unit})` : ''}`, margin + 1.5, y);
      doc.setTextColor(...TEXT);
      doc.text(row.actual.toFixed(prec), margin + dLabelW, y);
      tasks.forEach((t, i) => {
        const v = row.perTask[t];
        doc.text(v === undefined ? '-' : v.toFixed(prec), dColX(i), y);
      });
      y += 5;
    }
    doc.setTextColor(...TEXT_DIM);
    doc.setFontSize(6);
    doc.text(
      'Real-world values each avatar state corresponds to, using the live data. Color = deviation from actual.',
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
  behaviorRow('Visits', (t) =>
    `${scores.trajectories[t]?.perControl.reduce((sum, c) => sum + c.visitCount, 0) ?? 0}`);
  behaviorRow('Revisits', (t) => `${scores.trajectories[t]?.totalRevisits ?? 0}`);
  behaviorRow('Peak overshoot', (t) =>
    Math.max(0, ...(scores.trajectories[t]?.perControl.map((c) => c.overshootMagnitude) ?? [0])).toFixed(1));
  behaviorRow('Longest dwell', (t) => scores.trajectories[t]?.longestDwellControl ?? '-');
  behaviorRow('First control', (t) => scores.trajectories[t]?.engagementOrder[0] ?? '-');
  ensureRoom(6);
  doc.setTextColor(...TEXT_DIM);
  doc.setFontSize(6);
  doc.text(
    `Total assessment duration: ${formatDuration(scores.totalAssessmentDuration)}.`,
    margin,
    y,
  );
  y += 4;

  const BEHAVIOR_DEFS = [
    'Adjustments: total number of slider movements made during the task - overall engagement effort; how much active searching the judgment required rather than direct retrieval of a stable appearance.',
    'Path length: total distance the sliders traveled, regardless of where they ended - breadth of the search through body-size space; exploration cost of reaching the final judgment.',
    'Reversals: number of direction changes within a slider (up-down-up) - indecision near the answer; oscillation around the subjective answer while localizing it.',
    'Visits: number of separate times the participant came to a slider (leaving for another slider ends a visit) - how attentional allocation is spread across body regions.',
    'Revisits: times a slider was left and later returned to (visits - 1) - failure of answers to stay settled; slider-based analog of body-checking.',
    'Longest dwell: the slider engaged for the greatest span of time - the region of peak attentional hold; typically the most difficult or personally significant area to judge.',
    'Engagement order: sequence in which sliders were first touched - priority structure of the body representation; which regions are most immediately self-relevant.',
    'Overshooting: distance traveled beyond final answer before coming back - level of uncertainty around internal representation.',
  ];
  for (const def of BEHAVIOR_DEFS) {
    const lines = doc.splitTextToSize(def, contentWidth) as string[];
    ensureRoom(lines.length * 2.8 + 1);
    doc.setTextColor(...TEXT_DIM);
    doc.setFontSize(6);
    doc.text(lines, margin, y);
    y += lines.length * 2.8 + 0.8;
  }
  y += 5;

  // ── Figures ──────────────────────────────────────────────────────────
  {
    const fig = computeFigureData(record, scores, derived);

    sectionTitle('FIGURES', 30);

    // Adaptive headline
    doc.setTextColor(...TEXT);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const headLines = doc.splitTextToSize(fig.headline, contentWidth) as string[];
    ensureRoom(headLines.length * 3.8 + 4);
    doc.text(headLines, margin, y);
    y += headLines.length * 3.8 + 5;
    doc.setFont('helvetica', 'normal');

    const figTitle = (n: number, title: string) => {
      doc.setTextColor(...TEXT);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`Fig ${n} — ${title}`, margin, y);
      doc.setFont('helvetica', 'normal');
      y += 4;
    };
    const mix = (a: RGB, b: RGB, t: number): RGB => [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];

    // Fig 1 — column chart: global BF% per state
    {
      const h = 32;
      const axisPad = 10;
      ensureRoom(h + 18);
      figTitle(1, 'Global body fat by state (%)');
      const x0 = margin + axisPad;
      const w = contentWidth - axisPad;
      const vMax = Math.max(10, ...fig.bfColumns.map((c) => c.value)) * 1.18;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.line(x0, y + h, x0 + w, y + h); // baseline
      doc.line(x0, y, x0, y + h); // y axis
      doc.setTextColor(...TEXT_DIM);
      doc.setFontSize(5.5);
      doc.text(`${vMax.toFixed(0)}`, x0 - 1.5, y + 3, { align: 'right' });
      doc.text('0', x0 - 1.5, y + h, { align: 'right' });

      const n = fig.bfColumns.length;
      const slot = w / n;
      const barW = Math.min(16, slot * 0.55);
      fig.bfColumns.forEach((c, i) => {
        const bx = x0 + slot * i + (slot - barW) / 2;
        const barH = (c.value / vMax) * h;
        doc.setFillColor(...hexToRgb(c.color));
        doc.rect(bx, y + h - barH, barW, barH, 'F');
        doc.setTextColor(...TEXT);
        doc.setFontSize(6);
        doc.text(`${c.value.toFixed(1)}`, bx + barW / 2, y + h - barH - 1.2, { align: 'center' });
        doc.setTextColor(...TEXT_DIM);
        doc.setFontSize(5.5);
        doc.text(c.label, bx + barW / 2, y + h + 3.2, { align: 'center' });
      });
      y += h + 9;
    }

    // Fig 2 — radar: 8-segment profile per perspective
    {
      const R = 23;
      const blockH = R * 2 + 16;
      ensureRoom(blockH + 12);
      figTitle(2, 'Regional profile across perspectives (segment overrides, -15 to +15)');
      const cx = margin + 34;
      const cy = y + R + 6;
      const nAxes = fig.radarAxes.length;
      const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / nAxes;
      const pt = (i: number, v: number): [number, number] => {
        const r = ((v + 15) / 30) * R;
        return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
      };

      // Grid rings at -7.5, 0 (bold), +7.5, +15
      for (const level of [-7.5, 0, 7.5, 15]) {
        doc.setDrawColor(...(level === 0 ? TEXT_DIM : BORDER));
        doc.setLineWidth(level === 0 ? 0.3 : 0.2);
        for (let i = 0; i < nAxes; i++) {
          const [ax, ay] = pt(i, level);
          const [bx, by] = pt((i + 1) % nAxes, level);
          doc.line(ax, ay, bx, by);
        }
      }
      // Axes + labels
      doc.setFontSize(5);
      for (let i = 0; i < nAxes; i++) {
        const [ex, ey] = pt(i, 15);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.15);
        doc.line(cx, cy, ex, ey);
        const [lx, ly] = [cx + Math.cos(angle(i)) * (R + 3), cy + Math.sin(angle(i)) * (R + 3)];
        doc.setTextColor(...TEXT_DIM);
        const alignRight = Math.cos(angle(i)) < -0.3;
        const alignCenter = Math.abs(Math.cos(angle(i))) <= 0.3;
        doc.text(fig.radarAxes[i], lx, ly + 1, {
          align: alignCenter ? 'center' : alignRight ? 'right' : 'left',
        });
      }
      // Series polygons
      for (const s of fig.radarSeries) {
        doc.setDrawColor(...hexToRgb(s.color));
        doc.setLineWidth(0.45);
        for (let i = 0; i < nAxes; i++) {
          const [ax, ay] = pt(i, s.values[i]);
          const [bx, by] = pt((i + 1) % nAxes, s.values[(i + 1) % nAxes]);
          doc.line(ax, ay, bx, by);
        }
        doc.setFillColor(...hexToRgb(s.color));
        for (let i = 0; i < nAxes; i++) {
          const [ax, ay] = pt(i, s.values[i]);
          doc.circle(ax, ay, 0.5, 'F');
        }
      }
      // Legend on the right
      let ly = y + 4;
      const lx = cx + R + 26;
      doc.setFontSize(6);
      for (const s of fig.radarSeries) {
        doc.setFillColor(...hexToRgb(s.color));
        doc.rect(lx, ly - 1.8, 3, 2.2, 'F');
        doc.setTextColor(...TEXT_SECONDARY);
        doc.text(s.label, lx + 4.5, ly);
        ly += 4.5;
      }
      doc.setTextColor(...TEXT_DIM);
      doc.setFontSize(5.5);
      doc.text('Middle ring = 0 (no change); outer = +15, center = -15.', lx, ly + 1);
      y += blockH + 4;
    }

    // Fig 3 — horizontal bars: desired change per measurement (% of actual)
    if (fig.desiredChange) {
      const rows = fig.desiredChange.rows;
      const rowH = 5;
      const h = rows.length * rowH;
      ensureRoom(h + 18);
      figTitle(3, `Desired change vs actual — ${fig.desiredChange.taskLabel} (% of actual)`);
      const labelW = 26;
      const half = (contentWidth - labelW) / 2 - 12;
      const xc = margin + labelW + half + 6;
      const maxAbs = Math.max(5, ...rows.map((r) => Math.abs(r.pct)));

      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.line(xc, y - 1, xc, y + h - 1); // zero line
      rows.forEach((r, i) => {
        const ry = y + i * rowH + 1.8;
        doc.setTextColor(...TEXT_SECONDARY);
        doc.setFontSize(6);
        doc.text(r.label, margin, ry + 1);
        const barLen = (Math.abs(r.pct) / maxAbs) * half;
        doc.setFillColor(...ACCENT);
        if (r.pct >= 0) {
          doc.rect(xc, ry - 1, Math.max(0.3, barLen), 2.6, 'F');
        } else {
          doc.rect(xc - barLen, ry - 1, Math.max(0.3, barLen), 2.6, 'F');
        }
        doc.setTextColor(...TEXT);
        doc.setFontSize(5.5);
        doc.text(
          `${r.pct > 0 ? '+' : ''}${r.pct.toFixed(1)}%`,
          r.pct >= 0 ? xc + barLen + 1.5 : xc - barLen - 1.5,
          ry + 0.8,
          { align: r.pct >= 0 ? 'left' : 'right' },
        );
      });
      y += h + 7;
    }

    // Fig 4 — combo: time on task (bars) vs adjustments + path length (lines)
    {
      const h = 30;
      const axisPad = 10;
      ensureRoom(h + 22);
      figTitle(4, 'Time on task vs adjustments and path length');
      const x0 = margin + axisPad;
      const w = contentWidth - axisPad * 2;
      const tMax = Math.max(10, ...fig.effort.map((e) => e.durationS)) * 1.2;
      const sMax = Math.max(
        5,
        ...fig.effort.map((e) => e.adjustments),
        ...fig.effort.map((e) => e.pathLength),
      ) * 1.15;

      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.line(x0, y + h, x0 + w, y + h);
      doc.line(x0, y, x0, y + h);
      doc.line(x0 + w, y, x0 + w, y + h);
      doc.setTextColor(...TEXT_DIM);
      doc.setFontSize(5.5);
      doc.text(`${Math.round(tMax)}s`, x0 - 1.5, y + 3, { align: 'right' });
      doc.text('0', x0 - 1.5, y + h, { align: 'right' });
      doc.text(`${Math.round(sMax)}`, x0 + w + 1.5, y + 3);
      doc.text('0', x0 + w + 1.5, y + h);

      const n = fig.effort.length;
      const slot = w / n;
      const barW = Math.min(14, slot * 0.5);
      const centers: number[] = [];
      fig.effort.forEach((e, i) => {
        const bx = x0 + slot * i + (slot - barW) / 2;
        centers.push(bx + barW / 2);
        const barH = (e.durationS / tMax) * h;
        doc.setFillColor(...hexToRgb(e.color));
        doc.rect(bx, y + h - barH, barW, barH, 'F');
        doc.setTextColor(...TEXT_DIM);
        doc.setFontSize(5.5);
        doc.text(e.label, bx + barW / 2, y + h + 3.2, { align: 'center' });
      });
      // Secondary-axis lines
      const lineY = (v: number) => y + h - (v / sMax) * h;
      doc.setDrawColor(...TEXT);
      doc.setLineWidth(0.4);
      for (let i = 1; i < n; i++) {
        doc.line(centers[i - 1], lineY(fig.effort[i - 1].adjustments), centers[i], lineY(fig.effort[i].adjustments));
      }
      doc.setFillColor(...TEXT);
      fig.effort.forEach((e, i) => doc.circle(centers[i], lineY(e.adjustments), 0.6, 'F'));
      doc.setDrawColor(...COOL);
      doc.setLineDashPattern([1.4, 1.2], 0);
      for (let i = 1; i < n; i++) {
        doc.line(centers[i - 1], lineY(fig.effort[i - 1].pathLength), centers[i], lineY(fig.effort[i].pathLength));
      }
      doc.setLineDashPattern([], 0);
      doc.setFillColor(...COOL);
      fig.effort.forEach((e, i) => doc.circle(centers[i], lineY(e.pathLength), 0.6, 'F'));

      doc.setTextColor(...TEXT_DIM);
      doc.setFontSize(5.5);
      doc.text(
        'Bars: seconds on task (left axis, task colors). Solid line: adjustments; dashed line: path length (right axis).',
        margin,
        y + h + 7,
      );
      y += h + 11;
    }

    // Fig 5 — heatmap: adjustments per control x task
    {
      const labelW = 22;
      const cellW = (contentWidth - labelW) / fig.heatControls.length;
      const cellH = 6;
      const h = 5 + fig.heatTasks.length * cellH;
      ensureRoom(h + 16);
      figTitle(5, 'Adjustments per control × task');
      doc.setFontSize(5);
      doc.setTextColor(...TEXT_DIM);
      fig.heatControls.forEach((c, i) => {
        doc.text(c, margin + labelW + cellW * i + cellW / 2, y + 2, { align: 'center' });
      });
      y += 4;
      fig.heatTasks.forEach((t, ti) => {
        doc.setTextColor(...TEXT_SECONDARY);
        doc.setFontSize(6);
        doc.text(t.label, margin, y + cellH / 2 + 1);
        fig.heatCounts[ti].forEach((count, ci) => {
          const cellX = margin + labelW + cellW * ci;
          const intensity = (count / fig.heatMax) * 0.85;
          doc.setFillColor(...mix(SURFACE, ACCENT, intensity));
          doc.rect(cellX + 0.3, y + 0.3, cellW - 0.6, cellH - 0.6, 'F');
          doc.setTextColor(...(intensity > 0.45 ? BG : TEXT_SECONDARY));
          doc.setFontSize(5.5);
          doc.text(`${count}`, cellX + cellW / 2, y + cellH / 2 + 1, { align: 'center' });
        });
        y += cellH;
      });
      doc.setTextColor(...TEXT_DIM);
      doc.setFontSize(5.5);
      doc.text('Cell intensity scales with adjustment count.', margin, y + 3.5);
      y += 8;
    }
  }

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
