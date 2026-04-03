'use client';

import { useRef, useCallback } from 'react';
import { useSmplStore } from '@/lib/stores/smplStore';
import { loadSMPLFromFile } from '@/lib/smpl/loader';

/**
 * UI panel for loading an SMPL model JSON file and toggling between
 * Phase 1 (radial deformation) and Phase 2 (SMPL PCA) engines.
 */
export default function SMPLModelLoader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const modelData = useSmplStore((s) => s.modelData);
  const isLoading = useSmplStore((s) => s.isLoading);
  const error = useSmplStore((s) => s.error);
  const useSmpl = useSmplStore((s) => s.useSmpl);
  const setModelData = useSmplStore((s) => s.setModelData);
  const setLoading = useSmplStore((s) => s.setLoading);
  const setError = useSmplStore((s) => s.setError);
  const setUseSmpl = useSmplStore((s) => s.setUseSmpl);
  const clearModel = useSmplStore((s) => s.clearModel);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const data = await loadSMPLFromFile(file);
      setModelData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SMPL model');
    }

    // Reset file input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  }, [setModelData, setLoading, setError]);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-[10px] uppercase tracking-[3px] px-1 mb-0.5 font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        SMPL Model
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
            background: modelData
              ? useSmpl ? 'var(--rc-accent)' : 'var(--rc-text-dim)'
              : 'rgba(255,255,255,0.15)',
          }}
        />
        {isLoading
          ? 'Loading...'
          : modelData
            ? `${modelData.gender} · ${modelData.vertexCount.toLocaleString()}v · ${modelData.shapeComponentCount} PCs`
            : 'No model loaded'}
      </div>

      {/* Error message */}
      {error && (
        <div
          className="px-2 py-1.5 rounded-lg text-rc-xs font-mono"
          style={{
            background: 'rgba(224, 68, 90, 0.1)',
            border: '1px solid rgba(224, 68, 90, 0.3)',
            color: '#e0445a',
          }}
        >
          {error}
        </div>
      )}

      {/* Load / toggle buttons */}
      <div className="flex gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
          className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))',
            color: 'var(--rc-accent)',
            border: '1px solid rgba(62, 207, 180, 0.25)',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          {modelData ? 'Replace' : 'Load JSON'}
        </button>

        {modelData && (
          <>
            <button
              onClick={() => setUseSmpl(!useSmpl)}
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
              {useSmpl ? 'SMPL On' : 'SMPL Off'}
            </button>
            <button
              onClick={clearModel}
              className="px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
              style={{
                background: 'var(--rc-bg-elevated)',
                color: 'var(--rc-text-dim)',
                border: '1px solid var(--rc-border-default)',
              }}
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Help text */}
      {!modelData && (
        <div
          className="text-[10px] px-1 font-mono leading-relaxed"
          style={{ color: 'var(--rc-text-dim)', opacity: 0.7 }}
        >
          Load an SMPL model JSON extracted with tools/extract_smpl.py
          for parametric body deformation.
        </div>
      )}
    </div>
  );
}
