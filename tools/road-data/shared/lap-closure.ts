/**
 * A closed road nearest its original's curves ([A lap closed](../../../docs/original-road-data.md#a-lap-closed)): each
 * of an original's laps from its curve table, the original's one scale solved with every lap's corrections, each
 * interval's turn corrected the least to close the lap exactly in heading and position; and what the closing did.
 */
import type { PathPiece } from './course-path.js';
import { contractUnmet } from './conversion-errors.js';
import { micrometre } from './section-writing.js';

/** A lap's table: its curve values one an interval of `interval` metres, and the turns its map makes (0, ±1). */
export interface LapTable {
  readonly curves: readonly number[];
  readonly interval: number;
  readonly turns: number;
}

/** A lap closed: each interval's turn (radians, left positive) and its correction from the scaled table's. */
export interface ClosedLap {
  readonly turns: readonly number[];
  readonly corrections: readonly number[];
}

/** An original's laps closed, and its scale: radians a curve value turns a metre. */
export interface ClosedLaps {
  readonly scale: number;
  readonly laps: readonly ClosedLap[];
}

/** The solve's own tolerances: a lap closed to a nanometre and a nanoradian, its steps no longer moving a turn. */
const CLOSED = 1e-9;
const STILL = 1e-13;
const MOST_STEPS = 100;

/** An interval's chord over its arc (a straight's 1). */
const chord = (turn: number) => (turn === 0 ? 1 : (2 * Math.sin(turn / 2)) / turn);
/** Its derivative by the turn: its series' first term where the two terms would cancel. */
const SERIES = 1e-6;
const chordSlope = (turn: number) =>
  Math.abs(turn) < SERIES ? -turn / 12 : Math.cos(turn / 2) / turn - (2 * Math.sin(turn / 2)) / (turn * turn);

/** A lap's misclosure (its heading's and its end's from its start) and its rows by each turn. */
function misclosure({ interval, turns: wanted }: LapTable, turns: readonly number[]) {
  const n = turns.length;
  const [px, py, heading] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  let [x, y, h] = [0, 0, 0];
  turns.forEach((turn, i) => {
    heading[i] = h + turn / 2;
    const c = interval * chord(turn);
    [px[i], py[i]] = [c * Math.cos(heading[i]!), c * Math.sin(heading[i]!)];
    [x, y, h] = [x + px[i]!, y + py[i]!, h + turn];
  });
  // A turn moves every chord after it about its own: the chords' sum after it turned a quarter; its own by half.
  const [jx, jy] = [new Float64Array(n), new Float64Array(n)];
  let [sx, sy] = [0, 0];
  for (let i = n - 1; i >= 0; i--) {
    const own = interval * chordSlope(turns[i]!);
    jx[i] = -sy - py[i]! / 2 + own * Math.cos(heading[i]!);
    jy[i] = sx + px[i]! / 2 + own * Math.sin(heading[i]!);
    [sx, sy] = [sx + px[i]!, sy + py[i]!];
  }
  return { g: [h - 2 * Math.PI * wanted, x, y], rows: [new Float64Array(n).fill(1), jx, jy] };
}

/** A 3 × 3 system solved (its matrix symmetric and positive definite), by elimination. */
function solve3(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let k = 0; k < 3; k++) {
    if (!(Math.abs(m[k]![k]!) > 0)) throw contractUnmet('A lap cannot be closed by its turns');
    for (let i = k + 1; i < 3; i++) {
      const f = m[i]![k]! / m[k]![k]!;
      for (let j = k; j < 4; j++) m[i]![j]! -= f * m[k]![j]!;
    }
  }
  const out = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let v = m[i]![3]!;
    for (let j = i + 1; j < 3; j++) v -= m[i]![j]! * out[j]!;
    out[i] = v / m[i]![i]!;
  }
  return out;
}

/**
 * An original's laps closed: the turns nearest the table's, scaled by one scale, in the integral of the squared
 * curvature's correction (each interval's correction squared over its length), every lap closed exactly in heading
 * (its map's turns) and position, the scale solved with them. Each step solves the linearized closing exactly for
 * the corrections and the scale.
 */
