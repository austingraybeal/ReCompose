'use client';

import { useMetricProjection } from '@/hooks/useMetricProjection';
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
    <div className="flex items-center justify-between py-2">
      <span
        className="text-rc-xs uppercase tracking-[2px]"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <motion.span
          className="font-mono font-bold text-rc-base"
          style={{ color: 'var(--rc-text-primary)' }}
          key={value.toFixed(precision)}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        >
          {value.toFixed(precision)}{unit}
        </motion.span>
        {(isUp || isDown) && (
          <span
            className="text-rc-xs font-mono"
            style={{
              color: isUp ? 'var(--rc-delta-positive)' : 'var(--rc-delta-negative)',
            }}
          >
            {isUp ? '\u2191' : '\u2193'}{absDelta.toFixed(precision)}
          </span>
        )}
        {!isUp && !isDown && (
          <span className="text-rc-xs font-mono" style={{ color: 'var(--rc-delta-neutral)' }}>
            —
          </span>
        )}
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const { metrics, originalMetrics } = useMetricProjection();

  if (!metrics || !originalMetrics) {
    return (
      <div className="p-4">
        <div className="text-rc-xs uppercase tracking-[2px] mb-3" style={{ color: 'var(--rc-text-dim)' }}>
          Metrics
        </div>
        <div className="text-rc-sm" style={{ color: 'var(--rc-text-dim)' }}>
          Load a scan to view metrics
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div
        className="text-rc-xs uppercase tracking-[2px] mb-3"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Metrics
      </div>
      <div className="flex flex-col divide-y" style={{ borderColor: 'var(--rc-border-subtle)' }}>
        <MetricRow label="Weight" value={metrics.weight} originalValue={originalMetrics.weight} unit=" kg" />
        <MetricRow label="BMI" value={metrics.bmi} originalValue={originalMetrics.bmi} unit="" />
        <MetricRow label="Waist" value={metrics.waistCirc} originalValue={originalMetrics.waistCirc} unit=" cm" />
        <MetricRow label="Hip" value={metrics.hipCirc} originalValue={originalMetrics.hipCirc} unit=" cm" />
        <MetricRow label="WHR" value={metrics.whr} originalValue={originalMetrics.whr} unit="" precision={2} />
      </div>
    </div>
  );
}
