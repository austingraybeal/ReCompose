'use client';

import { useViewStore } from '@/lib/stores/viewStore';

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToggleButton({ label, active, onClick }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-rc-xs uppercase tracking-[1px] font-mono transition-all duration-150"
      style={{
        background: active ? 'var(--rc-accent-dim)' : 'var(--rc-bg-elevated)',
        color: active ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
        border: active ? '1px solid var(--rc-border-accent)' : '1px solid var(--rc-border-default)',
        boxShadow: active ? 'var(--rc-shadow-glow)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

export default function ToggleBar() {
  const wireframe = useViewStore((s) => s.wireframe);
  const ghostOverlay = useViewStore((s) => s.ghostOverlay);
  const segmentHighlight = useViewStore((s) => s.segmentHighlight);
  const toggleWireframe = useViewStore((s) => s.toggleWireframe);
  const toggleGhostOverlay = useViewStore((s) => s.toggleGhostOverlay);
  const toggleSegmentHighlight = useViewStore((s) => s.toggleSegmentHighlight);

  return (
    <div className="flex items-center gap-2">
      <ToggleButton label="Wireframe" active={wireframe} onClick={toggleWireframe} />
      <ToggleButton label="Ghost" active={ghostOverlay} onClick={toggleGhostOverlay} />
      <ToggleButton label="Segments" active={segmentHighlight} onClick={toggleSegmentHighlight} />
    </div>
  );
}
