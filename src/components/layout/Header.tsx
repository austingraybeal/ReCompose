'use client';

import ToggleBar from '@/components/ui/ToggleBar';
import { useScanStore } from '@/lib/stores/scanStore';

export default function Header() {
  const hasScan = useScanStore((s) => !!s.scanData);

  return (
    <header
      className="flex items-center justify-between px-5 py-2.5"
      style={{
        background: 'rgba(10, 11, 15, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--rc-border-subtle)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(62, 207, 180, 0.2), rgba(62, 207, 180, 0.05))',
            border: '1px solid rgba(62, 207, 180, 0.2)',
          }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--rc-accent)" strokeWidth="2">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-mono font-bold text-rc-base" style={{ color: 'var(--rc-text-primary)' }}>
          Re<span style={{ color: 'var(--rc-accent)' }}>Compose</span>
        </h1>
      </div>

      {hasScan && <ToggleBar />}
    </header>
  );
}
