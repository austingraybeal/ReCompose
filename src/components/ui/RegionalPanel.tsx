'use client';

import { useMorphStore } from '@/lib/stores/morphStore';
import { useViewStore } from '@/lib/stores/viewStore';
import { SEGMENTS } from '@/lib/constants/segmentDefs';
import SegmentSlider from './SegmentSlider';
import { motion, AnimatePresence } from 'framer-motion';

export default function RegionalPanel() {
  const resetOverrides = useMorphStore((s) => s.resetRegionalOverrides);
  const lockProportional = useMorphStore((s) => s.lockProportional);
  const toggleLock = useMorphStore((s) => s.toggleLockProportional);
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
              {/* Lock Proportional toggle */}
              <button
                onClick={toggleLock}
                className="flex items-center gap-2 px-3 py-1.5 text-rc-xs uppercase tracking-[1px]"
                style={{ color: lockProportional ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}
              >
                <div
                  className="w-3 h-3 rounded-sm border transition-colors"
                  style={{
                    background: lockProportional ? 'var(--rc-accent)' : 'transparent',
                    borderColor: lockProportional ? 'var(--rc-accent)' : 'var(--rc-border-default)',
                  }}
                />
                Lock Proportional
              </button>

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
