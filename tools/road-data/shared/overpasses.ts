/**
 * Where a road passes over itself ([Original road data](../../../docs/original-road-data.md#profile)): its cells, which
 * of them overlap, and what stands on another passage, whether two convex polygons overlap, and where a plan crosses
 * itself.
 */
import { CoursePath, type PathPiece } from './course-path.js';
import { PASSAGES_APART } from './shared-constants.js';

/** The side of the squares a road's cells are found by, metres. */
const SQUARE = 50;

/** Whether two convex polygons overlap, a point or a segment among them: no edge of either separates them. */
function overlap(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i]!,
        [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const [nx, ny] = [y0 - y1, x1 - x0];
      if (nx === 0 && ny === 0) continue;
      const span = (q: readonly (readonly [number, number])[]) => q.map(([x, y]) => nx * x + ny * y);
      const [pa, pb] = [span(a), span(b)];
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

type Point = readonly [number, number];

/** A road's cells, which of them overlap, and what stands on another passage. */
export interface RoadCells {
  /** The pairs of cells at least `PASSAGES_APART` apart along the line that overlap: each pair's cells' starts. */
  readonly pairs: readonly (readonly [number, number])[];
  /**
   * Whether the stretch across the road `half` metres either side of the point `lateral` metres right of the line at
   * `u` overlaps a cell starting at least `PASSAGES_APART` from `u` along the line.
   */
  onOtherPassage(u: number, lateral: number, half: number): boolean;
}

/**
 * A road's cells, `step` each from `from` to `to` along its line, in the line's measure, each its cross-sections,
 * `sides(u)` metres left and right of the line, between a step and the next. `aside(u, lateral)` is the point `lateral`
 * metres right of the line at `u`.
 */
export function roadCells(
  line: { aside(u: number, lateral: number): { readonly x: number; readonly y: number } },
  options: {
    readonly from: number;
    readonly to: number;
    readonly step: number;
    readonly sides: (u: number) => readonly [number, number];
  },
): RoadCells {
  const { from, to, step } = options;
  const n = Math.max(1, Math.ceil((to - from) / step - 1e-9));
  const at = (i: number) => Math.min(to, from + i * step);
  const point = (u: number, lateral: number): Point => {
    const p = line.aside(u, lateral);
    return [p.x, p.y];
  };
  const edges = Array.from({ length: n + 1 }, (_, i) => {
    const [left, right] = options.sides(at(i));
    return [point(at(i), -left), point(at(i), right)] as const;
  });
  const cells = Array.from({ length: n }, (_, i) => [edges[i]![0], edges[i]![1], edges[i + 1]![1], edges[i + 1]![0]]);
  const keys = (shape: readonly Point[]) => {
    const xs = shape.map(([x]) => Math.floor(x / SQUARE)),
      ys = shape.map(([, y]) => Math.floor(y / SQUARE));
    const out: string[] = [];
    for (let i = Math.min(...xs); i <= Math.max(...xs); i++)
      for (let j = Math.min(...ys); j <= Math.max(...ys); j++) out.push(`${i},${j}`);
    return out;
  };
  const grid = new Map<string, number[]>();
  cells.forEach((cell, i) => {
    for (const key of keys(cell)) grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  cells.forEach((cell, i) => {
    for (const key of keys(cell))
      for (const j of grid.get(key)!) {
        if (at(j) - at(i) < PASSAGES_APART || seen.has(i * n + j)) continue;
        seen.add(i * n + j);
        if (overlap(cell, cells[j]!)) pairs.push([at(i), at(j)]);
      }
  });
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    pairs,
    onOtherPassage(u, lateral, half) {
      const stretch = [point(u, lateral - half), point(u, lateral + half)];
      return keys(stretch).some((key) =>
        (grid.get(key) ?? []).some((j) => Math.abs(at(j) - u) >= PASSAGES_APART && overlap(stretch, cells[j]!)),
      );
    },
  };
}

/** Where two passages of a course cross: their stations, metres along it, the first the nearer its start. */
export type Crossing = readonly [number, number];

/**
 * Where the plan `pieces` crosses itself up to `to` metres: each pair of its line's stretches `step` metres long at least
 * `PASSAGES_APART` apart along it that meet, their meeting point's stations, a crossing found in two neighbouring
 * stretches once.
 */
export function crossings(pieces: readonly PathPiece[], to: number, step: number): Crossing[] {
  const path = new CoursePath(pieces);
  const cells = roadCells(path, { from: 0, to, step, sides: () => [0, 0] });
  const out: [number, number][] = [];
  for (const [a, b] of cells.pairs) {
    const p = [path.aside(a, 0), path.aside(Math.min(to, a + step), 0)];
    const q = [path.aside(b, 0), path.aside(Math.min(to, b + step), 0)];
    const [dx, dy, ex, ey] = [p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y, q[1]!.x - q[0]!.x, q[1]!.y - q[0]!.y];
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    const [fx, fy] = [q[0]!.x - p[0]!.x, q[0]!.y - p[0]!.y];
    const t = (fx * ey - fy * ex) / den,
      v = (fx * dy - fy * dx) / den;
    if (t < 0 || t > 1 || v < 0 || v > 1) continue;
    const c: [number, number] = [a + t * step, b + v * step];
    if (!out.some((o) => Math.abs(o[0] - c[0]) < step && Math.abs(o[1] - c[1]) < step)) out.push(c);
  }
  return out;
}
