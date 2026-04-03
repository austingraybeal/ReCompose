'use client';

import { useMorphStore } from '@/lib/stores/morphStore';
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

  const isActive = value !== 0;

  return (
    <div
      className={`px-3 py-2 rounded-lg transition-all duration-150 ${
        focused ? 'ring-1' : ''
      }`}
      style={{
        background: isActive ? 'var(--rc-accent-dim)' : 'transparent',
        borderColor: isActive ? 'var(--rc-border-active)' : 'transparent',
        border: isActive ? '1px solid var(--rc-border-active)' : '1px solid transparent',
        boxShadow: isActive ? 'var(--rc-shadow-glow)' : 'none',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-rc-base">{icon}</span>
          <span
            className="text-rc-xs uppercase tracking-[2px] font-body"
            style={{ color: 'var(--rc-text-secondary)' }}
          >
            {label}
          </span>
        </div>
        <span
          className="font-mono font-bold text-rc-sm"
          style={{
            color: value > 0 ? 'var(--rc-delta-positive)'
              : value < 0 ? 'var(--rc-delta-negative)'
              : 'var(--rc-text-dim)',
          }}
        >
          {value > 0 ? '+' : ''}{value}%
        </span>
      </div>

      <input
        type="range"
        min="-50"
        max="50"
        step="1"
        value={value}
        onChange={(e) => setOverride(segmentId, parseFloat(e.target.value))}
        className="w-full h-1"
        style={{
          background: `linear-gradient(to right, var(--rc-delta-negative), var(--rc-bg-hover) 50%, var(--rc-delta-positive))`,
          borderRadius: '2px',
        }}
      />
    </div>
  );
}
