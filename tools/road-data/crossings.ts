/**
 * Where a road passes over itself ([Original road data](../../docs/original-road-data.md#profile)): its cells, which
 * of them overlap and what stands on another passage, whether two convex polygons overlap, its overlapping pairs of
 * stations gathered into crossings, each the passages that overlaps join, and the crossings parted by the least change.
 */
import { bendOf, profileOf, type Change, type Kink } from './road-profile.js';
import { CLEARANCE, GRADE_LIMIT, PASSAGE_GAP, PASSAGES_APART } from './shared-constants.js';

/** The side of the squares a road's cells are found by, metres. */
const SQUARE = 50;
/** Passages whose heights differ by no more than this over their pairs are level: a micrometre, as heights are written. */
const LEVEL = 1e-6;

/** A stretch of road stations where a road passes over or under itself: its first and last overlapping stations. */
export interface Passage {
  readonly from: number;
  readonly to: number;
}

/**
 * Where a plan passes over itself: its passages, apart and in running order, and the pairs of their stations whose
 * roads overlap, each pair's earlier station first.
 */
export interface Crossing {
  readonly passages: readonly Passage[];
  readonly pairs: readonly (readonly [number, number])[];
}

/**
 * The crossings of overlapping pairs of stations `pairs`, each earlier then later, of cells `step` metres long: a
 * passage is a run of the stations taking part, broken where more than `PASSAGE_GAP` cells open between two; passages
 * that overlap, directly or through others, make one crossing. Crossings come in the order of their first passages.
 */
