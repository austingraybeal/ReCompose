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
        <MetricRow label="Weight" value={metrics.weight} originalValue={originalMetrics.weight} unit="lbs" />
        <MetricRow label="BMI" value={metrics.bmi} originalValue={originalMetrics.bmi} unit="" />
        <MetricRow label="Waist" value={metrics.waistCirc} originalValue={originalMetrics.waistCirc} unit="cm" />
        <MetricRow label="Hip" value={metrics.hipCirc} originalValue={originalMetrics.hipCirc} unit="cm" />
        <MetricRow label="WHR" value={metrics.whr} originalValue={originalMetrics.whr} unit="" precision={2} />
      </div>
    </div>
  );
}
