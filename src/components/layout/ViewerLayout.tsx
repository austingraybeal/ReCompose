'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import ViewControls from '@/components/ui/ViewControls';
import RegionalPanel from '@/components/ui/RegionalPanel';
import MetricsPanel from '@/components/ui/MetricsPanel';
import GlobalSlider from '@/components/ui/GlobalSlider';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';

const SceneCanvas = dynamic(
  () => import('@/components/viewer/SceneCanvas'),
  { ssr: false }
);

const AssessmentOverlay = dynamic(
  () => import('@/components/assessment/AssessmentOverlay'),
  { ssr: false }
);

export default function ViewerLayout() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isAssessmentMode = useAssessmentStore((s) => s.isAssessmentMode);
  const currentStep = useAssessmentStore((s) => s.currentStep);

  // During active tasks, hide metrics to avoid number anchoring
  const hideMetrics = isAssessmentMode && currentStep !== null && currentStep !== 'complete';

  // During welcome or results screens, hide all side panels
  const hideAllPanels = isAssessmentMode && (currentStep === 'welcome' || (currentStep === 'complete'));

  return (
    <div className="flex flex-col h-[calc(100vh-45px)]">
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        {!hideAllPanels && (
          <aside
            className="hidden md:flex flex-col gap-4 w-56 p-3 overflow-y-auto shrink-0"
            style={{
              background: 'rgba(30, 33, 42, 0.9)',
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid var(--rc-border-subtle)',
            }}
          >
            <ViewControls />
            <div style={{ borderTop: '1px solid var(--rc-border-subtle)' }} />
            <RegionalPanel />
          </aside>
        )}

        {/* 3D Viewer */}
        <main className="flex-1 relative min-w-0">
          <SceneCanvas ref={canvasRef} />

          {/* Assessment overlay */}
          <AssessmentOverlay canvasRef={canvasRef} />

          {/* Mobile controls (hidden during assessment) */}
          {!hideAllPanels && (
            <div className="md:hidden absolute bottom-0 left-0 right-0 p-3"
              style={{ background: 'linear-gradient(transparent, rgba(30, 33, 42, 0.95))' }}
            >
              <RegionalPanel />
            </div>
          )}
        </main>

        {/* Right panel — hidden during assessment */}
        {!hideMetrics && (
          <aside
            className="hidden lg:flex flex-col w-52 overflow-y-auto shrink-0"
            style={{
              background: 'rgba(30, 33, 42, 0.9)',
              backdropFilter: 'blur(20px)',
              borderLeft: '1px solid var(--rc-border-subtle)',
            }}
          >
            <MetricsPanel />
          </aside>
        )}
      </div>

      {/* Bottom bar — hidden during welcome/results */}
      {!hideAllPanels && (
        <div
          className="shrink-0"
          style={{
            background: 'rgba(30, 33, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--rc-border-subtle)',
          }}
        >
          <GlobalSlider />
        </div>
      )}
    </div>
  );
}
