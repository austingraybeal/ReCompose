'use client';

import Link from 'next/link';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import ResultsSummary from '@/components/assessment/ResultsSummary';

/**
 * Results-only view for a loaded session file — renders the full BIDS
 * results page (and all exports) without requiring the original scan.
 */
export default function SessionPage() {
  const record = useAssessmentStore((s) => s.assessmentRecord);

  if (!record) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-rc-sm font-mono" style={{ color: 'var(--rc-text-secondary)' }}>
          No session loaded.
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg font-mono text-rc-xs"
          style={{
            background: 'var(--rc-bg-elevated)',
            color: 'var(--rc-accent)',
            border: '1px solid rgba(168, 98, 248, 0.3)',
          }}
        >
          Back to start
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <ResultsSummary />
    </div>
  );
}
