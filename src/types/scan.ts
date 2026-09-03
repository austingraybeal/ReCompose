import type { BufferGeometry } from 'three';

/** A single 3D landmark point */
export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

/** A cross-section ring with 4 cardinal landmarks */
export interface LandmarkRing {
  name: string;
  front: LandmarkPoint;
  back: LandmarkPoint;
  left: LandmarkPoint;
  right: LandmarkPoint;
  center: LandmarkPoint;
  height: number;
  radius: { front: number; back: number; left: number; right: number };
}

/** Parsed body measurements (name → numeric value) */
export type MeasureMap = Record<string, number>;

/** Parsed body composition metrics */
export interface BodyComposition {
  bodyFat: number;
  bmi: number;
  weight: number;
  leanBodyMass: number;
  waistToHipRatio: number;
  [key: string]: number;
}

/** Per-vertex classification data computed at load time */
export interface VertexBinding {
  segmentId: SegmentId;
  /** For arm vertices, which side of the body the vertex belongs to. */
  armSide?: 'left' | 'right';
  /**
   * Continuous arm weight (0 = body, 1 = arm), seeded from the lateral
   * envelope and diffused over the mesh graph at load time.
   */
  armness?: number;
  /**
   * Scan-bridge sliver vertex (e.g. armpit webbing spanning an air gap).
   * The engine re-settles these to their neighbor average each frame.
   */
  seamPinned?: boolean;
  ringAboveIdx: number;
  ringBelowIdx: number;
  /** 0 = at ringBelow, 1 = at ringAbove */
  ringWeight: number;
  radialAngle: number;
  radialDistance: number;
  /** For transition zone vertices: weight toward adjacent segment (0 = fully this segment) */
  blendWeight: number;
  blendSegmentId: SegmentId | null;
}

/** Full parsed scan data */
export interface ScanData {
  geometry: BufferGeometry;
  originalPositions: Float32Array;
  measures: MeasureMap;
  landmarks: Record<string, LandmarkPoint>;
  rings: LandmarkRing[];
  bodyComp: BodyComposition;
  vertexBindings: VertexBinding[];
  armThreshold: number;
  /** Per-vertex adjacency list (indices of connected neighbors) */
  adjacency: Uint32Array[];
}

/** The eight body segment IDs (arms split into upper_arms/forearms; legs split into thighs/calves). */
export type SegmentId =
  | 'shoulders'
  | 'upper_arms'
  | 'forearms'
  | 'torso'
  | 'waist'
  | 'hips'
  | 'thighs'
  | 'calves';

/** Segment override values */
export type SegmentOverrides = Record<SegmentId, number>;

/** Camera preset names */
export type CameraPreset = 'front' | 'side' | 'back' | 'quarter';

/** Projected metrics displayed in the metrics panel */
export interface ProjectedMetrics {
  weight: number;
  bmi: number;
  /** Current body fat % (the value the global slider implies). */
  bodyFat: number;
  /** Standing height in cm — fixed per scan, never scales. */
  heightCm: number;
  /** Fat mass in lbs: weight x (bodyFat / 100). */
  fatMassLb: number;
  /** Fat-free mass in lbs: weight - fat mass. */
  fatFreeMassLb: number;
  waistCirc: number;
  hipCirc: number;
  whr: number;
  /** Waist-to-height ratio: projected waist / fixed height (both cm). */
  whtr: number;
  /** Per-segment circumferences (cm, right side by default; 0 = not in scan) */
  shoulderCirc: number;
  /** Torso volume in liters (0 = not in scan). Scales with circumference squared. */
  torsoVolumeL: number;
  chestCirc: number;
  bicepCirc: number;
  forearmCirc: number;
  thighCirc: number;
  calfCirc: number;
}
