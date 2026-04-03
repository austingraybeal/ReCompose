'use client';

import ToggleBar from '@/components/ui/ToggleBar';
import { useScanStore } from '@/lib/stores/scanStore';

export default function Header() {
  const hasScan = useScanStore((s) => !!s.scanData);

  return (
    <header
      className="flex items-center justify-between px-5 py-3 border-b"
      style={{
        background: 'var(--rc-bg-surface)',
        borderColor: 'var(--rc-border-subtle)',
      }}
    >
      <div className="flex items-center gap-3">
        <h1 className="font-mono font-bold text-rc-lg" style={{ color: 'var(--rc-accent)' }}>
          ReCompose
        </h1>
        <span className="text-rc-xs italic hidden sm:inline" style={{ color: 'var(--rc-text-dim)' }}>
          See your future form.
        </span>
      </div>

      {hasScan && <ToggleBar />}
    </header>
  );
}