export function closeLaps(tables: readonly LapTable[]): ClosedLaps {
  // A curve value over an interval, metres: the table's turn is the scale times it.
  const metred = tables.map((t) => t.curves.map((c) => c * t.interval));
  const sums = metred.map((m) => m.reduce((s, v) => s + v, 0));
  const square = sums.reduce((s, v) => s + v * v, 0);
  if (!(square > 0)) throw contractUnmet("An original's laps turn nowhere");
  let scale = tables.reduce((s, t, i) => s + 2 * Math.PI * t.turns * sums[i]!, 0) / square;
  // Each lap starts at its scaled table with its heading's misclosure spread evenly.
  const turns = tables.map((t, i) => {
    const spread = (2 * Math.PI * t.turns - scale * sums[i]!) / t.curves.length;
    return metred[i]!.map((m) => scale * m + spread);
  });
  for (let step = 0; ; step++) {
    if (step === MOST_STEPS) throw contractUnmet('A lap does not close within the steps its solve takes');
    // Each lap's linearized closing: its rows' products, weighted by the intervals' lengths, its scale's column and
    // its misclosure less the residual's part.
    const parts = tables.map((t, i) => {
      const { g, rows } = misclosure(t, turns[i]!);
      const residual = turns[i]!.map((turn, j) => turn - scale * metred[i]![j]!);
      const dot = (u: ArrayLike<number>, v: ArrayLike<number>) => {
        let sum = 0;
        for (let j = 0; j < u.length; j++) sum += u[j]! * v[j]!;
        return sum;
      };
      const a = rows.map((r) => rows.map((s) => t.interval * dot(r, s)));
      const b = rows.map((r) => dot(r, metred[i]!));
      const h = rows.map((r, k) => g[k]! - dot(r, residual));
      return { g, rows, residual, ab: solve3(a, b), ah: solve3(a, h), b };
    });
    // The scale's step makes the corrections' change square to the scaled table; each lap's multipliers follow.
    const product = (u: readonly number[], v: readonly number[]) => u.reduce((sum, x, k) => sum + x * v[k]!, 0);
    const kappa =
      -parts.reduce((s, p) => s + product(p.b, p.ah), 0) / parts.reduce((s, p) => s + product(p.b, p.ab), 0);
    let moved = 0;
    parts.forEach((p, i) => {
      const mu = p.ah.map((v, k) => v + kappa * p.ab[k]!);
      const interval = tables[i]!.interval;
      p.residual.forEach((r, j) => {
        const pull = interval * (mu[0]! * p.rows[0]![j]! + mu[1]! * p.rows[1]![j]! + mu[2]! * p.rows[2]![j]!);
        const delta = -r - pull + kappa * metred[i]![j]!;
        turns[i]![j]! += delta;
        moved = Math.max(moved, Math.abs(delta));
      });
    });
    scale += kappa;
    const closed = parts.every((p) => p.g.every((v) => Math.abs(v) < CLOSED));
    if (closed && moved < STILL) break;
  }
  return {
    scale,
    laps: turns.map((ts, i) => ({ turns: ts, corrections: ts.map((t, j) => t - scale * metred[i]![j]!) })),
  };
}

/** A curvature as the course format writes it: a straight's none, an arc's side and radius to the micrometre. */
const written = (turn: number, length: number) =>
  turn === 0 ? 0 : Math.sign(turn) / micrometre(length / Math.abs(turn));

/** A lap's plan: its intervals as arcs, neighbours of one curvature as written one piece. */
export function lapPieces(lap: ClosedLap, interval: number): PathPiece[] {
  const pieces: PathPiece[] = [];
  for (const turn of lap.turns) {
    const last = pieces.at(-1);
    if (last && written(last.turn, last.length) === written(turn, interval))
      pieces[pieces.length - 1] = { length: last.length + interval, turn: last.turn + turn };
    else pieces.push({ length: interval, turn });
  }
  return pieces;
}

/** A lap's points at the starts of its intervals and at its end, metres, from (0, 0) heading +x. */
export function lapPoints(lap: ClosedLap, interval: number): [number, number][] {
  const points: [number, number][] = [[0, 0]];
  let heading = 0;
  for (const turn of lap.turns) {
    const [x, y] = points.at(-1)!;
    const c = interval * chord(turn);
    points.push([x + c * Math.cos(heading + turn / 2), y + c * Math.sin(heading + turn / 2)]);
    heading += turn;
  }
  return points;
}

