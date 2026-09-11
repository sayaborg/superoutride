import { SOURCE_ENDPOINT_TOLERANCE_METERS } from './tolerances.js';

import { finite, positiveFinite } from './validation.js';

/** Immutable ordered source entries. Height nodes include L; constant sections exclude it. */
export function compileOpenProfile<T extends object, K extends keyof T>(
  entries: readonly T[],
  options: { length: number; chainage: K; label: string; endNode?: boolean },
): readonly Readonly<T>[] {
  const { length, chainage, label, endNode = false } = options;
  positiveFinite(length, `${label} length`);
  for (const entry of entries) finite(entry[chainage] as number, `${label} chainage`);
  const copied = entries
    .map((entry) => ({ ...entry }))
    .sort((a, b) => (a[chainage] as number) - (b[chainage] as number));
  if (copied.length < (endNode ? 2 : 1))
    throw new Error(`${label} requires ${endNode ? 'at least two nodes' : 'at least one section'}`);
  if (Math.abs(copied[0]![chainage] as number) > SOURCE_ENDPOINT_TOLERANCE_METERS) {
    throw new Error(`${label} must start at s=0`);
  }
  copied[0]![chainage] = 0 as T[K];
  if (endNode) {
    if (Math.abs((copied.at(-1)![chainage] as number) - length) > SOURCE_ENDPOINT_TOLERANCE_METERS) {
      throw new Error(`${label} must end at courseLength`);
    }
    copied.at(-1)![chainage] = length as T[K];
  }
  for (let i = 0; i < copied.length; i += 1) {
    const s = copied[i]![chainage] as number;
    if (s < 0 || s > length || (!endNode && s === length)) {
      throw new RangeError(`${label} entry outside open profile`);
    }
    if (i > 0 && s <= (copied[i - 1]![chainage] as number)) {
      throw new Error(`${label} entries must be unique`);
    }
  }
  return Object.freeze(copied.map((entry) => Object.freeze(entry)));
}

/** Last entry starting at or before s. The owning reader validates the open domain first. */
export function profileIndexAt<T, K extends keyof T>(entries: readonly T[], chainage: K, s: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((entries[mid]![chainage] as number) <= s) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

/** Source-profile endpoint normalization; length is validated by the owning source constructor.
 * Raster/Guide sampling has a separate geometric tolerance. Never wraps. */
export function openProfileChainage(s: number, courseLength: number, label: string): number {
  if (!Number.isFinite(s)) throw new RangeError(`${label} chainage must be finite`);
  if (s < -SOURCE_ENDPOINT_TOLERANCE_METERS || s > courseLength + SOURCE_ENDPOINT_TOLERANCE_METERS) {
    throw new RangeError(`${label} chainage is outside [0, courseLength]`);
  }
  if (Math.abs(s) <= SOURCE_ENDPOINT_TOLERANCE_METERS) return 0;
  if (Math.abs(s - courseLength) <= SOURCE_ENDPOINT_TOLERANCE_METERS) return courseLength;
  return s;
}
