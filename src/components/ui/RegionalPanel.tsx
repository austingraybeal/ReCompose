'use client';

import { useMorphStore } from '@/lib/stores/morphStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { SEGMENTS } from '@/lib/constants/segmentDefs';
import SegmentSlider from './SegmentSlider';
import { motion, AnimatePresence } from 'framer-motion';

export default function RegionalPanel() {
  const resetOverrides = useMorphStore((s) => s.resetRegionalOverrides);
  const linkMode = useMorphStore((s) => s.linkMode);
  const setLinkMode = useMorphStore((s) => s.setLinkMode);
  const open = useViewStore((s) => s.regionalPanelOpen);
  const setOpen = useViewStore((s) => s.setRegionalPanelOpen);
  const focusedSegment = useViewStore((s) => s.focusedSegment);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors duration-150"
        style={{
          background: 'var(--rc-bg-elevated)',
          border: '1px solid var(--rc-border-default)',
        }}
      >
        <span
          className="text-rc-xs uppercase tracking-[2px]"
          style={{ color: 'var(--rc-text-secondary)' }}
        >
          Segments
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ color: 'var(--rc-text-dim)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 pb-2">
              {/* Link mode: two mutually exclusive buttons, Independent default */}
              <div className="flex gap-1.5 px-1 pb-1">
                {(
                  [
                    { mode: 'independent', label: 'Independent', hint: 'Each segment moves alone' },
                    { mode: 'proportional', label: 'Linked', hint: 'Moving one segment shifts the whole body proportionally' },
                  ] as const
                ).map(({ mode, label, hint }) => {
                  const active = linkMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setLinkMode(mode)}
                      aria-pressed={active}
                      title={hint}
                      className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono uppercase tracking-[1px] transition-all duration-150"
                      style={{
                        background: active ? 'rgba(168, 98, 248, 0.15)' : 'var(--rc-bg-elevated)',
                        color: active ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
                        border: active
                          ? '1px solid rgba(168, 98, 248, 0.4)'
                          : '1px solid var(--rc-border-default)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Segment sliders */}
              {SEGMENTS.map((seg) => (
                <SegmentSlider
                  key={seg.id}
                  segmentId={seg.id}
                  label={seg.label}
                  icon={seg.icon}
                  focused={focusedSegment === seg.id}
                />
              ))}

              {/* Reset button */}
              <button
                onClick={resetOverrides}
                className="mt-1 px-3 py-1.5 rounded-lg text-rc-xs uppercase tracking-[2px] transition-colors duration-150"
                style={{
                  background: 'var(--rc-bg-hover)',
                  color: 'var(--rc-text-secondary)',
                  border: '1px solid var(--rc-border-default)',
                }}
              >
                Reset All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
