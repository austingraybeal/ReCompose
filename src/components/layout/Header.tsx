'use client';

import ToggleBar from '@/components/ui/ToggleBar';
import { useScanStore } from '@/lib/stores/scanStore';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';

export default function Header() {
  const hasScan = useScanStore((s) => !!s.scanData);
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);
  const startAssessment = useAssessmentStore((s) => s.startAssessment);
  const resetAssessment = useAssessmentStore((s) => s.resetAssessment);

  return (
    <header
      className="flex items-center justify-between px-5 py-2.5"
      style={{
        background: 'rgba(10, 11, 15, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--rc-border-subtle)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(62, 207, 180, 0.2), rgba(62, 207, 180, 0.05))',
            border: '1px solid rgba(62, 207, 180, 0.2)',
          }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--rc-accent)" strokeWidth="2">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-mono font-bold text-rc-base" style={{ color: 'var(--rc-text-primary)' }}>
          Re<span style={{ color: 'var(--rc-accent)' }}>Compose</span>
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {hasScan && !isAssessmentMode && <ToggleBar />}

        {hasScan && (
          isAssessmentMode ? (
            <button
              onClick={resetAssessment}
              className="px-3.5 py-1.5 rounded-full text-rc-xs font-mono tracking-wide transition-all duration-200"
              style={{
                background: 'rgba(224, 68, 90, 0.1)',
                color: '#e0445a',
                border: '1px solid rgba(224, 68, 90, 0.3)',
              }}
            >
              Exit Assessment
            </button>
          ) : (
            <button
              onClick={startAssessment}
              className="px-3.5 py-1.5 rounded-full text-rc-xs font-mono tracking-wide transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(62, 207, 180, 0.2), rgba(62, 207, 180, 0.08))',
                color: 'var(--rc-accent)',
                border: '1px solid rgba(62, 207, 180, 0.3)',
                boxShadow: '0 0 12px rgba(62, 207, 180, 0.1)',
              }}
            >
              Assess Body Image
            </button>
          )
        )}
      </div>
    </header>
  );
}
