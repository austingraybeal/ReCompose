'use client';

import { useViewStore } from '@/lib/stores/viewStore';
import { SEGMENTS } from '@/lib/constants/segmentDefs';
import { Html } from '@react-three/drei';

/**
 * Displays the hovered segment name as a floating tooltip in the 3D scene.
 */
export default function SegmentHighlight() {
  const segmentHighlight = useViewStore((s) => s.segmentHighlight);
  const hoveredSegment = useViewStore((s) => s.hoveredSegment);

  if (!segmentHighlight || !hoveredSegment) return null;

  const segDef = SEGMENTS.find(s => s.id === hoveredSegment);
  if (!segDef) return null;

  return (
    <Html
      center
      position={[0.6, 0.9, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="px-3 py-1.5 rounded-lg text-rc-sm font-mono font-bold whitespace-nowrap"
        style={{
          background: 'rgba(20, 22, 29, 0.9)',
          border: `1px solid ${segDef.color}`,
          color: segDef.color,
          backdropFilter: 'blur(10px)',
          boxShadow: `0 0 12px ${segDef.color}40`,
        }}
      >
        {segDef.icon} {segDef.label}
      </div>
    </Html>
  );
}
