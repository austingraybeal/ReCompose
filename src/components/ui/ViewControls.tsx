'use client';

import { useViewStore } from '@/lib/stores/viewStore';
import type { CameraPreset } from '@/types/scan';

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'quarter', label: '3/4' },
];

export default function ViewControls() {
  const cameraPreset = useViewStore((s) => s.cameraPreset);
  const setCameraPreset = useViewStore((s) => s.setCameraPreset);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-[3px] px-1 mb-1 font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Camera
      </div>
      <div className="flex gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setCameraPreset(preset.id)}
            className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
            style={{
              background: cameraPreset === preset.id
                ? 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))'
                : 'var(--rc-bg-elevated)',
              color: cameraPreset === preset.id ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
              border: cameraPreset === preset.id
                ? '1px solid rgba(62, 207, 180, 0.25)'
                : '1px solid var(--rc-border-default)',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
