// In the compared selector's units (radians, rate/s or scalar): absolute UI equality budget.
// 10^-12 covers conversion roundoff for current O(1..100) choices, far below their spacing.
const SELECTOR_VALUE_TOLERANCE = 1e-12;

/** Presentation equality only; never used for mechanics or coordinate decisions. */
export function sameSelectorValue(a: number, b: number): boolean {
  return Math.abs(a - b) < SELECTOR_VALUE_TOLERANCE;
}
