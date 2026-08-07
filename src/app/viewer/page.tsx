'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import Header from '@/components/layout/Header';
import ViewerLayout from '@/components/layout/ViewerLayout';
import ResearchPanel from '@/components/ui/ResearchPanel';

export default function ViewerPage() {
  const router = useRouter();
  const scanData = useScanStore((s) => s.scanData);
  const appMode = useViewStore((s) => s.appMode);
  const startAssessment = useAssessmentStore((s) => s.startAssessment);
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);

  useEffect(() => {
    if (!scanData || !appMode) {
      router.push('/');
    }
  }, [scanData, appMode, router]);

  // BIDS mode: open the assessment immediately so participants never
  // explore their avatar before the tasks (the welcome overlay is opaque).
  useEffect(() => {
    if (scanData && appMode === 'bids' && !isAssessmentMode) {
      startAssessment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanData, appMode]);

  if (!scanData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--rc-bg-primary)' }}
      >
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: 'var(--rc-accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-rc-sm" style={{ color: 'var(--rc-text-dim)' }}>
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col relative" style={{ background: 'var(--rc-bg-primary)' }}>
      <Header />
      <ViewerLayout />
      <ResearchPanel />
    </div>
  );
}
