'use client';

import { useViewStore } from '@/lib/stores/viewStore';
import type { CameraPreset } from '@/types/scan';

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'quarter', label: '¾' },
];

export default function ViewControls() {
  const cameraPreset = useViewStore((s) => s.cameraPreset);
  const setCameraPreset = useViewStore((s) => s.setCameraPreset);

  return (
    <div className="flex flex-col gap-1">
      <div
        className="text-rc-xs uppercase tracking-[2px] px-3 mb-1"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Camera
      </div>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          onClick={() => setCameraPreset(preset.id)}
          className="px-3 py-1.5 rounded-lg text-rc-sm font-mono transition-colors duration-150 text-left"
          style={{
            background: cameraPreset === preset.id ? 'var(--rc-accent-dim)' : 'transparent',
            color: cameraPreset === preset.id ? 'var(--rc-accent)' : 'var(--rc-text-secondary)',
            border: cameraPreset === preset.id ? '1px solid var(--rc-border-accent)' : '1px solid transparent',
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
