/**
 * A SUPER HANG-ON course's road path P laid in the world ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * its straights and arcs one after another from the course's entry, the plane the centre lane runs on (P laid off a
 * fixed distance to its left, so again straights and arcs), and each road position's station on the plane.
 */

/** A pose: metres, heading in radians counterclockwise from +x. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** An element of P from `start` (metres along P): a straight, or an arc turning `turn` radians (left positive). */
export interface PathElement {
  readonly start: number;
  readonly length: number;
  readonly turn: number;
}

/**
 * P and its plane: P's elements from the entry, facing +y; the plane `offset` metres left of P, where an arc turning
 * left (its inside) is shorter and one turning right longer by the offset times the turn.
 */
export class CoursePath {
  readonly length: number;
  /** Each element's station on the plane where it starts, and the plane's length. */
  private readonly stations: readonly number[];
  readonly planeLength: number;
  private readonly poses: readonly Pose[];
  constructor(
    readonly elements: readonly PathElement[],
    readonly offset: number,
  ) {
    const last = elements.at(-1)!;
    this.length = last.start + last.length;
    const stations = [0];
    const poses: Pose[] = [{ x: 0, y: 0, heading: Math.PI / 2 }];
    for (const e of elements) {
      stations.push(stations.at(-1)! + this.planeScale(e) * e.length);
      poses.push(advance(poses.at(-1)!, e, e.length));
    }
    this.stations = stations;
    this.planeLength = stations.at(-1)!;
    this.poses = poses;
  }

  /** How much longer the plane is than P along `e`. */
  planeScale(e: PathElement): number {
    return 1 - (this.offset * e.turn) / e.length;
  }

  /** The element holding `u` metres along P (the later at a joint), and its index. */
  private at(u: number): { e: PathElement; k: number } {
    let [lo, hi] = [0, this.elements.length - 1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.elements[mid]!.start <= u) lo = mid;
      else hi = mid - 1;
    }
    return { e: this.elements[lo]!, k: lo };
  }

  /** The station on the plane across from `u` metres along P. */
  station(u: number): number {
    const { e, k } = this.at(u);
    return this.stations[k]! + this.planeScale(e) * (u - e.start);
  }

  /** The metres along P across from station `s`. */
  along(s: number): number {
    let [lo, hi] = [0, this.elements.length - 1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.stations[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    const e = this.elements[lo]!;
    return e.start + (s - this.stations[lo]!) / this.planeScale(e);
  }

  /** P's pose `u` metres along it. */
  pose(u: number): Pose {
    const { e, k } = this.at(u);
    return advance(this.poses[k]!, e, u - e.start);
  }

  /** The point `lateral` metres right of P `u` metres along it. */
  aside(u: number, lateral: number): Pose {
    const p = this.pose(u);
    return { x: p.x + lateral * Math.sin(p.heading), y: p.y - lateral * Math.cos(p.heading), heading: p.heading };
  }
}

/** The pose `d` metres along `e` from `pose`. */
function advance(pose: Pose, e: PathElement, d: number): Pose {
  if (e.turn === 0)
    return { x: pose.x + d * Math.cos(pose.heading), y: pose.y + d * Math.sin(pose.heading), heading: pose.heading };
  const k = e.turn / e.length;
  return {
    x: pose.x + (Math.sin(pose.heading + k * d) - Math.sin(pose.heading)) / k,
    y: pose.y + (Math.cos(pose.heading) - Math.cos(pose.heading + k * d)) / k,
    heading: pose.heading + k * d,
  };
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
 * The pairs of P's cells (`step` metres each, from `from` to `to` metres along P), at least `apart` metres apart along P,
 * whose cross-sections, `left` and `right` metres either side of P, overlap: each pair's cells' starts.
 */
export function overlappingCells(
  path: CoursePath,
  options: {
    readonly from: number;
    readonly to: number;
    readonly step: number;
    readonly left: number;
    readonly right: number;
    readonly apart: number;
    readonly margin?: number;
  },
): [number, number][] {
  const { from, to, step, left, right, apart } = options;
  const n = Math.max(1, Math.ceil((to - from) / step - 1e-9));
  const at = (i: number) => Math.min(to, from + i * step);
  const edges = Array.from({ length: n + 1 }, (_, i) => {
    const [l, r] = [path.aside(at(i), -left), path.aside(at(i), right)];
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
