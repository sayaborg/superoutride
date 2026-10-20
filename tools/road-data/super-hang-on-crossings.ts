/**
 * Where a level SUPER HANG-ON course passes over itself ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * its overlapping pairs of stations gathered into crossings, each the passages that overlaps join.
 */
import type { Crossing, Passage } from './outrun-profile.js';

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
