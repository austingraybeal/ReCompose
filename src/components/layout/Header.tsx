'use client';

import ToggleBar from '@/components/ui/ToggleBar';
import BrandLogo from '@/components/ui/BrandLogo';
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
        background: 'rgba(30, 33, 42, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--rc-border-subtle)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <BrandLogo size={28} />
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
                background: 'linear-gradient(135deg, rgba(168, 98, 248, 0.2), rgba(168, 98, 248, 0.08))',
                color: 'var(--rc-accent)',
                border: '1px solid rgba(168, 98, 248, 0.3)',
                boxShadow: '0 0 12px rgba(168, 98, 248, 0.1)',
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