/** Where two chords of a lap cross, not neighbours: the lap's crossings of itself. */
function crossings(points: readonly (readonly [number, number])[]): number {
  const n = points.length - 1;
  const side = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
    Math.sign((b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!));
  let count = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [points[i]!, points[i + 1]!, points[j]!, points[j + 1]!];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) count++;
    }
  return count;
}

/**
 * How far a lap's shape lies from its map's: the map's points one at each equal share of the lap from its start, the
 * lap's points there turned and stretched along the map's two axes (and moved) to lie nearest them in the squares of
 * their distances; their mean distance over the map's size (its points' root mean square distance from their mean).
 */
export function mapDifference(lap: ClosedLap, interval: number, map: readonly (readonly [number, number])[]): number {
  const points = lapPoints(lap, interval);
  const n = lap.turns.length;
  const at = map.map((_, j) => {
    const u = (j * n) / map.length;
    const [k, f] = [Math.floor(u), u - Math.floor(u)];
    const [a, b] = [points[k]!, points[k + 1]!];
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])] as const;
  });
  const mean = (v: readonly (readonly [number, number])[], axis: 0 | 1) =>
    v.reduce((s, p) => s + p[axis], 0) / v.length;
  const [px, py, qx, qy] = [mean(at, 0), mean(at, 1), mean(map, 0), mean(map, 1)];
  const size = Math.sqrt(map.reduce((s, q) => s + (q[0] - qx) ** 2 + (q[1] - qy) ** 2, 0) / map.length);
  /** At a turn θ of the lap, each axis's best stretch and the mean distance. */
  const distance = (theta: number) => {
    const [c, s] = [Math.cos(theta), Math.sin(theta)];
    const turned = at.map((p) => [c * (p[0] - px) - s * (p[1] - py), s * (p[0] - px) + c * (p[1] - py)] as const);
    const stretch = ([0, 1] as const).map((axis) => {
      const [pq, pp] = turned.reduce(
        ([u, v], p, j) => [u + p[axis] * (map[j]![axis] - [qx, qy][axis]!), v + p[axis] ** 2],
        [0, 0],
      );
      return Math.max(0, pq / pp);
    });
    return (
      turned.reduce(
        (sum, p, j) => sum + Math.hypot(stretch[0]! * p[0] - (map[j]![0] - qx), stretch[1]! * p[1] - (map[j]![1] - qy)),
        0,
      ) / map.length
    );
  };
  // The turn: the best of the map's count of equal turns, then a golden section between its neighbours.
  const step = (2 * Math.PI) / map.length;
  let best = 0;
  for (let k = 1; k < map.length; k++) if (distance(k * step) < distance(best * step)) best = k;
  let [lo, hi] = [(best - 1) * step, (best + 1) * step];
  const golden = (Math.sqrt(5) - 1) / 2;
  while (hi - lo > 1e-12) {
    const [a, b] = [hi - golden * (hi - lo), lo + golden * (hi - lo)];
    if (distance(a) < distance(b)) hi = b;
    else lo = a;
  }
  return distance((lo + hi) / 2) / size;
}

/** What closing did to a lap: its corrections' most and mean (radians), its longest straight's turn, its crossings. */
export function lapReport(table: LapTable, lap: ClosedLap) {
  const n = table.curves.length;
  const magnitudes = lap.corrections.map(Math.abs);
  // The longest run of the table's straights, round the lap, and how far it turns closed.
  let longest = { from: 0, length: 0 };
  for (let i = 0; i < n; i++) {
    if (table.curves[i] !== 0 || table.curves[(i + n - 1) % n] === 0) continue;
    let length = 0;
    while (length < n && table.curves[(i + length) % n] === 0) length++;
    if (length > longest.length) longest = { from: i, length };
  }
  let straightTurn = 0;
  for (let k = 0; k < longest.length; k++) straightTurn += lap.turns[(longest.from + k) % n]!;
  return {
    most: Math.max(...magnitudes),
    mean: magnitudes.reduce((s, v) => s + v, 0) / n,
    straight: { metres: longest.length * table.interval, turn: straightTurn },
    crossings: crossings(lapPoints(lap, table.interval)),
  };
}
