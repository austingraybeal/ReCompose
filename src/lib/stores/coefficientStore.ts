import { create } from 'zustand';
import {
  setCoefficientOverrides,
  coefficientProfileHash,
  type CoefficientOverrides,
  type ArmOverride,
} from '@/lib/morph/coefficientRegistry';
import { PUBLISHED_COEFFICIENTS } from '@/lib/morph/sensitivityModel';

/**
 * React-facing state for the research coefficient panel. Every mutation
 * normalizes the override set (values equal to the published defaults are
 * dropped), writes through to the plain registry the engine reads, and
 * bumps `version` so metric memos recompute.
 */
interface CoefficientState {
  panelOpen: boolean;
  version: number;
  overrides: CoefficientOverrides;

  setPanelOpen: (open: boolean) => void;
  setGain: (v: number | undefined) => void;
  setAndroidness: (v: number | undefined) => void;
  setRing: (table: 'ringFemale' | 'ringMale', ring: string, v: number | undefined) => void;
  setArm: (
    table: 'armFemale' | 'armMale',
    part: 'upper_arm' | 'forearm',
    v: number | undefined,
  ) => void;
  resetAll: () => void;
  importOverrides: (o: CoefficientOverrides) => void;
  profileHash: () => string;
}

const num = (v: number | undefined): number | undefined =>
  v === undefined || Number.isNaN(v) ? undefined : v;

/** Drop entries identical to published defaults; drop empty sub-objects. */
function normalize(o: CoefficientOverrides): CoefficientOverrides {
  const out: CoefficientOverrides = {};
  const gain = num(o.gain);
  if (gain !== undefined && gain !== PUBLISHED_COEFFICIENTS.gain) out.gain = gain;
  const andro = num(o.androidness);
  if (andro !== undefined) out.androidness = Math.min(1, Math.max(0, andro));

  for (const table of ['ringFemale', 'ringMale'] as const) {
    const pub = PUBLISHED_COEFFICIENTS[table] as Record<string, number>;
    const entries = Object.entries(o[table] ?? {}).filter(
      ([k, v]) => num(v) !== undefined && v !== pub[k],
    );
    if (entries.length) out[table] = Object.fromEntries(entries);
  }
  for (const table of ['armFemale', 'armMale'] as const) {
    const pub = PUBLISHED_COEFFICIENTS[table] as Record<string, number>;
    const src = (o[table] ?? {}) as Record<string, number | undefined>;
    const clean: ArmOverride = {};
    for (const part of ['upper_arm', 'forearm'] as const) {
      const v = num(src[part]);
      if (v !== undefined && v !== pub[part]) clean[part] = v;
    }
    if (Object.keys(clean).length) out[table] = clean;
  }
  return out;
}

export const useCoefficientStore = create<CoefficientState>((set, get) => {
  const commit = (next: CoefficientOverrides) => {
    const clean = normalize(next);
    setCoefficientOverrides(clean);
    set((s) => ({ overrides: clean, version: s.version + 1 }));
  };

  return {
    panelOpen: false,
    version: 0,
    overrides: {},

    setPanelOpen: (open) => set({ panelOpen: open }),

    setGain: (v) => commit({ ...get().overrides, gain: v }),

    setAndroidness: (v) => commit({ ...get().overrides, androidness: v }),

    setRing: (table, ring, v) => {
      const o = get().overrides;
      commit({ ...o, [table]: { ...(o[table] ?? {}), [ring]: v as number } });
    },

    setArm: (table, part, v) => {
      const o = get().overrides;
      commit({ ...o, [table]: { ...(o[table] ?? {}), [part]: v } });
    },

    resetAll: () => commit({}),

    importOverrides: (o) => commit(o),

    profileHash: () => coefficientProfileHash(get().overrides),
  };
});
