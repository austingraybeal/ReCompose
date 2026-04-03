'use client';

import { useMorphStore } from '@/lib/stores/morphStore';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Master body fat percentage slider with gradient track and hero display.
 */
export default function GlobalSlider() {
  const originalBodyFat = useMorphStore((s) => s.originalBodyFat);
  const globalBodyFat = useMorphStore((s) => s.globalBodyFat);
  const setGlobalBodyFat = useMorphStore((s) => s.setGlobalBodyFat);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalBodyFat(parseFloat(e.target.value));
  };

  // Position of the "ACTUAL" marker as percentage of track
  const actualPosition = ((originalBodyFat - 5) / (55 - 5)) * 100;
  const currentPosition = ((globalBodyFat - 5) / (55 - 5)) * 100;

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-3">
      {/* Hero BF% display */}
      <div className="text-center mb-3">
        <motion.div
          className="font-mono font-bold text-rc-hero leading-none"
          style={{
            color: globalBodyFat < 20 ? 'var(--rc-bf-lean)'
              : globalBodyFat < 30 ? 'var(--rc-bf-mid)'
              : globalBodyFat < 40 ? 'var(--rc-bf-high)'
              : 'var(--rc-bf-very-high)',
          }}
          key={globalBodyFat.toFixed(1)}
          initial={{ opacity: 0.7, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        >
          {globalBodyFat.toFixed(1)}%
        </motion.div>
        <div className="text-rc-xs uppercase tracking-[2px] mt-1" style={{ color: 'var(--rc-text-dim)' }}>
          Body Fat
        </div>
      </div>

      {/* Slider track */}
      <div className="relative">
        {/* ACTUAL marker */}
        {originalBodyFat > 0 && (
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${actualPosition}%`, zIndex: 10 }}
          >
            <div
              className="text-rc-xs uppercase tracking-[1px] font-mono mb-1"
              style={{ color: 'var(--rc-text-dim)' }}
            >
              ACTUAL
            </div>
            <div
              className="w-0.5 h-4"
              style={{ background: 'var(--rc-text-dim)' }}
            />
          </div>
        )}

        <input
          type="range"
          min="5"
          max="55"
          step="0.1"
          value={globalBodyFat}
          onChange={handleChange}
          className="w-full h-2 mt-8 relative z-20"
          style={{
            background: `linear-gradient(to right, var(--rc-bf-lean), var(--rc-bf-mid), var(--rc-bf-high), var(--rc-bf-very-high))`,
            borderRadius: '3px',
          }}
        />

        {/* Min/Max labels */}
        <div className="flex justify-between mt-1">
          <span className="text-rc-xs font-mono" style={{ color: 'var(--rc-text-dim)' }}>5%</span>
          <span className="text-rc-xs font-mono" style={{ color: 'var(--rc-text-dim)' }}>55%</span>
        </div>
      </div>
    </div>
  );
}
