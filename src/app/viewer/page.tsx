'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/lib/stores/scanStore';
import Header from '@/components/layout/Header';
import ViewerLayout from '@/components/layout/ViewerLayout';

export default function ViewerPage() {
  const router = useRouter();
  const scanData = useScanStore((s) => s.scanData);

  useEffect(() => {
    if (!scanData) {
      router.push('/');
    }
  }, [scanData, router]);

  if (!scanData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--rc-bg-primary)' }}
      >
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: 'var(--rc-accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-rc-sm" style={{ color: 'var(--rc-text-dim)' }}>
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--rc-bg-primary)' }}>
      <Header />
      <ViewerLayout />
    </div>
  );
}
