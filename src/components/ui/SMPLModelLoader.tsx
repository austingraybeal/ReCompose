'use client';

import { useSmplStore } from '@/lib/stores/smplStore';
import type { SMPLGender } from '@/lib/stores/smplStore';

const GENDER_OPTIONS: { id: SMPLGender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

/**
 * Gender selector for SMPL body constraints.
 * Selecting male/female loads the corresponding SMPL model which
 * provides anatomically-informed deformation limits for the scan.
 */
export default function SMPLModelLoader() {
  const isLoading = useSmplStore((s) => s.isLoading);
  const gender = useSmplStore((s) => s.gender);
  const displacementField = useSmplStore((s) => s.displacementField);
  const availableGenders = useSmplStore((s) => s.availableGenders);
  const setGender = useSmplStore((s) => s.setGender);

  // Don't show if no models available
  if (availableGenders.size === 0 && !isLoading) return null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-[10px] uppercase tracking-[3px] px-1 mb-0.5 font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Body Type
      </div>

      {/* Gender selector */}
      <div className="flex gap-1.5">
        {GENDER_OPTIONS.map((opt) => {
          const available = availableGenders.has(opt.id);
          const active = gender === opt.id && displacementField !== null;
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

      {isLoading && (
        <div className="text-[10px] px-1 font-mono" style={{ color: 'var(--rc-text-dim)' }}>
          Loading...
        </div>
      )}
    </div>
  );
}
