'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCoefficientStore } from '@/lib/stores/coefficientStore';
import { PUBLISHED_COEFFICIENTS, computeAndroidness } from '@/lib/morph/sensitivityModel';
import { useGenderStore } from '@/lib/stores/genderStore';
import { useScanStore } from '@/lib/stores/scanStore';
import type { CoefficientOverrides } from '@/lib/morph/coefficientRegistry';

/**
 * Research mode: the live physiological model, tunable. Every coefficient
 * shows its published default; edits apply to the avatar and metrics in
 * real time; the active profile hash is stamped into assessment records
 * and exports. Restore Defaults returns to the published model exactly.
 */
export default function ResearchPanel() {
  const open = useCoefficientStore((s) => s.panelOpen);
  const setOpen = useCoefficientStore((s) => s.setPanelOpen);
  const overrides = useCoefficientStore((s) => s.overrides);
  const setGain = useCoefficientStore((s) => s.setGain);
  const setAndroidness = useCoefficientStore((s) => s.setAndroidness);
  const setRing = useCoefficientStore((s) => s.setRing);
  const setArm = useCoefficientStore((s) => s.setArm);
  const resetAll = useCoefficientStore((s) => s.resetAll);
  const importOverrides = useCoefficientStore((s) => s.importOverrides);
  const profileHash = useCoefficientStore((s) => s.profileHash);

  const sex = useGenderStore((s) => s.gender);
  const whr = useScanStore((s) => s.scanData?.bodyComp?.waistToHipRatio);
  const fileRef = useRef<HTMLInputElement>(null);

  const gain = overrides.gain ?? PUBLISHED_COEFFICIENTS.gain;
  const autoAndroidness = computeAndroidness(sex, whr);
  const manualAndroidness = overrides.androidness;

  const ringNames = Object.keys(PUBLISHED_COEFFICIENTS.ringFemale);

  const exportProfile = () => {
    const payload = {
      format: 'recompose-coefficients',
      version: 1,
      hash: profileHash(),
      overrides,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recompose-coefficients-${profileHash()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProfile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data?.format === 'recompose-coefficients' && data?.overrides) {
        importOverrides(data.overrides as CoefficientOverrides);
      }
    } catch {
      // invalid file — ignore
    }
  };

  const numInput = (
    value: number,
    isOverridden: boolean,
    onChange: (v: number | undefined) => void,
  ) => (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => {
        const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
        onChange(v);
      }}
      className="w-16 px-1.5 py-1 rounded text-right font-mono text-rc-xs tabular-nums outline-none"
      style={{
        background: 'var(--rc-bg-primary)',
        border: isOverridden
          ? '1px solid rgba(240, 200, 74, 0.6)'
          : '1px solid var(--rc-border-subtle)',
        color: isOverridden ? '#f0c84a' : 'var(--rc-text-primary)',
      }}
    />
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute right-0 top-0 bottom-0 w-[400px] max-w-[92vw] z-50 overflow-y-auto"
          style={{
            background: 'rgba(20, 22, 30, 0.97)',
            backdropFilter: 'blur(20px)',
            borderLeft: '1px solid var(--rc-border-default)',
          }}
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] uppercase tracking-[3px] font-mono font-bold" style={{ color: 'var(--rc-accent)' }}>
                Research Mode
              </div>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded text-rc-xs font-mono"
                style={{ color: 'var(--rc-text-dim)', border: '1px solid var(--rc-border-default)' }}
              >
                Close
              </button>
            </div>
            <div className="text-rc-xs mb-3" style={{ color: 'var(--rc-text-dim)' }}>
              Live model coefficients. Edits apply immediately; yellow = tuned away from the
              published value. Profile: <span className="font-mono" style={{ color: profileHash() === 'default' ? 'var(--rc-text-secondary)' : '#f0c84a' }}>{profileHash()}</span>
            </div>

            {/* Profile actions */}
            <div className="flex gap-2 mb-4">
              <button onClick={resetAll} className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono"
                style={{ background: 'var(--rc-bg-elevated)', color: 'var(--rc-text-secondary)', border: '1px solid var(--rc-border-default)' }}>
                Restore Defaults
              </button>
              <button onClick={exportProfile} className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono"
                style={{ background: 'var(--rc-bg-elevated)', color: 'var(--rc-text-secondary)', border: '1px solid var(--rc-border-default)' }}>
                Export Profile
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex-1 px-2 py-1.5 rounded-lg text-rc-xs font-mono"
                style={{ background: 'var(--rc-bg-elevated)', color: 'var(--rc-text-secondary)', border: '1px solid var(--rc-border-default)' }}>
                Import
              </button>
              <input ref={fileRef} type="file" accept=".json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importProfile(f); e.target.value = ''; }} />
            </div>

            {/* Global constants */}
            <SectionLabel>Global</SectionLabel>
            <Row label="Sensitivity gain" hint={`default ${PUBLISHED_COEFFICIENTS.gain.toFixed(2)}`}>
              {numInput(gain, overrides.gain !== undefined, setGain)}
            </Row>
            <Row
              label="Androidness"
              hint={manualAndroidness === undefined ? `auto ${autoAndroidness.toFixed(2)} (sex + WHR)` : 'manual override'}
            >
              <div className="flex items-center gap-2">
                {manualAndroidness !== undefined && numInput(manualAndroidness, true, setAndroidness)}
                <button
                  onClick={() => setAndroidness(manualAndroidness === undefined ? autoAndroidness : undefined)}
                  className="px-2 py-1 rounded text-[10px] font-mono"
                  style={{
                    background: manualAndroidness !== undefined ? 'rgba(240, 200, 74, 0.12)' : 'var(--rc-bg-elevated)',
                    color: manualAndroidness !== undefined ? '#f0c84a' : 'var(--rc-text-dim)',
                    border: '1px solid var(--rc-border-default)',
                  }}
                >
                  {manualAndroidness === undefined ? 'Auto' : 'Manual'}
                </button>
              </div>
            </Row>
            <Row label="Segment override strength" hint="fixed">
              <span className="font-mono text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>1.00 (read-only)</span>
            </Row>
            <Row label="Scale compression" hint="fixed">
              <span className="font-mono text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>soft knee ±30% (read-only)</span>
            </Row>

            {/* Arm sensitivities */}
            <SectionLabel>Arm sensitivity (% radial per +1% BF)</SectionLabel>
            <TableHeader />
            {(['upper_arm', 'forearm'] as const).map((part) => (
              <div key={part} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--rc-border-subtle)' }}>
                <span className="text-rc-xs font-mono" style={{ color: 'var(--rc-text-secondary)' }}>
                  {part === 'upper_arm' ? 'Upper arm' : 'Forearm'}
                </span>
                <div className="flex gap-2">
                  {numInput(
                    overrides.armFemale?.[part] ?? PUBLISHED_COEFFICIENTS.armFemale[part],
                    overrides.armFemale?.[part] !== undefined,
                    (v) => setArm('armFemale', part, v),
                  )}
                  {numInput(
                    overrides.armMale?.[part] ?? PUBLISHED_COEFFICIENTS.armMale[part],
                    overrides.armMale?.[part] !== undefined,
                    (v) => setArm('armMale', part, v),
                  )}
                </div>
              </div>
            ))}

            {/* Ring sensitivities */}
            <SectionLabel>Ring sensitivity (% radial per +1% BF)</SectionLabel>
            <TableHeader />
            {ringNames.map((ring) => (
              <div key={ring} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--rc-border-subtle)' }}>
                <span className="text-[11px] font-mono truncate mr-2" style={{ color: 'var(--rc-text-secondary)' }}>
                  {ring}
                </span>
                <div className="flex gap-2 shrink-0">
                  {numInput(
                    overrides.ringFemale?.[ring] ?? (PUBLISHED_COEFFICIENTS.ringFemale as Record<string, number>)[ring],
                    overrides.ringFemale?.[ring] !== undefined,
                    (v) => setRing('ringFemale', ring, v),
                  )}
                  {numInput(
                    overrides.ringMale?.[ring] ?? (PUBLISHED_COEFFICIENTS.ringMale as Record<string, number>)[ring],
                    overrides.ringMale?.[ring] !== undefined,
                    (v) => setRing('ringMale', ring, v),
                  )}
                </div>
              </div>
            ))}

            <div className="mt-4 text-[10px] leading-relaxed" style={{ color: 'var(--rc-text-dim)' }}>
              Female and male columns anchor the androidness interpolation; the avatar and all
              metrics use the blend at the current androidness. The active profile hash is
              recorded in every assessment and export for auditability.
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[2px] font-mono mt-4 mb-2" style={{ color: 'var(--rc-text-dim)' }}>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--rc-border-subtle)' }}>
      <div>
        <div className="text-rc-xs font-mono" style={{ color: 'var(--rc-text-secondary)' }}>{label}</div>
        {hint && <div className="text-[10px]" style={{ color: 'var(--rc-text-dim)' }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function TableHeader() {
  return (
    <div className="flex items-center justify-end gap-2 pb-1">
      <span className="w-16 text-center text-[10px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>Female</span>
      <span className="w-16 text-center text-[10px] font-mono" style={{ color: 'var(--rc-text-dim)' }}>Male</span>
    </div>
  );
}
