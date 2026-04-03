/**
 * Parameter Mapper — translates ReCompose UI values to SMPL beta parameters.
 *
 * SMPL's first few shape components roughly correspond to:
 *   beta[0] — overall body size / weight (strongly correlated with BMI)
 *   beta[1] — height (taller/shorter)
 *   beta[2] — body proportions (limb length vs torso)
 *   beta[3+] — finer shape details
 *
 * This mapper uses a configurable mapping table so different SMPL model
 * extractions can define their own beta semantics. The default mapping
 * is based on the standard SMPL neutral model trained on CAESAR data,
 * where beta[0] correlates most strongly with body mass/fat.
 *
 * The mapping can be refined by fitting a linear regression from
 * (BF%, segment measurements) → betas on a dataset of scans with
 * known body composition. For now we use an analytical approximation.
 */

import type { SegmentOverrides } from '@/types/scan';

/** Configuration for how UI values map to specific betas */
export interface BetaMappingConfig {
  /** Which beta index controls overall body mass/fat */
  massBetaIndex: number;
  /** Scale factor: how much beta changes per 1% body fat delta */
  massPerBfPercent: number;
  /** Optional per-segment beta mappings */
  segmentMappings?: {
    segmentId: string;
    betaIndex: number;
    /** Scale: how much beta changes per 1% segment override */
    scalePerPercent: number;
  }[];
}

/**
 * Default mapping for standard SMPL neutral model.
 * These values are approximate and should be calibrated against
 * real scan data for clinical use.
 */
export const DEFAULT_MAPPING: BetaMappingConfig = {
  massBetaIndex: 0,
  massPerBfPercent: 0.15,
  segmentMappings: [
    { segmentId: 'torso', betaIndex: 0, scalePerPercent: 0.08 },
    { segmentId: 'waist', betaIndex: 0, scalePerPercent: 0.10 },
    { segmentId: 'hips', betaIndex: 0, scalePerPercent: 0.06 },
    { segmentId: 'shoulders', betaIndex: 3, scalePerPercent: 0.05 },
    { segmentId: 'arms', betaIndex: 3, scalePerPercent: 0.03 },
    { segmentId: 'legs', betaIndex: 0, scalePerPercent: 0.04 },
  ],
};

/**
 * Convert BF% delta and segment overrides into a SMPL beta vector.
 *
 * @param deltaBodyFat     - Change in body fat % from original
 * @param segmentOverrides - Per-segment slider values (-100 to +100)
 * @param componentCount   - Number of shape components (typically 10)
 * @param config           - Mapping configuration
 * @returns Float32Array of beta values
 */
export function mapToBetas(
  deltaBodyFat: number,
  segmentOverrides: SegmentOverrides,
  componentCount: number,
  config: BetaMappingConfig = DEFAULT_MAPPING
): Float32Array {
  const betas = new Float32Array(componentCount);

  // Global body fat → primary mass beta
  betas[config.massBetaIndex] += deltaBodyFat * config.massPerBfPercent;

  // Segment overrides → additional beta contributions
  if (config.segmentMappings) {
    for (const mapping of config.segmentMappings) {
      const override = segmentOverrides[mapping.segmentId as keyof SegmentOverrides] ?? 0;
      if (Math.abs(override) > 0.01) {
        betas[mapping.betaIndex] += override * mapping.scalePerPercent;
      }
    }
  }

  return betas;
}

/**
 * Estimate body fat % from a beta vector (inverse mapping).
 * Useful for displaying estimated BF% when user manipulates betas directly.
 */
export function estimateBfFromBetas(
  betas: Float32Array,
  originalBodyFat: number,
  config: BetaMappingConfig = DEFAULT_MAPPING
): number {
  const massBeta = betas[config.massBetaIndex] ?? 0;
  const delta = massBeta / config.massPerBfPercent;
  return originalBodyFat + delta;
}
