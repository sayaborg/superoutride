import type { Vec2 } from './math.js';

export function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

export function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and > 0`);
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
