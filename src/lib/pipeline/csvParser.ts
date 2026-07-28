import Papa from 'papaparse';
import type { LandmarkPoint, MeasureMap, BodyComposition } from '@/types/scan';

interface CoreMeasureRow {
  type: string;
  enum: string;
  name: string;
  valid: string;
  'value (metric)': string;
  'x (mm)': string;
  'y (mm)': string;
  'z (mm)': string;
}

interface BodyCompRow {
  name: string;
  value: string;
}

/**
 * Parse a Core Measures CSV file.
 * Extracts measure rows (name → value) and landmark rows (name → {x,y,z}).
 */
export function parseCoreMeasuresCSV(csvText: string): {
  measures: MeasureMap;
  landmarks: Record<string, LandmarkPoint>;
} {
  const result = Papa.parse<CoreMeasureRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const measures: MeasureMap = {};
  const landmarks: Record<string, LandmarkPoint> = {};

  for (const row of result.data) {
    const name = row.name?.trim();
    if (!name) continue;

    if (row.type?.trim().toLowerCase() === 'measure') {
      const val = parseFloat(row['value (metric)']);
      if (!isNaN(val)) {
        measures[name] = val;
      }
    } else if (row.type?.trim().toLowerCase() === 'landmark') {
      const x = parseFloat(row['x (mm)']);
      const y = parseFloat(row['y (mm)']);
      const z = parseFloat(row['z (mm)']);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        landmarks[name] = { x, y, z };
      }
    }
  }

  return { measures, landmarks };
}

/**
 * Parse a Body Composition CSV file.
 * Returns structured body composition data.
 */
export function parseBodyCompositionCSV(csvText: string): BodyComposition {
  const result = Papa.parse<BodyCompRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const raw: Record<string, number> = {};
  for (const row of result.data) {
    const name = row.name?.trim();
    const val = parseFloat(row.value);
    if (name && !isNaN(val)) {
      raw[name] = val;
    }
  }

  const weight = raw['Weight'] ?? raw['TotalWeight'] ?? 0;

  // Scanner exports name this key "BodyMassIndex" (legacy exports used "BMI").
  // If neither is present, derive from weight + height. Scanner units are
  // imperial: weight in lbs, height in inches when < 100 (a metric-cm export
  // would read 100–250).
  let bmi = raw['BMI'] ?? raw['BodyMassIndex'] ?? 0;
  const height = raw['Height'] ?? 0;
  if (bmi <= 0 && weight > 0 && height > 0) {
    const heightIn = height < 100 ? height : height / 2.54;
    bmi = (703 * weight) / (heightIn * heightIn);
  }

  return {
    bodyFat: raw['BodyFat'] ?? raw['BodyFatPercentage'] ?? raw['BF%'] ?? 0,
    bmi,
    weight,
    leanBodyMass: raw['LeanBodyMass'] ?? raw['LBM'] ?? 0,
    waistToHipRatio: raw['WaistToHipRatio'] ?? raw['WHR'] ?? 0,
    ...raw,
  };
}
