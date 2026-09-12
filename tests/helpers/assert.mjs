import assert from 'node:assert/strict';

/** Keep each scenario's original tolerance, scale and strictness explicit at the call site. */
export function near(actual, expected, tolerance, { relative = false, exclusive = false } = {}) {
  assert.ok(Number.isFinite(tolerance) && tolerance >= 0, 'an explicit finite nonnegative tolerance is required');
  const bound = tolerance * (relative ? Math.max(1, Math.abs(expected)) : 1);
  const error = Math.abs(actual - expected);
  assert.ok(exclusive ? error < bound : error <= bound, `${actual} != ${expected} ± ${bound}`);
}

export const deg = (degrees) => (degrees * Math.PI) / 180;
