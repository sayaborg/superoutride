/**
 * A function of the road position made of quadratic pieces: a road width or an offset along an original's positions.
 */
import { requireInput } from '../course/authoring-io.js';

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

/** The function straight between knots `[position, value]`, from the first's position to the last's. */
export const straightThrough = (knots: readonly (readonly [number, number])[]) =>
  new Quadratic(
    knots.slice(1).map(([p, v], i) => {
      const [p0, v0] = knots[i]!;
      return { from: p0, to: p, a: v0, b: (v - v0) / (p - p0), c: 0 };
    }),
  );

/** The function through knots `[position, value]` over `[0, end]`: straight between them, level beyond them. */
export const levelBeyond = (knots: readonly (readonly [number, number])[], end: number) =>
  straightThrough(
    [[0, knots[0]![1]] as const, ...knots, [end, knots.at(-1)![1]] as const].filter(
      ([p], i, all) => p >= 0 && p <= end && (i === 0 || p > all[i - 1]![0]),
    ),
  );
