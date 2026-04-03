'use client';

import { useEffect } from 'react';
import { useSmplStore } from '@/lib/stores/smplStore';

/**
 * Auto-initializes the SMPL model on first render.
 * Fetches from /models/smpl_neutral.json — if the file doesn't exist,
 * silently falls back to the Phase 1 radial deformation engine.
 */
export function useSmplInit() {
  const initialize = useSmplStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);
}
