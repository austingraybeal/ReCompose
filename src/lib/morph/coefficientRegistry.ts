/**
 * Research-mode coefficient overrides.
 *
 * A plain mutable module (not React state) so the per-frame deformation
 * and metric projection read it with zero overhead. The React coefficient
 * store writes through this registry and bumps a version for UI updates.
 *
 * EMPTY OVERRIDES = PUBLISHED MODEL, byte for byte. Every getter falls
 * back to the literature-calibrated defaults, so participant-facing
 * behavior is untouched unless an investigator explicitly tunes a value.
 */

export interface ArmOverride {
  upper_arm?: number;
  forearm?: number;
}

export interface CoefficientOverrides {
  /** Global sensitivity gain (published default 1.40). */
  gain?: number;
  /** Manual androidness in [0,1]; undefined = computed from sex + WHR. */
  androidness?: number;
  /** Per-ring sensitivity overrides, female / male tables. */
  ringFemale?: Record<string, number>;
  ringMale?: Record<string, number>;
  armFemale?: ArmOverride;
  armMale?: ArmOverride;
}

export const coefficientRegistry: { overrides: CoefficientOverrides } = {
  overrides: {},
};

export function setCoefficientOverrides(overrides: CoefficientOverrides): void {
  coefficientRegistry.overrides = overrides;
}

function isEmpty(o: CoefficientOverrides): boolean {
  return (
    o.gain === undefined &&
    o.androidness === undefined &&
    !Object.keys(o.ringFemale ?? {}).length &&
    !Object.keys(o.ringMale ?? {}).length &&
    !Object.keys(o.armFemale ?? {}).length &&
    !Object.keys(o.armMale ?? {}).length
  );
}

/**
 * Stable short hash of the active override set — 'default' when nothing
 * is overridden. Stamped into assessment records and exports so any
 * analysis can verify which model produced the data.
 */
export function coefficientProfileHash(
  overrides: CoefficientOverrides = coefficientRegistry.overrides,
): string {
  if (isEmpty(overrides)) return 'default';
  const flat = flatten(overrides as unknown as Record<string, unknown>);
  const stable = JSON.stringify(
    Object.fromEntries(Object.entries(flat).sort(([a], [b]) => a.localeCompare(b))),
  );
  let h = 5381;
  for (let i = 0; i < stable.length; i++) {
    h = ((h << 5) + h + stable.charCodeAt(i)) | 0;
  }
  return 'tuned-' + (h >>> 0).toString(16);
}

function flatten(o: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') {
      Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`));
    } else if (v !== undefined) {
      out[`${prefix}${k}`] = v;
    }
  }
  return out;
}
