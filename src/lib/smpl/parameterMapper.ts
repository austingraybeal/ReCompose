/**
 * Parameter Mapper — translates ReCompose UI values to SMPL beta parameters.
 *
 * SMPL betas are PCA coefficients in standard deviation units.
 * Typical human variation stays within beta ∈ [-3, +3].
 * beta[0] correlates strongly with overall body size/weight.
 *
 * The mapping must be conservative — even at 55% BF (extreme),
 * betas should stay within reasonable bounds to avoid alien shapes.
 */

import type { SegmentOverrides } from '@/types/scan';

/** Configuration for how UI values map to specific betas */
export interface BetaMappingConfig {
  /** Which beta index controls overall body mass/fat */
  massBetaIndex: number;
  /** Scale factor: how much beta changes per 1% body fat delta */
  massPerBfPercent: number;
  /** Maximum absolute beta value (clamp) */
  maxBeta: number;
  /** Optional per-segment beta mappings */
  segmentMappings?: {
    segmentId: string;
    betaIndex: number;
    scalePerPercent: number;
  }[];
}

/**
 * Default mapping for standard SMPL neutral model.
 *
 * These values are intentionally conservative. SMPL beta[0] corresponds
 * roughly to overall body size. A delta of ±30% BF should produce
 * visible but realistic changes, not extreme deformation.
 *
 * beta[0] ≈ 2.0 at the extreme should look like a large person,
 * not an alien. So 30% BF delta → beta ~2.0 means 0.065 per percent.
 */
export const DEFAULT_MAPPING: BetaMappingConfig = {
  massBetaIndex: 0,
  massPerBfPercent: 0.06,
  maxBeta: 3.0,
  segmentMappings: [
    // Segments add small contributions to beta[0] (body size)
    { segmentId: 'torso', betaIndex: 0, scalePerPercent: 0.015 },
    { segmentId: 'waist', betaIndex: 0, scalePerPercent: 0.02 },
    { segmentId: 'hips', betaIndex: 0, scalePerPercent: 0.012 },
    { segmentId: 'legs', betaIndex: 0, scalePerPercent: 0.008 },
    // Shoulders/arms contribute to beta[1] (proportions)
    { segmentId: 'shoulders', betaIndex: 1, scalePerPercent: 0.01 },
    { segmentId: 'arms', betaIndex: 1, scalePerPercent: 0.006 },
  ],
};

/**
 * Convert BF% delta and segment overrides into a SMPL beta vector.
 *
 * @param deltaBodyFat     - Change in body fat % from original
 * @param segmentOverrides - Per-segment slider values (-100 to +100)
 * @param componentCount   - Number of shape components (typically 10)
 * @param config           - Mapping configuration
 * @returns Float32Array of beta values (clamped to safe range)
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

  // Clamp all betas to safe range to prevent alien shapes
  for (let i = 0; i < componentCount; i++) {
    betas[i] = Math.max(-config.maxBeta, Math.min(config.maxBeta, betas[i]));
  }

  return betas;
}

/**
 * Estimate body fat % from a beta vector (inverse mapping).
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
