/**
 * Cubic Hermite interpolation between two values.
 * Produces smooth transitions with zero-derivative at endpoints.
 *
 * @param t - Interpolation factor [0, 1]
 * @param v0 - Value at t=0
 * @param v1 - Value at t=1
 * @returns Smoothly interpolated value
 */
export function cubicInterpolate(t: number, v0: number, v1: number): number {
  // Smoothstep: 3t² - 2t³
  const s = t * t * (3 - 2 * t);
  return v0 + (v1 - v0) * s;
}

/**
 * Compute angular scaling factor based on the vertex's radial angle.
 * Front (anterior) gets more expansion, back (posterior) gets less.
 *
 * @param angle - Radial angle in radians (0 = +X axis)
 * @param scale - Base combined scale factor
 * @returns Directionally-adjusted scale factor
 *
 * Convention:
 *  - Front (anterior, +Z): angle near π/2 → scale * 1.15
 *  - Back (posterior, -Z): angle near -π/2 → scale * 0.90
 *  - Lateral (±X): angle near 0 or π → scale * 1.00
 */
export function angularScale(angle: number, scale: number): number {
  // Map angle to a front-back factor using the Z component of the direction
  // sin(angle) gives the Z component: positive = front, negative = back
  const zComponent = Math.sin(angle);

  // Front multiplier: 1.15 at peak, Back: 0.90 at peak, Lateral: 1.00
  // Use smooth interpolation based on z-component
  let multiplier: number;
  if (zComponent >= 0) {
    // Front half: interpolate from 1.00 (lateral) to 1.15 (front)
    multiplier = 1.0 + 0.15 * zComponent;
  } else {
    // Back half: interpolate from 1.00 (lateral) to 0.90 (back)
    multiplier = 1.0 + 0.10 * zComponent; // zComponent is negative, so this reduces
  }

  return scale * multiplier;
}
