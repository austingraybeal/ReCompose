'use client';

import { useState } from 'react';

/**
 * The ReCompose brand mark. Renders public/brand/logo.png at the given
 * pixel size; falls back to a simple accent ring if the asset is missing.
 * The PNG carries its own rounded-square frame, so corners are clipped to
 * match and a soft accent glow is added behind it.
 */
export default function BrandLogo({ size }: { size: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, rgba(168, 98, 248, 0.2), rgba(168, 98, 248, 0.05))',
          border: '1px solid rgba(168, 98, 248, 0.25)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--rc-accent)"
          strokeWidth="1.5"
          style={{ width: size * 0.5, height: size * 0.5 }}
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo.png"
      alt="ReCompose logo"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.18,
        boxShadow: `0 0 ${Math.round(size * 0.4)}px rgba(168, 98, 248, 0.25)`,
      }}
    />
  );
}
