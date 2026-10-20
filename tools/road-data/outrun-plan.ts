/**
 * Where OUTRUN's centre lane runs ([Original road data](../../docs/original-road-data.md#plan)): the original's road
 * path P laid off sideways by the centre lane's distance from it, as straights and arcs, and each road position's
 * station on it. Road widths are rounded at their corners first, so the plan and the lanes come from the same widths.
 */
import { requireInput } from '../course/authoring-io.js';
import { POSITION_PER_KMH, TICKS } from './outrun-hills.js';

/** One road position in metres: each tick the displayed km/h advances it by 0x12F / 65536 positions. */
export const POSITION_METRES = 1 / (3.6 * TICKS * POSITION_PER_KMH);

export type { PlanSegment } from './outrun-course.js';
import type { PlanSegment } from './outrun-course.js';

/** A piece of a function of the road position, `a + b t + c t²` with `t = p − from`, over `[from, to]`. */
export interface QuadraticPiece {
  readonly from: number;
  readonly to: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

/** A continuous function of the road position made of quadratic pieces, constant beyond its ends. */
export class Quadratic {
  constructor(readonly pieces: readonly QuadraticPiece[]) {
    requireInput(pieces.length > 0, '/widths', 'A function has at least one piece');
  }
  private pieceAt(p: number) {
    const { pieces } = this;
    let lo = 0,
      hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid]!.from <= p) lo = mid;
      else hi = mid - 1;
    }
    return pieces[lo]!;
  }
  at(p: number): number {
    const q = this.pieceAt(p);
    const t = Math.min(Math.max(p, q.from), q.to) - q.from;
    return q.a + q.b * t + q.c * t * t;
  }
  slope(p: number): number {
    const q = this.pieceAt(p);
    if (p < q.from || p > q.to) return 0;
    return q.b + 2 * q.c * (p - q.from);
  }
  /** The slope just before `p`: the piece ending there's, else the one holding it. */
  slopeBefore(p: number): number {
    const q = this.pieces.find((piece) => piece.from < p && p <= piece.to);
    return q ? q.b + 2 * q.c * (p - q.from) : 0;
  }
  /**
   * This function with each corner (a jump of slope) between two straight pieces rounded as a width's are: a parabola
   * over `ROUNDING` positions centred on it, where both pieces reach that far; others are left.
   */
  roundedCorners(): Quadratic {
    const half = ROUNDING / 2;
    const pieces = this.pieces.map((q) => ({ ...q }));
    const out: QuadraticPiece[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const q = pieces[i]!;
      const next = pieces[i + 1];
      const jump = next ? next.b - (q.b + 2 * q.c * (q.to - q.from)) : 0;
      if (
        next &&
        Math.abs(jump) > 1e-9 &&
        q.c === 0 &&
        next.c === 0 &&
        q.to - q.from >= half &&
        next.to - next.from >= (pieces[i + 2] ? ROUNDING : half)
      ) {
        const v = q.to;
        out.push({ ...q, to: v - half });
        out.push({ from: v - half, to: v + half, a: q.a + q.b * (v - half - q.from), b: q.b, c: jump / (4 * half) });
        pieces[i + 1] = { ...next, from: v + half, a: next.a + next.b * half };
        continue;
      }
      out.push(q);
    }
    return new Quadratic(out.filter((q) => q.to > q.from));
  }
  /** The positions where a piece begins or ends. */
  get breaks(): number[] {
    return [...new Set(this.pieces.flatMap((q) => [q.from, q.to]))];
  }
  /**
   * `f` of this function, `f` linear between `breaks` (values of this function where it changes slope): each piece split
   * where it crosses one, then composed.
   */
  map(f: (value: number) => number, breaks: readonly number[]): Quadratic {
    const out: QuadraticPiece[] = [];
    for (const q of this.pieces) {
      const cuts = [q.from, q.to];
      for (const v of breaks) for (const p of crossings(q, v)) cuts.push(p);
      const sorted = [...new Set(cuts)].sort((x, y) => x - y);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const [from, to] = [sorted[i]!, sorted[i + 1]!];
        const t0 = from - q.from;
        const piece = { from, to, a: q.a + q.b * t0 + q.c * t0 * t0, b: q.b + 2 * q.c * t0, c: q.c };
        if (to - from < 1e-9) continue;
        // f is linear between the breaks either side of the values this piece takes: f(v) = α + β v.
        const mid = valueAt(piece, (to - from) / 2);
        const below = Math.max(-Infinity, ...breaks.filter((v) => v <= mid));
        const above = Math.min(Infinity, ...breaks.filter((v) => v > mid));
        const [x1, x2] = Number.isFinite(below)
          ? [below, Number.isFinite(above) ? above : below + 1]
          : Number.isFinite(above)
            ? [above - 1, above]
            : [mid, mid + 1];
        const beta = (f(x2) - f(x1)) / (x2 - x1);
        const alpha = f(x1) - beta * x1;
        out.push({ from, to, a: alpha + beta * piece.a, b: beta * piece.b, c: beta * piece.c });
      }
    }
    return new Quadratic(out);
  }
}