export function crossingsOf(pairs: readonly (readonly [number, number])[], step: number): Crossing[] {
  const passages: Passage[] = [];
  for (const s of [...new Set(pairs.flat())].sort((a, b) => a - b)) {
    const last = passages.at(-1);
    if (last && s - last.to <= PASSAGE_GAP * step) passages[passages.length - 1] = { from: last.from, to: s };
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

/** How a crossing was parted: each passage's rise, and its passages' least height apart after and before, metres. */
export interface Parting {
  readonly rises: readonly number[];
  readonly apart: number;
  /** How far apart the heights before it left the passages at their nearest pair, metres. */
  readonly raw: number;
}

/** That passage node `to` rises at least `least` metres more than node `from`. */
interface Order {
  readonly from: number;
  readonly to: number;
  readonly least: number;
}

/** A stretch of road from node `from` to node `to`, `length` metres long, that a ramp may change the rises over. */
interface Stretch {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

/**
 * The most a ramp over `length` metres, level at both ends and no steeper than `GRADE_LIMIT`, rises at `curvature`:
 * two vertical curves of that curvature, and between them, where the limit holds the grade, a tangent at it.
 */
const rampRise = (length: number, curvature: number) =>
  curvature * length <= 2 * GRADE_LIMIT
    ? (curvature * length * length) / 4
    : GRADE_LIMIT * (length - GRADE_LIMIT / curvature);

/** The least curvature of a ramp over `length` metres rising `rise` (`rampRise`'s inverse; Infinity past its most). */
const rampCurvature = (length: number, rise: number) => {
  const r = Math.abs(rise);
  if (r <= (GRADE_LIMIT * length) / 2) return (4 * r) / (length * length);
  return r < GRADE_LIMIT * length ? (GRADE_LIMIT * GRADE_LIMIT) / (GRADE_LIMIT * length - r) : Infinity;
};

/**
 * The rises of nodes 1 to `n` (node 0 the road's ends, held at 0) that keep `orders` with the least largest curvature
 * over `stretches`, then the largest of the stretches left, and so on: each round finds the cycle of stretches and
 * orders needing the largest curvature (Dinkelbach's iteration over Bellman and Ford's negative cycles) and fixes its
 * stretches' changes there, as every least change holds them; the stretches no cycle needs stay level.
 */
function leastRises(n: number, stretches: readonly Stretch[], orders: readonly Order[]): number[] {
  const fixed: (number | null)[] = stretches.map((t) => (t.length > 0 ? null : 0));
  // A rise x[v] ≤ x[u] + weight(curvature) for each edge u → v.
  const edges = [
    ...stretches.flatMap((t, k) => [
      { u: t.from, v: t.to, stretch: k, sign: 1, least: 0 },
      { u: t.to, v: t.from, stretch: k, sign: -1, least: 0 },
    ]),
    ...orders.map((o) => ({ u: o.to, v: o.from, stretch: -1, sign: 0, least: o.least })),
  ];
  type Edge = (typeof edges)[number];
  const free = (e: Edge) => e.stretch >= 0 && fixed[e.stretch] === null;
  const weight = (e: Edge, curvature: number) =>
    e.stretch < 0 ? -e.least : free(e) ? rampRise(stretches[e.stretch]!.length, curvature) : e.sign * fixed[e.stretch]!;
  const negativeCycle = (curvature: number) => {
    const distance = new Array<number>(n + 1).fill(0);
    const before = new Array<number>(n + 1).fill(-1);
    let last = -1;
    for (let i = 0; i <= n; i++) {
      last = -1;
      edges.forEach((e, k) => {
        const w = weight(e, curvature);
        if (distance[e.u]! + w < distance[e.v]! - 1e-9) {
          distance[e.v] = distance[e.u]! + w;
          before[e.v] = k;
          last = e.v;
        }
      });
      if (last < 0) return null;
    }
    let v = last;
    for (let i = 0; i <= n; i++) v = edges[before[v]!]!.u;
    const cycle: Edge[] = [];
    for (let u = v; ;) {
      const e = edges[before[u]!]!;
      cycle.push(e);
      u = e.u;
      if (u === v) break;
    }
    return cycle;
  };
  // The least curvature at which `cycle` is not negative, its weight rising with the curvature, by bisection.
  const root = (cycle: readonly Edge[], from: number) => {
    const total = (curvature: number) => cycle.reduce((sum, e) => sum + weight(e, curvature), 0);
    const most = cycle.reduce(
      (sum, e) => sum + (free(e) ? GRADE_LIMIT * stretches[e.stretch]!.length : weight(e, 0)),
      0,
    );
    if (most <= 1e-9) throw new Error('Crossings the road cannot part within the grade limit');
    let [low, high] = [from, Math.max(from, 1e-9)];
    while (total(high) < 0) high *= 2;
    for (let i = 0; i < 200 && high - low > 1e-15 * high; i++) {
      const middle = (low + high) / 2;
      if (total(middle) < 0) low = middle;
      else high = middle;
    }
    return high;
  };
  for (;;) {
    let curvature = 0;
    let critical: Edge[] | null = null;
    for (let cycle = negativeCycle(curvature); cycle; cycle = negativeCycle(curvature)) {
      const next = root(cycle, curvature);
      if (!(next > curvature)) break;
      [curvature, critical] = [next, cycle];
    }
    if (!critical) break;
    for (const e of critical) if (free(e)) fixed[e.stretch] = e.sign * weight(e, curvature);
  }
  const rises = new Array<number>(n + 1).fill(0);
  stretches.forEach((t, k) => {
    if (t.to !== 0) rises[t.to] = rises[t.from]! + (fixed[k] ?? 0);
    else if (Math.abs(rises[t.from]! + (fixed[k] ?? 0)) > 1e-6) throw new Error("The crossings' rises do not close");
  });
  return rises;
}

/**
 * `crossings`, on the road `changes` and `kinks` make, its stations `[0, end]`, parted by the least change
 * ([Original road data](../../docs/original-road-data.md#profile), Crossings): each passage moves as one by its rise,
 * and the road between two passages along it, or a passage and the road's end (whose height stays), ramps from the
 * one's rise to the other's, the least ramp for its change (`rampRise`). Of two overlapping passages the higher over
 * their pairs is over (the later where level, within `LEVEL`), rising by what `CLEARANCE` lacks at their nearest pair
 * more than the lower; no ramp is steeper than `GRADE_LIMIT`; the rises are the least by `leastRises`. The changes with the ramps', each
 * crossing's parting and the ramps' least radius.
 */
export function partedCrossings(
  changes: readonly Change[],
  crossings: readonly Crossing[],
  end: number,
  kinks: readonly Kink[] = [],
) {
  const before = profileOf(changes.map(bendOf), [], kinks);
  // Node 0 is the road's ends, node k + 1 the k-th passage along the road.
  const all = crossings.flatMap((c) => c.passages).sort((a, b) => a.from - b.from);
  const node = (p: Passage) => all.indexOf(p) + 1;
  // The ramps between them.
  const ramps = [...all, null].map((p, k) => {
    const [start, stop] = [k > 0 ? all[k - 1]!.to : 0, p ? p.from : end];
    return { from: k, to: p ? k + 1 : 0, start, length: stop - start };
  });
  const orders = crossings.flatMap(({ passages, pairs }) => {
    const passageOf = (s: number) => passages.find((p) => s >= p.from && s <= p.to)!;
    const differences = new Map<Passage, Map<Passage, number[]>>();
    for (const [a, b] of pairs) {
      const [earlier, later] = [passageOf(a), passageOf(b)];
      const byLater = differences.get(earlier) ?? new Map<Passage, number[]>();
      byLater.set(later, [...(byLater.get(later) ?? []), before.height(b) - before.height(a)]);
      differences.set(earlier, byLater);
    }
    return [...differences].flatMap(([earlier, byLater]) =>
      [...byLater].map(([later, d]): Order =>
        d.reduce((sum, x) => sum + x, 0) / d.length >= -LEVEL
          ? { from: node(earlier), to: node(later), least: CLEARANCE - Math.min(...d) }
          : { from: node(later), to: node(earlier), least: CLEARANCE + Math.max(...d) },
      ),
    );
  });
  const rises = leastRises(all.length, ramps, orders);
  // Each ramp the least for its change: two vertical curves of one curvature, a tangent at the limit between them.
  const added = ramps.flatMap((r): Change[] => {
    const change = rises[r.to]! - rises[r.from]!;
    if (change === 0) return [];
    const curvature = rampCurvature(r.length, change) * Math.sign(change);
    const turn = Math.min(r.length / 2, GRADE_LIMIT / Math.abs(curvature));
    return [
      { from: r.start, to: r.start + turn, change: curvature * turn },
      { from: r.start + r.length - turn, to: r.start + r.length, change: -curvature * turn },
    ];
  });
  const out = [...changes, ...added];
  const after = profileOf(out.map(bendOf), [], kinks);
  const partings = crossings.map((c): Parting => ({
    rises: c.passages.map((p) => rises[node(p)]!),
    apart: Math.min(...c.pairs.map(([a, b]) => Math.abs(after.height(a) - after.height(b)))),
    raw: Math.min(...c.pairs.map(([a, b]) => Math.abs(before.height(a) - before.height(b)))),
  }));
  const curvatures = ramps.map((r) => rampCurvature(r.length, rises[r.to]! - rises[r.from]!)).filter((k) => k > 0);
  return { changes: out, partings, radius: curvatures.length ? 1 / Math.max(...curvatures) : null };
}
