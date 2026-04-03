/**
 * Validate that the uploaded files are complete and well-formed.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateOBJContent(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!text.trim()) {
    errors.push('OBJ file is empty');
    return { valid: false, errors, warnings };
  }

  const hasVertices = /^v\s+/m.test(text);
  const hasFaces = /^f\s+/m.test(text);

  if (!hasVertices) errors.push('OBJ file contains no vertex data');
  if (!hasFaces) warnings.push('OBJ file contains no face data (point cloud only)');

  return { valid: errors.length === 0, errors, warnings };
}

export function validateCoreMeasuresCSV(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!text.trim()) {
    errors.push('Core Measures CSV is empty');
    return { valid: false, errors, warnings };
  }

  const lower = text.toLowerCase();
  if (!lower.includes('type') || !lower.includes('name')) {
    errors.push('Core Measures CSV missing required headers (type, name)');
  }

  if (!lower.includes('landmark')) {
    warnings.push('No landmark rows detected in Core Measures CSV');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateBodyCompCSV(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!text.trim()) {
    errors.push('Body Composition CSV is empty');
    return { valid: false, errors, warnings };
  }

  const lower = text.toLowerCase();
  if (!lower.includes('bodyfat') && !lower.includes('bf%') && !lower.includes('body_fat')) {
    warnings.push('Body fat percentage not found in Body Composition CSV');
  }

  return { valid: errors.length === 0, errors, warnings };
}
