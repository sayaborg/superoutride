/**
 * A function of the road position made of quadratic pieces: a road width or an offset along an original's positions.
 */
import { requireInput } from '../../authoring/authoring-error.js';

/** A piece of a function of the road position, `a + b t` with `t = p − from`, over `[from, to]`. */
export interface QuadraticPiece {
  readonly from: number;
  readonly to: number;
  readonly a: number;
  readonly b: number;
}

/** Piece `q` over `[from, to]` within it, its positions less `shift`. */
export function slicePiece(q: QuadraticPiece, from: number, to: number, shift = 0): QuadraticPiece {
  return { from: from - shift, to: to - shift, a: valueAt(q, from - q.from), b: q.b };
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
    return valueAt(q, t);
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
      for (const v of breaks) for (const p of whereValue(q, v)) cuts.push(p);
      const sorted = [...new Set(cuts)].sort((x, y) => x - y);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const [from, to] = [sorted[i]!, sorted[i + 1]!];
        if (to - from < 1e-9) continue;
        const piece = slicePiece(q, from, to);
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
        out.push({ from, to, a: alpha + beta * piece.a, b: beta * piece.b });
      }
    }
    return new Quadratic(out);
  }
  /** The stretches where this function is at most `limit`, those that touch one stretch. */
  atMost(limit: number): { from: number; to: number }[] {
    return this.within(-Infinity, limit);
  }
  /** The stretches where this function is above `low` and at most `high`, those that touch one stretch. */
  within(low: number, high: number): { from: number; to: number }[] {
    const out: { from: number; to: number }[] = [];
    for (const q of this.map((v) => v, [low, high].filter(Number.isFinite)).pieces) {
      const v = this.at((q.from + q.to) / 2);
      if (!(v > low && v <= high)) continue;
      const last = out.at(-1);
      if (last && last.to === q.from) last.to = q.to;
      else out.push({ from: q.from, to: q.to });
    }
    return out;
  }
}

const valueAt = (q: QuadraticPiece, t: number) => q.a + q.b * t;

/** Where piece `q` takes value `v` strictly inside it. */
function whereValue(q: QuadraticPiece, v: number): number[] {
  const len = q.to - q.from;
  const roots = q.b === 0 ? [] : [(v - q.a) / q.b];
  return roots.filter((t) => t > 1e-9 && t < len - 1e-9).map((t) => q.from + t);
}

/** The function straight between knots `[position, value]`, from the first's position to the last's. */
export const straightThrough = (knots: readonly (readonly [number, number])[]) =>
  new Quadratic(
    knots.slice(1).map(([p, v], i) => {
      const [p0, v0] = knots[i]!;
      return { from: p0, to: p, a: v0, b: (v - v0) / (p - p0) };
    }),
  );

/** The function through knots `[position, value]` over `[0, end]`: straight between them, level beyond them. */
export const levelBeyond = (knots: readonly (readonly [number, number])[], end: number) =>
  straightThrough(
    [[0, knots[0]![1]] as const, ...knots, [end, knots.at(-1)![1]] as const].filter(
      ([p], i, all) => p >= 0 && p <= end && (i === 0 || p > all[i - 1]![0]),
    ),
  );
