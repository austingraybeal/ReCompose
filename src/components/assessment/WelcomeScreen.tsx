'use client';

import { motion } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';

export default function WelcomeScreen() {
  const beginFirstTask = useAssessmentStore((s) => s.beginFirstTask);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10, 11, 15, 0.92)', backdropFilter: 'blur(24px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="max-w-md w-full mx-4 p-8 rounded-2xl"
        style={{
          background: 'var(--rc-bg-elevated)',
          border: '1px solid var(--rc-border-default)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))',
              border: '1px solid rgba(62, 207, 180, 0.25)',
            }}
          >
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="var(--rc-accent)" strokeWidth="1.5">
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
            </svg>
          </div>
        </div>

        <h2
          className="text-center font-mono font-bold text-lg mb-2"
          style={{ color: 'var(--rc-text-primary)' }}
        >
          Body Image Assessment
        </h2>

        <p className="text-center text-rc-sm mb-6" style={{ color: 'var(--rc-text-secondary)' }}>
          This assessment measures how you perceive your body shape. You&apos;ll complete three short
          tasks using the body adjustment controls. There are no right or wrong answers &mdash; adjust
          the body based on your honest perception.
        </p>

        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--rc-bg-surface)' }}>
            <span className="font-mono text-rc-xs mt-0.5" style={{ color: 'var(--rc-accent)' }}>01</span>
            <div>
              <div className="text-rc-sm font-medium" style={{ color: 'var(--rc-text-primary)' }}>How You See Yourself</div>
              <div className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>Adjust to match your perception</div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--rc-bg-surface)' }}>
            <span className="font-mono text-rc-xs mt-0.5" style={{ color: 'var(--rc-accent)' }}>02</span>
            <div>
              <div className="text-rc-sm font-medium" style={{ color: 'var(--rc-text-primary)' }}>How You Want to Look</div>
              <div className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>Adjust to show your ideal body</div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--rc-bg-surface)' }}>
            <span className="font-mono text-rc-xs mt-0.5" style={{ color: 'var(--rc-accent)' }}>03</span>
            <div>
              <div className="text-rc-sm font-medium" style={{ color: 'var(--rc-text-primary)' }}>What Others Find Attractive</div>
              <div className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>Adjust to show partner preference</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--rc-text-dim)" strokeWidth="1.5">
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
          </svg>
          <span className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
            ~5 minutes &middot; Data processed entirely on your device
          </span>
        </div>

        <button
          onClick={beginFirstTask}
          className="w-full py-3 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, var(--rc-accent), #2aa88e)',
            color: '#0a0b0f',
            boxShadow: '0 4px 20px rgba(62, 207, 180, 0.25)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 28px rgba(62, 207, 180, 0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(62, 207, 180, 0.25)'; }}
        >
          Begin Assessment
        </button>
      </motion.div>
    </motion.div>
  );
}
