'use client';

import { useSmplStore } from '@/lib/stores/smplStore';

/**
 * Status panel showing SMPL model state with toggle to switch
 * between SMPL (Phase 2) and radial (Phase 1) deformation engines.
 * The model auto-loads from public/models/ on app boot.
 */
export default function SMPLModelLoader() {
  const modelData = useSmplStore((s) => s.modelData);
  const isLoading = useSmplStore((s) => s.isLoading);
  const useSmpl = useSmplStore((s) => s.useSmpl);
  const setUseSmpl = useSmplStore((s) => s.setUseSmpl);

  // Don't show panel if no model loaded and not loading
  if (!modelData && !isLoading) return null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-[10px] uppercase tracking-[3px] px-1 mb-0.5 font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Body Model
      </div>

      {/* Status indicator */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-rc-xs font-mono"
        style={{
          background: 'var(--rc-bg-elevated)',
          border: '1px solid var(--rc-border-default)',
          color: modelData ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
        }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: isLoading
              ? 'var(--rc-text-dim)'
              : useSmpl
                ? 'var(--rc-accent)'
                : 'rgba(255,255,255,0.15)',
          }}
        />
        {isLoading
          ? 'Loading SMPL...'
          : `SMPL ${modelData!.gender} · ${modelData!.vertexCount.toLocaleString()}v`}
      </div>

      {/* Engine toggle */}
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
