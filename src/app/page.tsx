'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/lib/stores/scanStore';
import UploadZone from '@/components/ui/UploadZone';
import { motion } from 'framer-motion';

export default function HomePage() {
  const router = useRouter();
  const scanData = useScanStore((s) => s.scanData);

  useEffect(() => {
    if (scanData) {
      router.push('/viewer');
    }
  }, [scanData, router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #080a10 0%, #0d0f18 40%, #12141f 100%)' }}
    >
      {/* Subtle radial glow behind logo */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(62, 207, 180, 0.06) 0%, transparent 70%)',
        }}
      />

      <motion.div
        className="text-center mb-10 relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        {/* Logo mark */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(62, 207, 180, 0.15), rgba(62, 207, 180, 0.05))',
            border: '2px solid rgba(62, 207, 180, 0.25)',
            boxShadow: '0 0 40px rgba(62, 207, 180, 0.15)',
          }}
        >
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="var(--rc-accent)" strokeWidth="1.5">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round" />
            <path d="M12 6v12M8 9l4-3 4 3M8 15l4 3 4-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1
          className="font-mono font-bold tracking-tight"
          style={{ fontSize: '42px', color: 'var(--rc-text-primary)' }}
        >
          Re<span style={{ color: 'var(--rc-accent)' }}>Compose</span>
        </h1>
        <p className="text-rc-base mt-2 tracking-wide uppercase"
          style={{ color: 'var(--rc-text-dim)', letterSpacing: '3px', fontSize: '11px' }}
        >
          See your future form
        </p>
      </motion.div>

      <motion.div
        className="w-full relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
      >
        <UploadZone />
      </motion.div>

      <motion.div
        className="mt-14 text-center max-w-sm relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.3 }}
      >
        <p className="text-rc-sm leading-relaxed" style={{ color: 'var(--rc-text-dim)' }}>
          Upload your 3D body scan to visualize and explore body composition changes in real time.
        </p>
        <div className="flex items-center justify-center gap-3 mt-5">
          {['OBJ Mesh', 'Core Measures', 'Body Comp'].map((label, i) => (
            <span key={label} className="flex items-center gap-3">
              <span
                className="px-2.5 py-1 rounded-full text-rc-xs font-mono"
                style={{
                  background: 'rgba(62, 207, 180, 0.08)',
                  border: '1px solid rgba(62, 207, 180, 0.15)',
                  color: 'var(--rc-text-secondary)',
                }}
              >
                {label}
              </span>
              {i < 2 && <span style={{ color: 'var(--rc-border-default)' }}>+</span>}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
