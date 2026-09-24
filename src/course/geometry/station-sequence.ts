// Metres: endpoint arithmetic/decimal conversion budget; 1 nm is about eight ulps at 10^6 m.
// Only normalizes station endpoints, never ownership or route progress.
const STATION_ENDPOINT_TOLERANCE_METERS = 1e-9;

/** Immutable ordered entries. Endpoint knots include L; piecewise-constant sections exclude it. */
export function compileStationSequence<T extends object, K extends keyof T>(
  entries: readonly T[],
  options: { length: number; chainage: K; endNode?: boolean },
): readonly Readonly<T>[] {
  const { length, chainage, endNode = false } = options;
  const copied = entries
    .map((entry) => ({ ...entry }))
    .sort((a, b) => (a[chainage] as number) - (b[chainage] as number));
  copied[0]![chainage] = 0 as T[K];
  if (endNode) copied.at(-1)![chainage] = length as T[K];
  return Object.freeze(copied.map((entry) => Object.freeze(entry)));
}

/** Last entry starting at or before s. The owning reader validates the open domain first. */
export function stationIndexAt<T, K extends keyof T>(entries: readonly T[], chainage: K, s: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((entries[mid]![chainage] as number) <= s) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

/** Station endpoint normalization; length is admitted by the compiler.
 * Plan sampling has a separate geometric tolerance. Never wraps. */
export function stationSequenceChainage(s: number, courseLength: number): number {
  if (Math.abs(s) <= STATION_ENDPOINT_TOLERANCE_METERS) return 0;
  if (Math.abs(s - courseLength) <= STATION_ENDPOINT_TOLERANCE_METERS) return courseLength;
  return s;
}