const valueAt = (q: QuadraticPiece, t: number) => q.a + q.b * t + q.c * t * t;

/** Where piece `q` takes value `v` strictly inside it. */
function crossings(q: QuadraticPiece, v: number): number[] {
  const len = q.to - q.from;
  const roots: number[] = [];
  if (Math.abs(q.c) < 1e-15) {
    if (q.b !== 0) roots.push((v - q.a) / q.b);
  } else {
    const disc = q.b * q.b - 4 * q.c * (q.a - v);
    if (disc >= 0) for (const sign of [-1, 1]) roots.push((-q.b + sign * Math.sqrt(disc)) / (2 * q.c));
  }
  return roots.filter((t) => t > 1e-9 && t < len - 1e-9).map((t) => q.from + t);
}

/** A road width's corners are rounded over this many positions, centred on each. */
export const ROUNDING = 4;

/**
 * Linear knots `[position, value]` over `[start, end]` with every corner, where the slope changes, rounded by a
 * parabola over `ROUNDING` positions centred on it (the value then misses the corner by half the change of slope times
 * a position); corners nearer than `ROUNDING` are rounded as one, about where their outer lines meet. The value is level
 * before `start`, as every piece's neighbour ends: a corner nearer the start than half the rounding is moved in to there,
 * the line after it with it. No corner lies within half the rounding of the end.
 */
