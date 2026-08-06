import type { AssessmentRecord, BIDSScores } from '@/types/assessment';
import {
  formatDuration,
  interpretDistortion,
  interpretTaskDiscrepancy,
  interpretRegionalDistortion,
} from './scoring';
import { getTaskDefinition } from './taskRegistry';

/**
 * Generate a clinical PDF report using jsPDF. Adapts to whatever task set
 * was administered (record.selectedTasks).
 * Dynamically imports jsPDF to avoid SSR issues.
 */
export async function generatePDFReport(record: AssessmentRecord, scores: BIDSScores) {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const tasks = record.selectedTasks;
  const comparisons = tasks.filter((t) => t !== 'perceived');

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      doc.setFillColor(10, 11, 15);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      y = margin;
    }
  };

  // Background
  doc.setFillColor(10, 11, 15);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Header
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ReCompose BIDS Assessment', margin, y);
  y += 8;

  doc.setTextColor(107, 112, 128);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(record.timestamp).toLocaleString();
  doc.text(`Assessment Date: ${dateStr}  |  Scan ID: ${record.scanId}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(62, 207, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Scan Summary
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('SCAN SUMMARY', margin, y);
  y += 6;

  doc.setTextColor(156, 160, 174);
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

  const colWidth = contentWidth / 3;
  for (let i = 0; i < scanMetrics.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    doc.text(scanMetrics[i], margin + col * colWidth, y + row * 5);
  }
  y += Math.ceil(scanMetrics.length / 3) * 5 + 6;

  // Assessment Results Table (label column + one column per task)
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSESSMENT RESULTS', margin, y);
  y += 7;

  const labelColW = 32;
  const taskColW = (contentWidth - labelColW) / tasks.length;
  const colX = (i: number) => margin + labelColW + i * taskColW;
  const headerFont = tasks.length > 5 ? 6 : 7;

  doc.setFillColor(26, 29, 40);
  doc.rect(margin, y - 4, contentWidth, 7, 'F');
  doc.setTextColor(107, 112, 128);
  doc.setFontSize(headerFont);
  doc.setFont('helvetica', 'bold');
  tasks.forEach((t, i) => {
    doc.text(getTaskDefinition(t).shortLabel, colX(i), y);
  });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(headerFont);

  // Global BF row
  ensureRoom(6);
  doc.setTextColor(156, 160, 174);
  doc.text('Global BF%', margin, y);
  doc.setTextColor(232, 234, 237);
  tasks.forEach((t, i) => {
    doc.text(`${record.tasks[t]!.finalState.globalBodyFat.toFixed(1)}%`, colX(i), y);
  });
  y += 5;

  // Segment rows (raw override per task)
  for (const sd of scores.segmentDistortions) {
    ensureRoom(6);
    doc.setTextColor(156, 160, 174);
    doc.text(sd.label, margin, y);
    doc.setTextColor(232, 234, 237);
    tasks.forEach((t, i) => {
      const v = record.tasks[t]!.finalState.segmentOverrides[sd.segmentId];
      doc.text(`${v > 0 ? '+' : ''}${v.toFixed(0)}%`, colX(i), y);
    });
    y += 5;
  }
  y += 6;

  // Scores Section
  ensureRoom(20);
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('BIDS SCORES', margin, y);
  y += 7;

  doc.setFontSize(8);
  const scoreLines = [
    {
      label: 'Body Image Distortion (BIDS-D)',
      value: `${scores.distortion > 0 ? '+' : ''}${scores.distortion.toFixed(1)} BF%`,
      desc: interpretDistortion(scores.distortion),
      flagged: scores.clinicalFlag,
    },
    ...comparisons.map((t) => {
      const d = scores.taskDiscrepancies[t] ?? 0;
      return {
        label: `${getTaskDefinition(t).shortLabel} vs Perceived`,
        value: `${d > 0 ? '+' : ''}${d.toFixed(1)} BF%`,
        desc: interpretTaskDiscrepancy(t, d),
        flagged: false,
      };
    }),
  ];

  for (const line of scoreLines) {
    ensureRoom(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(line.flagged ? 224 : 232, line.flagged ? 68 : 234, line.flagged ? 90 : 237);
    doc.text(`${line.label}: ${line.value}`, margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 160, 174);
    doc.text(line.desc, margin + 4, y);
    y += 6;
  }

  // Regional interpretation
  ensureRoom(24);
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('REGIONAL DISTORTION SUMMARY', margin, y);
  y += 6;

  doc.setTextColor(156, 160, 174);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const regionalText = interpretRegionalDistortion(scores);
  const regionalLines = doc.splitTextToSize(regionalText, contentWidth);
  doc.text(regionalLines, margin, y);
  y += regionalLines.length * 4 + 4;

  doc.text(`Highest distortion segment: ${scores.maxDistortionSegment}`, margin, y);
  y += 8;

  // Behavioral Metrics
  ensureRoom(16 + tasks.length * 4);
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('BEHAVIORAL METRICS', margin, y);
  y += 6;

  doc.setTextColor(156, 160, 174);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  for (const t of tasks) {
    doc.text(
      `${getTaskDefinition(t).shortLabel}: ${formatDuration(scores.taskDurations[t] ?? 0)} (${record.tasks[t]!.resetCount} resets)`,
      margin,
      y,
    );
    y += 4;
  }
  doc.text(`Total: ${formatDuration(scores.totalAssessmentDuration)}`, margin, y);
  y += 8;

  // Adjustment Trajectory
  ensureRoom(12 + tasks.length * 9);
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ADJUSTMENT TRAJECTORY', margin, y);
  y += 6;

  doc.setTextColor(156, 160, 174);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  for (const t of tasks) {
    const m = scores.trajectories[t];
    if (!m) continue;
    const dwell = m.longestDwellControl ?? 'none';
    doc.text(
      `${getTaskDefinition(t).shortLabel}: ${m.totalAdjustments} adjustments, path ${m.totalPathLength.toFixed(1)}, ` +
        `${m.totalDirectionReversals} reversals, ${m.totalRevisits} revisits, longest dwell: ${dwell}`,
      margin,
      y,
    );
    y += 4;
    const order = m.engagementOrder.slice(0, 6).join(' > ') || 'no adjustments';
    doc.text(`   engagement order: ${order}${m.engagementOrder.length > 6 ? ' ...' : ''}`, margin, y);
    y += 5;
  }
  y += 3;

  // Footer
  ensureRoom(20);
  doc.setDrawColor(38, 42, 56);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setTextColor(107, 112, 128);
  doc.setFontSize(6);
  doc.text('Assessment conducted using ReCompose BIDS Assessment Protocol v1.0', margin, y);
  y += 3.5;
  doc.text('This report is generated for research/clinical purposes. BIDS thresholds are preliminary and subject to validation.', margin, y);
  y += 3.5;
  doc.text('Privacy: Scan data processed client-side. No biometric data was transmitted to external servers.', margin, y);

  // Save
  doc.save(`recompose-assessment-${record.scanId || record.id.slice(0, 8)}.pdf`);
}
