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
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--rc-bg-primary)' }}
    >
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1
          className="font-mono font-bold text-rc-hero mb-3"
          style={{ color: 'var(--rc-accent)' }}
        >
          ReCompose
        </h1>
        <p
          className="text-rc-lg italic"
          style={{ color: 'var(--rc-text-secondary)' }}
        >
          See your future form.
        </p>
      </motion.div>

      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <UploadZone />
      </motion.div>

      <motion.div
        className="mt-12 text-center max-w-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <p className="text-rc-sm" style={{ color: 'var(--rc-text-dim)' }}>
          Upload your 3D body scan (.obj) with paired measurement CSVs
          to visualize and explore body composition changes in real time.
        </p>
        <div className="flex items-center justify-center gap-4 mt-4 text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
          <span>OBJ Mesh</span>
          <span style={{ color: 'var(--rc-border-default)' }}>+</span>
          <span>Core Measures CSV</span>
          <span style={{ color: 'var(--rc-border-default)' }}>+</span>
          <span>Body Comp CSV</span>
        </div>
      </motion.div>
    </div>
  );
}