export function rounded(
  knots: readonly (readonly [number, number])[],
  start: number,
  end: number,
  reachAt: (vertex: number) => number = () => ROUNDING / 2,
): Quadratic {
  const half = ROUNDING / 2;
  // The polyline: level before the first knot, its knots, level after the last.
  let points = [[start - 1, knots[0]![1]] as [number, number], ...knots.map(([p, v]) => [p, v] as [number, number])];
  points = points.filter((pt, i) => i === 0 || pt[0] > points[i - 1]![0]);
  const slopeOf = (i: number) => (points[i + 1]![1] - points[i]![1]) / (points[i + 1]![0] - points[i]![0]);
  // A corner within half the rounding of the start: the line after it moved in, to its next knot.
  for (let i = 1; i < points.length - 1; i++) {
    const [p] = points[i]!;
    if (p >= start + half || Math.abs(slopeOf(i) - slopeOf(i - 1)) < 1e-12) continue;
    const shift = start + half - p;
    requireInput(
      i + 2 >= points.length || points[i + 1]![0] + shift < points[i + 2]![0],
      '/widths',
      `The width's corner at ${p} cannot be moved in from the piece's start`,
    );
    for (const k of [i, i + 1]) if (points[k]) points[k] = [points[k]![0] + shift, points[k]![1]];
    break;
  }
  points.push([Math.max(end, points.at(-1)![0]) + 1, points.at(-1)![1]]);
  // The corners, merged where nearer than the rounding.
  const lines = points.slice(0, -1).map((pt, i) => ({ at: pt[0], value: pt[1], slope: slopeOf(i) }));
  const lineAt = (k: number, p: number) => lines[k]!.value + lines[k]!.slope * (p - lines[k]!.at);
  const corners: { before: number; after: number; vertex: number; reach: number }[] = [];
  for (let k = 1; k < lines.length; k++) {
    if (Math.abs(lines[k]!.slope - lines[k - 1]!.slope) < 1e-12) continue;
    const last = corners.at(-1);
    if (last && lines[k]!.at - last.vertex < ROUNDING) {
      // One rounding about where the outer lines meet, reaching over both corners.
      const [x, y] = [lines[last.before]!, lines[k]!];
      const vertex = Math.abs(y.slope - x.slope) < 1e-12 ? (last.vertex + y.at) / 2 : vertexOf(x, y);
      const reach = Math.max(half, vertex - (last.vertex - last.reach), y.at + half - vertex);
      corners[corners.length - 1] = { before: last.before, after: k, vertex, reach };
    } else corners.push({ before: k - 1, after: k, vertex: lines[k]!.at, reach: reachAt(lines[k]!.at) });
  }
  for (const c of corners)
    requireInput(
      c.vertex - c.reach >= start - 1e-9 && c.vertex + c.reach <= end + 1e-9,
      '/widths',
      `A corner at ${c.vertex} is rounded beyond the piece [${start}, ${end}]`,
    );
  // The pieces: lines between the roundings, a parabola over each.
  const pieces: QuadraticPiece[] = [];
  let p = start,
    k = lines.findIndex((_, i) => (lines[i + 1]?.at ?? Infinity) > start);
  for (const c of corners) {
    const [from, to] = [c.vertex - c.reach, c.vertex + c.reach];
    if (from > p) pieces.push({ from: p, to: from, a: lineAt(k, p), b: lines[k]!.slope, c: 0 });
    const [x, y] = [lines[c.before]!, lines[c.after]!];
    const value = x.value + x.slope * (from - x.at);
    pieces.push({ from, to, a: value, b: x.slope, c: (y.slope - x.slope) / (4 * c.reach) });
    p = to;
    k = c.after;
  }
  if (end > p) pieces.push({ from: p, to: end, a: lineAt(k, p), b: lines[k]!.slope, c: 0 });
  return new Quadratic(pieces.filter((q) => q.to > q.from));
}

/** Where two lines `{at, value, slope}` meet. */
function vertexOf(x: { at: number; value: number; slope: number }, y: { at: number; value: number; slope: number }) {
  return (y.value - x.value + x.slope * x.at - y.slope * y.at) / (x.slope - y.slope);
}

/** A plan element in metres: a straight, or an arc turning `turn` radians, left positive, over road positions. */
export interface PlanElement {
  readonly from: number;
  readonly to: number;
  readonly length: number;
  readonly turn: number;
}

/** A pose in a piece's frame: metres, heading in radians counterclockwise from +x. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** The farthest the plan's straights and arcs may lie from the curve they stand for, metres. */
const PLAN_TOLERANCE = 0.01;
/** The most a corner's arc lies from the corner it turns through, metres. */
const CORNER_SAGITTA = 0.003;
/** A corner's arc is at least this long for each radian it turns through, metres: its radius at least this. */
const CORNER_RADIUS = 120;
/** A curve whose offset changes over an arc is laid as arcs of at most this, positions. */
const ARC_PIECE = 2;
/** Gauss–Legendre nodes and weights on [0, 1], eight of them. */
const GAUSS: readonly (readonly [number, number])[] = [
  [0.1834346424956498, 0.362683783378362],
  [0.525532409916329, 0.3137066458778873],
  [0.7966664774136267, 0.2223810344533745],
  [0.9602898564975363, 0.1012285362903763],
].flatMap(([x, w]) => [[(1 - x!) / 2, w! / 2] as const, [(1 + x!) / 2, w! / 2] as const]);

/**
 * The centre lane's plan: path `P` (its segments over road positions, from its start facing +x) with its centre lane
 * `offset` metres right of it (`offset` a function of the road position), over `[from, to]`. Its station at a road
 * position is the arc length to the point across from P there.
 */
