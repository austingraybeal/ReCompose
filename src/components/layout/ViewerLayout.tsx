'use client';

import dynamic from 'next/dynamic';
import ViewControls from '@/components/ui/ViewControls';
import RegionalPanel from '@/components/ui/RegionalPanel';
import MetricsPanel from '@/components/ui/MetricsPanel';
import GlobalSlider from '@/components/ui/GlobalSlider';

const SceneCanvas = dynamic(
  () => import('@/components/viewer/SceneCanvas'),
  { ssr: false }
);

export default function ViewerLayout() {
  return (
    <div className="flex flex-col h-[calc(100vh-52px)]">
      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel — Camera + Segments */}
        <aside
          className="hidden md:flex flex-col gap-4 w-56 p-3 overflow-y-auto border-r shrink-0"
          style={{
            background: 'var(--rc-bg-surface)',
            borderColor: 'var(--rc-border-subtle)',
          }}
        >
          <ViewControls />
          <div className="border-t" style={{ borderColor: 'var(--rc-border-subtle)' }} />
          <RegionalPanel />
        </aside>

        {/* 3D Viewer */}
        <main className="flex-1 relative min-w-0">
          <SceneCanvas />

          {/* Mobile controls overlay */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 p-3" style={{ background: 'linear-gradient(transparent, var(--rc-bg-primary))' }}>
            <RegionalPanel />
          </div>
        </main>

        {/* Right panel — Metrics */}
        <aside
          className="hidden lg:flex flex-col w-56 border-l overflow-y-auto shrink-0"
          style={{
            background: 'var(--rc-bg-surface)',
            borderColor: 'var(--rc-border-subtle)',
          }}
        >
          <MetricsPanel />
        </aside>
      </div>

      {/* Bottom bar — Global slider */}
      <div
        className="border-t shrink-0"
        style={{
          background: 'var(--rc-bg-surface)',
          borderColor: 'var(--rc-border-subtle)',
        }}
      >
        <GlobalSlider />
      </div>
    </div>
  );
}
