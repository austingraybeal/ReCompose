'use client';

import { useMorphStore } from '@/lib/stores/morphStore';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import type { SegmentId } from '@/types/scan';

interface SegmentSliderProps {
  segmentId: SegmentId;
  label: string;
  icon: string;
  focused?: boolean;
}

export default function SegmentSlider({ segmentId, label, icon, focused }: SegmentSliderProps) {
  const value = useMorphStore((s) => s.segmentOverrides[segmentId]);
  const setOverride = useMorphStore((s) => s.setSegmentOverride);
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);
  const showValues = useAssessmentStore((s) => s.showValues);
  const hideNumbers = isAssessmentMode && !showValues;

  const isActive = value !== 0;

  return (
    <div
      className="px-3 py-2 rounded-xl transition-all duration-200"
      style={{
        background: isActive
          ? 'linear-gradient(135deg, rgba(168, 98, 248, 0.08), rgba(168, 98, 248, 0.02))'
          : 'var(--rc-bg-elevated)',
        border: isActive
          ? '1px solid rgba(168, 98, 248, 0.3)'
          : focused
            ? '1px solid rgba(168, 98, 248, 0.2)'
            : '1px solid var(--rc-border-subtle)',
        boxShadow: isActive ? '0 0 12px rgba(168, 98, 248, 0.08)' : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-rc-sm">{icon}</span>
          <span className="text-[10px] uppercase tracking-[2px] font-mono"
            style={{ color: 'var(--rc-text-secondary)' }}
          >
            {label}
          </span>
        </div>
        <span
          className="font-mono font-bold text-rc-xs tabular-nums"
          style={{
            color: isActive ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
          }}
        >
          {hideNumbers ? '·' : `${value > 0 ? '+' : ''}${value}%`}
        </span>
      </div>

      {/* Range is a true circumference % now that override strength is 1.0;
          ±15 keeps the extremes anatomically plausible. */}
      <input
        type="range"
        min="-15"
        max="15"
        step="1"
        value={value}
        onChange={(e) => setOverride(segmentId, parseFloat(e.target.value))}
        className="w-full h-1"
        style={{
          background: `linear-gradient(to right, #8f6df0, var(--rc-bg-hover) 50%, #8f6df0)`,
          borderRadius: '99px',
        }}
      />
    </div>
  );
}
