'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/lib/stores/scanStore';
import { useViewStore, type AppMode } from '@/lib/stores/viewStore';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import {
  loadSessionFromBrowser,
  parseSessionFile,
  type SessionFile,
} from '@/lib/assessment/sessionFile';
import UploadZone from '@/components/ui/UploadZone';
import BrandLogo from '@/components/ui/BrandLogo';
import { motion } from 'framer-motion';

function ModeButton({
  mode,
  title,
  desc,
  selected,
  onSelect,
}: {
  mode: AppMode;
  title: string;
  desc: string;
  selected: boolean;
  onSelect: (mode: AppMode) => void;
}) {
  return (
    <button
      onClick={() => onSelect(mode)}
      className="flex-1 px-5 py-4 rounded-xl text-left transition-all duration-200"
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(168, 98, 248, 0.18), rgba(168, 98, 248, 0.06))'
          : 'var(--rc-bg-elevated)',
        border: selected
          ? '2px solid var(--rc-accent)'
          : '1px solid var(--rc-border-default)',
        boxShadow: selected ? '0 0 24px rgba(168, 98, 248, 0.15)' : 'none',
      }}
    >
      <div
        className="font-mono font-bold text-rc-base mb-1"
        style={{ color: selected ? 'var(--rc-accent)' : 'var(--rc-text-primary)' }}
      >
        {title}
      </div>
      <div className="text-rc-xs leading-relaxed" style={{ color: 'var(--rc-text-secondary)' }}>
        {desc}
      </div>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const scanData = useScanStore((s) => s.scanData);
  const appMode = useViewStore((s) => s.appMode);
  const setAppMode = useViewStore((s) => s.setAppMode);
  const hydrateSession = useAssessmentStore((s) => s.hydrateSession);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedSession, setSavedSession] = useState<SessionFile | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Surface the auto-backed-up session, if one exists.
  useEffect(() => {
    setSavedSession(loadSessionFromBrowser());
  }, []);

  const openSession = (file: SessionFile) => {
    hydrateSession({
      record: file.record,
      snapshotSets: file.snapshotSets,
      derived: file.derived,
    });
    router.push('/session');
  };

  const handleSessionFile = async (f: File) => {
    const parsed = parseSessionFile(await f.text());
    if (parsed) {
      setLoadError(false);
      openSession(parsed);
    } else {
      setLoadError(true);
    }
  };

  // A mode must be chosen before the viewer opens.
  useEffect(() => {
    if (scanData && appMode) {
      router.push('/viewer');
    }
  }, [scanData, appMode, router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #080a10 0%, #0d0f18 40%, #12141f 100%)' }}
    >
      {/* Subtle radial glow behind logo */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(168, 98, 248, 0.06) 0%, transparent 70%)',
        }}
      />

      <motion.div
        className="text-center mb-10 relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        {/* Logo mark — clamps down on short laptop viewports */}
        <div className="mx-auto mb-5 flex items-center justify-center">
          <BrandLogo size={180} cssSize="min(180px, 19vh)" />
        </div>

        <h1
          className="font-mono font-bold tracking-tight"
          style={{ fontSize: 'clamp(40px, 7vh, 64px)', color: 'var(--rc-text-primary)' }}
        >
          Re<span style={{ color: 'var(--rc-accent)' }}>Compose</span>
        </h1>
        <p className="text-rc-base mt-2 tracking-wide uppercase"
          style={{ color: 'var(--rc-text-dim)', letterSpacing: '3px', fontSize: '11px' }}
        >
          Perception, Measured
        </p>
      </motion.div>

      <motion.div
        className="w-full max-w-xl relative z-10 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
      >
        <div
          className="text-center text-[10px] uppercase tracking-[3px] font-mono mb-3"
          style={{ color: appMode ? 'var(--rc-text-dim)' : 'var(--rc-accent)' }}
        >
          {appMode ? 'Mode selected' : 'Select a mode to continue'}
        </div>
        <div className="flex gap-3">
          <ModeButton
            mode="free"
            title="FreeCompose"
            desc="Explore the avatar freely — adjust global body fat and every segment with live metrics."
            selected={appMode === 'free'}
            onSelect={setAppMode}
          />
          <ModeButton
            mode="bids"
            title="BIDS Mode"
            desc="Go directly to the body image assessment. The avatar is not shown until the tasks begin."
            selected={appMode === 'bids'}
            onSelect={setAppMode}
          />
        </div>
      </motion.div>

      <motion.div
        className="w-full relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
      >
        <UploadZone />
      </motion.div>

      {/* Saved-session entry points */}
      <motion.div
        className="mt-6 flex flex-wrap items-center justify-center gap-3 relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.25 }}
      >
        {savedSession && (
          <button
            onClick={() => openSession(savedSession)}
            className="px-4 py-2 rounded-lg font-mono text-rc-xs tracking-wide transition-all duration-150"
            style={{
              background: 'rgba(168, 98, 248, 0.1)',
              color: 'var(--rc-accent)',
              border: '1px solid rgba(168, 98, 248, 0.3)',
            }}
          >
            Restore last session
            {savedSession.record.participantId ? ` (${savedSession.record.participantId})` : ''}
            {' · '}
            {new Date(savedSession.savedAt).toLocaleString()}
          </button>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 rounded-lg font-mono text-rc-xs tracking-wide transition-all duration-150"
          style={{
            background: 'var(--rc-bg-elevated)',
            color: 'var(--rc-text-secondary)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          Load Session File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleSessionFile(f);
            e.target.value = '';
          }}
        />
        {loadError && (
          <span className="text-rc-xs font-mono" style={{ color: '#e0445a' }}>
            Not a valid ReCompose session file.
          </span>
        )}
      </motion.div>
    </div>
  );
}
