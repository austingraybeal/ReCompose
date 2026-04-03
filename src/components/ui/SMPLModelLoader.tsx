'use client';

import { useSmplStore } from '@/lib/stores/smplStore';
import type { SMPLGender } from '@/lib/stores/smplStore';

const GENDER_OPTIONS: { id: SMPLGender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

/**
 * Body model panel: gender selector + SMPL/Scan engine toggle.
 * Models auto-load from public/models/ on app boot.
 */
export default function SMPLModelLoader() {
  const modelData = useSmplStore((s) => s.modelData);
  const isLoading = useSmplStore((s) => s.isLoading);
  const useSmpl = useSmplStore((s) => s.useSmpl);
  const gender = useSmplStore((s) => s.gender);
  const availableGenders = useSmplStore((s) => s.availableGenders);
  const setGender = useSmplStore((s) => s.setGender);
  const setUseSmpl = useSmplStore((s) => s.setUseSmpl);

  // Don't show if no models available and not loading
  if (availableGenders.size === 0 && !isLoading) return null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-[10px] uppercase tracking-[3px] px-1 mb-0.5 font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Body Model
      </div>

      {/* Gender selector */}
      <div className="flex gap-1.5">
        {GENDER_OPTIONS.map((opt) => {
          const available = availableGenders.has(opt.id);
          const active = gender === opt.id && modelData?.gender === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => available && setGender(opt.id)}
              disabled={!available || isLoading}
              className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))'
                  : 'var(--rc-bg-elevated)',
                color: !available
                  ? 'rgba(255,255,255,0.2)'
                  : active
                    ? 'var(--rc-accent)'
                    : 'var(--rc-text-dim)',
                border: active
                  ? '1px solid rgba(62, 207, 180, 0.25)'
                  : '1px solid var(--rc-border-default)',
                opacity: isLoading ? 0.5 : 1,
                cursor: available ? 'pointer' : 'not-allowed',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Status line */}
      <div
        className="flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-mono"
        style={{
          background: 'var(--rc-bg-elevated)',
          border: '1px solid var(--rc-border-default)',
          color: modelData ? 'var(--rc-text-dim)' : 'var(--rc-text-dim)',
        }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background: isLoading
              ? 'var(--rc-text-dim)'
              : useSmpl && modelData
                ? 'var(--rc-accent)'
                : 'rgba(255,255,255,0.15)',
          }}
        />
        {isLoading
          ? 'Loading...'
          : modelData
            ? `SMPL · ${modelData.vertexCount.toLocaleString()} vertices`
            : 'No model available'}
      </div>

      {/* Engine toggle: SMPL vs Scan */}
      {modelData && (
        <div className="flex gap-1.5">
          <button
            onClick={() => setUseSmpl(true)}
            className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
            style={{
              background: useSmpl
                ? 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))'
                : 'var(--rc-bg-elevated)',
              color: useSmpl ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
              border: useSmpl
                ? '1px solid rgba(62, 207, 180, 0.25)'
                : '1px solid var(--rc-border-default)',
            }}
          >
            SMPL
          </button>
          <button
            onClick={() => setUseSmpl(false)}
            className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
            style={{
              background: !useSmpl
                ? 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))'
                : 'var(--rc-bg-elevated)',
              color: !useSmpl ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
              border: !useSmpl
                ? '1px solid rgba(62, 207, 180, 0.25)'
                : '1px solid var(--rc-border-default)',
            }}
          >
            Scan
          </button>
        </div>
      )}
    </div>
  );
}
