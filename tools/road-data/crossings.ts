/**
 * Where a road passes over itself ([Original road data](../../docs/original-road-data.md#profile)): whether two of its
 * cells overlap, and its overlapping pairs of stations gathered into crossings, each the passages that overlaps join.
 */
import type { Crossing, Passage } from './road-profile.js';

/**
 * The crossings of overlapping pairs of stations `pairs`, each earlier then later: a passage is a run of the stations
 * taking part, broken where more than `gap` metres open between two; passages that overlap, directly or through others,
 * make one crossing. Crossings come in the order of their first passages.
 */
export function crossingsOf(pairs: readonly (readonly [number, number])[], gap: number): Crossing[] {
  const passages: Passage[] = [];
  for (const s of [...new Set(pairs.flat())].sort((a, b) => a - b)) {
    const last = passages.at(-1);
    if (last && s - last.to <= gap) passages[passages.length - 1] = { from: last.from, to: s };
    else passages.push({ from: s, to: s });
  }
  const passageOf = (s: number) => passages.findIndex((p) => s >= p.from && s <= p.to);
  const root = passages.map((_, k) => k);
  const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k]!)));
  for (const [a, b] of pairs) root[find(passageOf(a))] = find(passageOf(b));
  const members = new Map<number, number[]>();
  passages.forEach((_, k) => members.set(find(k), [...(members.get(find(k)) ?? []), k]));
  return [...members.values()].map((ks) => ({
    passages: ks.map((k) => passages[k]!),
    pairs: pairs.filter(([a]) => ks.includes(passageOf(a))),
  }));
}

/** Whether two convex polygons overlap: no edge of either separates them by more than `margin`. */
export function overlap(
  a: readonly (readonly [number, number])[],
  b: readonly (readonly [number, number])[],
  margin = 0,
): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i]!,
        [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const [nx, ny] = [y0 - y1, x1 - x0];
      const norm = Math.hypot(nx, ny) || 1;
      const span = (q: readonly (readonly [number, number])[]) => q.map(([x, y]) => (nx * x + ny * y) / norm);
      const [pa, pb] = [span(a), span(b)];
      if (Math.max(...pa) + margin <= Math.min(...pb) || Math.max(...pb) + margin <= Math.min(...pa)) return false;
    }
  return true;
}