export class OffsetPlan {
  readonly elements: readonly PlanElement[];
  private readonly table: Float64Array;
  constructor(
    readonly path: readonly PlanSegment[],
    readonly offset: Quadratic,
    readonly from: number,
    readonly to: number,
    breaks: readonly number[] = [],
  ) {
    requireInput(
      path[0]!.from <= from && path.at(-1)!.to >= to,
      '/plan',
      `The path does not cover positions ${from} to ${to}`,
    );
    // Stations at each whole position and break, integrated.
    this.table = new Float64Array(Math.ceil(to - from) + 1);
    for (let i = 1; i < this.table.length; i++) {
      const [a, b] = [from + i - 1, Math.min(to, from + i)];
      this.table[i] = this.table[i - 1]! + this.integral(a, b);
    }
    this.elements = this.lay(breaks);
  }

  /** P's segment holding position `p` (the later at a joint). */
  private segment(p: number) {
    return this.path.find((s) => p >= s.from && p < s.to) ?? this.path.at(-1)!;
  }
  /** P's curvature at `p`, per metre. */
  private curvature(p: number) {
    const s = this.segment(p);
    return s.turn / ((s.to - s.from) * POSITION_METRES);
  }
  /** P's pose at `p`. */
  pathPose(p: number): Pose {
    let x = 0,
      y = 0,
      h = 0;
    for (const s of this.path) {
      if (p <= s.from) break;
      const d = (Math.min(p, s.to) - s.from) * POSITION_METRES;
      const k = s.turn / ((s.to - s.from) * POSITION_METRES);
      x += k === 0 ? d * Math.cos(h) : (Math.sin(h + k * d) - Math.sin(h)) / k;
      y += k === 0 ? d * Math.sin(h) : (Math.cos(h) - Math.cos(h + k * d)) / k;
      h += k * d;
    }
    return { x, y, heading: h };
  }
  /** The centre lane's speed along the plan, metres a position, at `p`. */
  private speed(p: number) {
    const along = POSITION_METRES * (1 + this.curvature(p) * this.offset.at(p));
    return Math.hypot(along, this.offset.slope(p));
  }
  private integral(a: number, b: number) {
    let sum = 0;
    for (const [t, w] of GAUSS) sum += w * this.speed(a + t * (b - a));
    return sum * (b - a);
  }
  /** The station at road position `p`, metres from the plan's start, to the micrometre. */
  station(p: number): number {
    const q = Math.min(Math.max(p, this.from), this.to);
    const i = Math.min(Math.floor(q - this.from), this.table.length - 1);
    const s = this.table[i]! + (q > this.from + i ? this.integral(this.from + i, q) : 0);
    return Number((Math.round(s / 1e-6) * 1e-6).toFixed(6));
  }
  /** The centre lane's point and heading across from P at `p` (the heading the later side's at a corner). */
  pose(p: number): Pose {
    const base = this.pathPose(p);
    const l = this.offset.at(p);
    const along = POSITION_METRES * (1 + this.curvature(p) * l);
    return {
      x: base.x + l * Math.sin(base.heading),
      y: base.y - l * Math.cos(base.heading),
      heading: base.heading + Math.atan2(-this.offset.slope(p), along),
    };
  }
  /** P's curvature just before `p`, per metre. */
  private curvatureBefore(p: number) {
    const s = this.path.find((segment) => segment.from < p && p <= segment.to) ?? this.path[0]!;
    return s.turn / ((s.to - s.from) * POSITION_METRES);
  }
  /** The heading just before `p`: the earlier side's at a corner. */
  private headingBefore(p: number) {
    const base = this.pathPose(p);
    const along = POSITION_METRES * (1 + this.curvatureBefore(p) * this.offset.at(p));
    return base.heading + Math.atan2(-this.offset.slopeBefore(p), along);
  }

