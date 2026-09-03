'use client';

import { useMetricProjection } from '@/hooks/useMetricProjection';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { motion } from 'framer-motion';

interface MetricRowProps {
  label: string;
  value: number;
  originalValue: number;
  unit: string;
  precision?: number;
}

function MetricRow({ label, value, originalValue, unit, precision = 1 }: MetricRowProps) {
  const delta = value - originalValue;
  const absDelta = Math.abs(delta);
  const isUp = delta > 0.05;
  const isDown = delta < -0.05;

  return (
    <div className="flex items-center justify-between py-3 px-1">
      <span className="text-[10px] uppercase tracking-[2px] font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <motion.span
          className="font-mono font-bold text-rc-base tabular-nums"
          style={{ color: 'var(--rc-text-primary)' }}
          key={value.toFixed(precision)}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        >
          {value.toFixed(precision)}<span className="text-rc-xs ml-0.5" style={{ color: 'var(--rc-text-dim)' }}>{unit}</span>
        </motion.span>
        <span
          className="text-rc-xs font-mono min-w-[40px] text-right"
          style={{
            color: isUp ? 'var(--rc-delta-positive)'
              : isDown ? 'var(--rc-delta-negative)'
              : 'var(--rc-delta-neutral)',
          }}
        >
          {isUp ? `\u2191${absDelta.toFixed(precision)}` : isDown ? `\u2193${absDelta.toFixed(precision)}` : '\u2014'}
        </span>
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const { metrics, originalMetrics } = useMetricProjection();
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);
  const currentStep = useAssessmentStore((s) => s.currentStep);
  const showValues = useAssessmentStore((s) => s.showValues);
  const isPreview = useViewStore((s) => s.appMode === 'preview');

  // During BIDS tasks the derived metrics would leak the hidden BF numbers;
  // the whole panel hides unless the investigator reveals values. Preview
  // mode is fully blinded, so the panel never shows there.
  const inTask =
    isAssessmentMode && currentStep !== null &&
    currentStep !== 'welcome' && currentStep !== 'complete';
  if ((inTask && !showValues) || isPreview) return null;

  if (!metrics || !originalMetrics) {
    return (
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-[3px] font-mono mb-4"
          style={{ color: 'var(--rc-text-dim)' }}
        >
          Metrics
        </div>
        <div className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
          Load a scan to view metrics
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-[10px] uppercase tracking-[3px] font-mono mb-2"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Metrics
      </div>
      <div className="flex flex-col divide-y" style={{ borderColor: 'var(--rc-border-subtle)' }}>
        {originalMetrics.heightCm > 0 && (
          <MetricRow label="Height" value={originalMetrics.heightCm} originalValue={originalMetrics.heightCm} unit="cm" />
        )}
        <MetricRow label="Weight" value={metrics.weight} originalValue={originalMetrics.weight} unit="lbs" />
        <MetricRow label="BMI" value={metrics.bmi} originalValue={originalMetrics.bmi} unit="kg/m²" />
        <MetricRow label="Fat" value={metrics.bodyFat} originalValue={originalMetrics.bodyFat} unit="%" />
        <MetricRow label="Fat Mass" value={metrics.fatMassLb} originalValue={originalMetrics.fatMassLb} unit="lbs" />
        <MetricRow label="FFM" value={metrics.fatFreeMassLb} originalValue={originalMetrics.fatFreeMassLb} unit="lbs" />
        <MetricRow label="Waist" value={metrics.waistCirc} originalValue={originalMetrics.waistCirc} unit="cm" />
        <MetricRow label="Hip" value={metrics.hipCirc} originalValue={originalMetrics.hipCirc} unit="cm" />
        <MetricRow label="WHR" value={metrics.whr} originalValue={originalMetrics.whr} unit="" precision={2} />
        {originalMetrics.heightCm > 0 && (
          <MetricRow label="WHtR" value={metrics.whtr} originalValue={originalMetrics.whtr} unit="" precision={2} />
        )}
        {originalMetrics.shoulderCirc > 0 && (
          <MetricRow label="Shoulder" value={metrics.shoulderCirc} originalValue={originalMetrics.shoulderCirc} unit="cm" />
        )}
        {originalMetrics.torsoVolumeL > 0 && (
          <MetricRow label="Torso" value={metrics.torsoVolumeL} originalValue={originalMetrics.torsoVolumeL} unit="L" />
        )}
        {originalMetrics.chestCirc > 0 && (
          <MetricRow label="Chest" value={metrics.chestCirc} originalValue={originalMetrics.chestCirc} unit="cm" />
        )}
        {originalMetrics.bicepCirc > 0 && (
          <MetricRow label="Upper Arm" value={metrics.bicepCirc} originalValue={originalMetrics.bicepCirc} unit="cm" />
        )}
        {originalMetrics.forearmCirc > 0 && (
          <MetricRow label="Forearm" value={metrics.forearmCirc} originalValue={originalMetrics.forearmCirc} unit="cm" />
        )}
        {originalMetrics.thighCirc > 0 && (
          <MetricRow label="Thigh" value={metrics.thighCirc} originalValue={originalMetrics.thighCirc} unit="cm" />
        )}
        {originalMetrics.calfCirc > 0 && (
          <MetricRow label="Calf" value={metrics.calfCirc} originalValue={originalMetrics.calfCirc} unit="cm" />
        )}
      </div>
    </div>
  );
}
