import type { AssessmentRecord, BIDSScores } from '@/types/assessment';
import {
  formatDuration,
  interpretDistortion,
  interpretDissatisfaction,
  interpretPartnerDiscrepancy,
  interpretRegionalDistortion,
} from './scoring';

/**
 * Generate a clinical PDF report using jsPDF.
 * Dynamically imports jsPDF to avoid SSR issues.
 */
export async function generatePDFReport(record: AssessmentRecord, scores: BIDSScores) {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Colors
  const accentHex = '#3ecfb4';
  const textPrimary = '#e8eaed';
  const textSecondary = '#9ca0ae';
  const textDim = '#6b7080';
  const bgSurface = '#14161d';
  const bgElevated = '#1a1d28';
  const clinicalRed = '#e0445a';

  // Background
  doc.setFillColor(10, 11, 15);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  // Header
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ReCompose Body Image Assessment', margin, y);
  y += 8;

  doc.setTextColor(107, 112, 128);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date(record.timestamp).toLocaleString();
  doc.text(`Assessment Date: ${dateStr}  |  ID: ${record.id.slice(0, 8)}`, margin, y);
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
    `Weight: ${record.actual.weight.toFixed(1)} kg`,
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

  // Assessment Results Table
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSESSMENT RESULTS', margin, y);
  y += 7;

  // Table header
  const cols = [margin, margin + 40, margin + 75, margin + 110, margin + 145];
  doc.setFillColor(26, 29, 40);
  doc.rect(margin, y - 4, contentWidth, 7, 'F');
  doc.setTextColor(107, 112, 128);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('', cols[0], y);
  doc.text('Actual', cols[1], y);
  doc.text('Perceived', cols[2], y);
  doc.text('Ideal', cols[3], y);
  doc.text('Partner', cols[4], y);
  y += 6;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  const p = record.tasks.perceived.finalState;
  const ideal = record.tasks.ideal.finalState;
  const partner = record.tasks.partner.finalState;

  const rows = [
    {
      label: 'Global BF%',
      actual: `${record.actual.bodyFat.toFixed(1)}%`,
      perceived: `${p.globalBodyFat.toFixed(1)}%`,
      idealVal: `${ideal.globalBodyFat.toFixed(1)}%`,
      partnerVal: `${partner.globalBodyFat.toFixed(1)}%`,
    },
    ...scores.segmentDistortions.map((sd) => ({
      label: sd.label,
      actual: '0%',
      perceived: `${sd.perceivedDelta > 0 ? '+' : ''}${sd.perceivedDelta.toFixed(0)}%`,
      idealVal: `${sd.idealDelta > 0 ? '+' : ''}${sd.idealDelta.toFixed(0)}%`,
      partnerVal: `${sd.partnerDelta > 0 ? '+' : ''}${sd.partnerDelta.toFixed(0)}%`,
    })),
  ];

  for (const row of rows) {
    doc.setTextColor(156, 160, 174);
    doc.text(row.label, cols[0], y);
    doc.setTextColor(232, 234, 237);
    doc.text(row.actual, cols[1], y);
    doc.text(row.perceived, cols[2], y);
    doc.text(row.idealVal, cols[3], y);
    doc.text(row.partnerVal, cols[4], y);
    y += 5;
  }
  y += 6;

  // Scores Section
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
    {
      label: 'Dissatisfaction (BIDS-S)',
      value: `${scores.dissatisfaction > 0 ? '+' : ''}${scores.dissatisfaction.toFixed(1)} BF%`,
      desc: interpretDissatisfaction(scores.dissatisfaction),
      flagged: false,
    },
    {
      label: 'Partner Discrepancy (BIDS-P)',
      value: `${scores.partnerDiscrepancy > 0 ? '+' : ''}${scores.partnerDiscrepancy.toFixed(1)} BF%`,
      desc: interpretPartnerDiscrepancy(scores.partnerDiscrepancy),
      flagged: false,
    },
  ];

  for (const line of scoreLines) {
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
  doc.setTextColor(62, 207, 180);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('BEHAVIORAL METRICS', margin, y);
  y += 6;

  doc.setTextColor(156, 160, 174);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Perceived: ${formatDuration(scores.perceivedTaskDuration)} (${record.tasks.perceived.resetCount} resets)`, margin, y);
  y += 4;
  doc.text(`Ideal: ${formatDuration(scores.idealTaskDuration)} (${record.tasks.ideal.resetCount} resets)`, margin, y);
  y += 4;
  doc.text(`Partner: ${formatDuration(scores.partnerTaskDuration)} (${record.tasks.partner.resetCount} resets)`, margin, y);
  y += 4;
  doc.text(`Total: ${formatDuration(scores.totalAssessmentDuration)}`, margin, y);
  y += 10;

  // Footer
  doc.setDrawColor(38, 42, 56);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setTextColor(107, 112, 128);
  doc.setFontSize(6);
  doc.text('Assessment conducted using ReCompose Body Image Assessment Protocol v1.0', margin, y);
  y += 3.5;
  doc.text('This report is generated for research/clinical purposes. BIDS thresholds are preliminary and subject to validation.', margin, y);
  y += 3.5;
  doc.text('Privacy: Scan data processed client-side. No biometric data was transmitted to external servers.', margin, y);

  // Save
  doc.save(`recompose-assessment-${record.id.slice(0, 8)}.pdf`);
}
