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
      className="px-3.5 py-1.5 rounded-full text-rc-xs font-mono tracking-wide transition-all duration-200"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(62, 207, 180, 0.2), rgba(62, 207, 180, 0.08))'
          : 'transparent',
        color: active ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
        border: active ? '1px solid rgba(62, 207, 180, 0.3)' : '1px solid var(--rc-border-default)',
        boxShadow: active ? '0 0 12px rgba(62, 207, 180, 0.1)' : 'none',
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
    <div className="flex items-center gap-1.5">
      <ToggleButton label="Wireframe" active={wireframe} onClick={toggleWireframe} />
      <ToggleButton label="Ghost" active={ghostOverlay} onClick={toggleGhostOverlay} />
      <ToggleButton label="Segments" active={segmentHighlight} onClick={toggleSegmentHighlight} />
    </div>
  );
}
