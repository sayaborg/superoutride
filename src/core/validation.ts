import type { Vec2 } from './math.js';

export function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

export function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and > 0`);
}

export function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
}

export function nonEmptyId(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new RangeError(`${label} must be a non-empty string`);
}

export function finitePoint(point: Vec2, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new RangeError(`${label} must be finite`);
  }
}

/** Validate and register one key while composing a collection. */
export function uniqueKey(keys: Set<string>, key: string, label: string): void {
  nonEmptyId(key, label);
  if (keys.has(key)) throw new RangeError(`duplicate ${label}: ${key}`);
  keys.add(key);
}
