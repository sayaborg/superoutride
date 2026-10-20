/**
 * Where a road passes over itself ([Original road data](../../docs/original-road-data.md#profile)): its cells that
 * overlap, whether two cells do, and its overlapping pairs of stations gathered into crossings, each the passages that
 * overlaps join.
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

/**
 * The pairs of a road's cells (`step` each, from `from` to `to` along its line, in the line's measure), at least `apart`
 * apart along it, whose cross-sections, `sides(u)` metres left and right of the line, overlap (by more than `margin`):
 * each pair's cells' starts. `aside(u, lateral)` is the point `lateral` metres right of the line at `u`.
 */
export function overlappingCells(
  line: { aside(u: number, lateral: number): { readonly x: number; readonly y: number } },
  options: {
    readonly from: number;
    readonly to: number;
    readonly step: number;
    readonly sides: (u: number) => readonly [number, number];
    readonly apart: number;
    readonly margin?: number;
  },
): [number, number][] {
  const { from, to, step, apart } = options;
  const n = Math.max(1, Math.ceil((to - from) / step - 1e-9));
  const at = (i: number) => Math.min(to, from + i * step);
  const edges = Array.from({ length: n + 1 }, (_, i) => {
    const [left, right] = options.sides(at(i));
    const [l, r] = [line.aside(at(i), -left), line.aside(at(i), right)];
    return [
      [l.x, l.y],
      [r.x, r.y],
    ] as const;
  });
  const cells = Array.from({ length: n }, (_, i) => [edges[i]![0], edges[i]![1], edges[i + 1]![1], edges[i + 1]![0]]);
  const SQUARE = 50;
  const keys = (cell: readonly (readonly [number, number])[]) => {
    const xs = cell.map(([x]) => Math.floor(x / SQUARE)),
      ys = cell.map(([, y]) => Math.floor(y / SQUARE));
    const out: string[] = [];
    for (let i = Math.min(...xs); i <= Math.max(...xs); i++)
      for (let j = Math.min(...ys); j <= Math.max(...ys); j++) out.push(`${i},${j}`);
    return out;
  };
  const grid = new Map<string, number[]>();
  cells.forEach((cell, i) => {
    for (const key of keys(cell)) grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  const pairs = new Set<number>();
  const out: [number, number][] = [];
  cells.forEach((cell, i) => {
    for (const key of keys(cell))
      for (const j of grid.get(key)!) {
        if (at(j) - at(i) < apart || pairs.has(i * n + j)) continue;
        pairs.add(i * n + j);
        if (overlap(cell, cells[j]!, options.margin ?? 0)) out.push([at(i), at(j)]);
      }
  });
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
