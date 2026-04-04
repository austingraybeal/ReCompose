'use client';

import { useGenderStore } from '@/lib/stores/genderStore';
import type { BodyGender } from '@/lib/stores/genderStore';

const GENDER_OPTIONS: { id: BodyGender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

/**
 * Gender selector for body-type-specific deformation curves.
 * Male uses android (belly-dominant) fat distribution.
 * Female uses gynoid (hips/thighs/bust-dominant) fat distribution.
 */
export default function BodyTypeSelector() {
  const gender = useGenderStore((s) => s.gender);
  const setGender = useGenderStore((s) => s.setGender);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-[10px] uppercase tracking-[3px] px-1 mb-0.5 font-mono"
        style={{ color: 'var(--rc-text-dim)' }}
      >
        Body Type
      </div>

      <div className="flex gap-1.5">
        {GENDER_OPTIONS.map((opt) => {
          const active = gender === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setGender(opt.id)}
              className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono transition-all duration-200 text-center"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))'
                  : 'var(--rc-bg-elevated)',
                color: active
                  ? 'var(--rc-accent)'
                  : 'var(--rc-text-dim)',
                border: active
                  ? '1px solid rgba(62, 207, 180, 0.25)'
                  : '1px solid var(--rc-border-default)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
