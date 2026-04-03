'use client';

import { useMorphStore } from '@/lib/stores/morphStore';
import { motion } from 'framer-motion';

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

  const actualPosition = ((originalBodyFat - 5) / (55 - 5)) * 100;

  const bfColor = globalBodyFat < 20 ? 'var(--rc-bf-lean)'
    : globalBodyFat < 30 ? 'var(--rc-bf-mid)'
    : globalBodyFat < 40 ? 'var(--rc-bf-high)'
    : 'var(--rc-bf-very-high)';

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-4">
      <div className="flex items-end justify-center gap-3 mb-4">
        <motion.div
          className="font-mono font-bold leading-none"
          style={{ fontSize: '52px', color: bfColor }}
          key={Math.round(globalBodyFat)}
          initial={{ opacity: 0.7, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        >
          {Math.round(globalBodyFat)}%
        </motion.div>
        <div className="pb-2">
          <div className="text-rc-xs uppercase tracking-[3px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>
            Body Fat
          </div>
        </div>
      </div>

      <div className="relative">
        {/* ACTUAL marker */}
        {originalBodyFat > 0 && (
          <div
            className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10"
            style={{ left: `${actualPosition}%` }}
          >
            <div className="text-[9px] uppercase tracking-[1px] font-mono mb-0.5"
              style={{ color: 'var(--rc-text-dim)' }}
            >
              ACTUAL
            </div>
            <div className="w-px h-5" style={{ background: 'var(--rc-text-dim)' }} />
          </div>
        )}

        <input
          type="range"
          min="5"
          max="55"
          step="1"
          value={globalBodyFat}
          onChange={handleChange}
          className="w-full h-2 mt-7 relative z-20 rounded-full"
          style={{
            background: `linear-gradient(to right, var(--rc-bf-lean), var(--rc-bf-mid) 50%, var(--rc-bf-high) 75%, var(--rc-bf-very-high))`,
            borderRadius: '99px',
          }}
        />

        <div className="flex justify-between mt-2">
          <span className="text-[10px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>5%</span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>55%</span>
        </div>
      </div>
    </div>
  );
}