  /**
   * Straights and arcs over the range, joined where P's segments and the offset's pieces join and at `breaks`: a straight
   * where P is straight and the offset changes evenly, an arc where P is an arc and the offset holds (both exact), else
   * arcs of at most `ARC_PIECE` positions (`ROUNDING` where P is straight) turning as the curve does. A corner, where
   * the heading jumps (P's curvature does while the offset changes, or the offset's slope does), is turned through by an
   * arc either side of it, each turning half the jump with its side's bend: long enough to be no sharper than
   * `CORNER_RADIUS`, short enough to lie within `CORNER_SAGITTA` of the corner, at most a position.
   */
  private lay(breaks: readonly number[]): PlanElement[] {
    const inside = (p: number) => p > this.from + 1e-9 && p < this.to - 1e-9;
    const joints = new Set<number>([this.from, this.to]);
    for (const s of this.path) for (const p of [s.from, s.to]) if (inside(p)) joints.add(p);
    for (const p of [...this.offset.breaks, ...breaks]) if (inside(p)) joints.add(p);
    const exactOver = (a: number, b: number) => {
      const steady = Math.abs(this.offset.slope(a) - this.offset.slopeBefore(b)) < 1e-12;
      return (this.curvature((a + b) / 2) === 0 && steady) || (steady && Math.abs(this.offset.slope(a)) < 1e-12);
    };
    const jumpAt = (p: number) => this.pose(p).heading - this.headingBefore(p);
    // The bend of the curve beside `p`, per metre, on side `side`.
    const bendBeside = (p: number, side: -1 | 1) =>
      side < 0
        ? (this.headingBefore(p) - this.pose(p - 0.25).heading) / (this.station(p) - this.station(p - 0.25))
        : (this.pose(p + 0.25).heading - this.pose(p).heading) / (this.station(p + 0.25) - this.station(p));
    const corners = new Map<number, number>();
    const sorted0 = [...joints].sort((a, b) => a - b);
    for (let i = 1; i + 1 < sorted0.length; i++) {
      const c = sorted0[i]!;
      const jump = jumpAt(c);
      if (Math.abs(jump) <= 1e-10) continue;
      const half = Math.abs(jump) / 2;
      const length = (side: -1 | 1) => {
        const room = 1 / CORNER_RADIUS - Math.max(0, bendBeside(c, side) * Math.sign(jump));
        return Math.max(room > 0 ? half / room : Infinity, (8 * CORNER_SAGITTA) / Math.abs(jump) / 2);
      };
      const reach = Math.min(
        1,
        Math.max(length(-1), length(1)) / POSITION_METRES,
        (c - sorted0[i - 1]!) / 2,
        (sorted0[i + 1]! - c) / 2,
      );
      corners.set(c - reach, jump);
      joints.add(c - reach).add(c + reach);
      corners.set(c, 0);
    }
    const sorted = [...joints].sort((a, b) => a - b);
    const out: PlanElement[] = [];
    let heading = this.pose(this.from).heading;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const [a, b] = [sorted[i]!, sorted[i + 1]!];
      const turning = corners.has(a);
      const exact = !turning && exactOver(a, b);
      const straight = exact && this.curvature((a + b) / 2) === 0;
      const step = this.curvature((a + b) / 2) === 0 ? ROUNDING : ARC_PIECE;
      const n = exact || turning ? 1 : Math.ceil((b - a) / step - 1e-9);
      for (let k = 0; k < n; k++) {
        const [p, q] = [a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n];
        const length = this.station(q) - this.station(p);
        // Before a corner, half its jump turned by the end.
        const jump = corners.get(a);
        const target = this.headingBefore(q) + (jump ? jump / 2 : 0);
        const turn = straight ? 0 : target - heading;
        out.push({ from: p, to: q, length, turn: Math.abs(turn) < 1e-12 ? 0 : turn });
        heading += turn;
      }
    }
    this.check(out);
    return out;
  }

  /** The laid elements lie within `PLAN_TOLERANCE` of the curve at every joint. */
  private check(elements: readonly PlanElement[]) {
    let { x, y, heading } = this.pose(this.from);
    let worst = 0;
    for (const e of elements) {
      const k = e.turn / e.length;
      x += k === 0 ? e.length * Math.cos(heading) : (Math.sin(heading + e.turn) - Math.sin(heading)) / k;
      y += k === 0 ? e.length * Math.sin(heading) : (Math.cos(heading) - Math.cos(heading + e.turn)) / k;
      heading += e.turn;
      const truth = this.pose(e.to);
      worst = Math.max(worst, Math.hypot(truth.x - x, truth.y - y));
    }
    requireInput(worst <= PLAN_TOLERANCE, '/plan', `The plan lies ${worst} m from its curve`);
    this.drift = worst;
  }
  /** The farthest the plan's joints lie from the curve, metres. */
  drift = 0;
}
