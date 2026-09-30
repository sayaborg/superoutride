import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';

/** Original affine arithmetic retained when a material edge is split at unrelated stations. */
export interface StripEdgeLine {
  readonly start: number;
  readonly end: number;
  readonly from: number;
  readonly to: number;
  /** Retain the canonical line and its exact endpoint values when subdividing. */
  readonly anchored?: true;
  readonly offset?: number;
}

/** One affine piece of an expanded Strip. Null left/right denotes the corresponding open side. */
export interface StripPiece<Value = number | null> {
  readonly start: number;
  readonly end: number;
  readonly left: StripEdgeLine | null;
  readonly right: StripEdgeLine | null;
  /** Opaque cell payload; renamed in the naming stage. */
  readonly value: Value;
}
export interface StripSlab<Value = number | null> {
  readonly start: number;
  readonly end: number;
  readonly active: number;
  readonly spans: readonly StripPiece<Value>[];
}

export function stripEdgeAt(piece: StripPiece<unknown>, side: 'left' | 'right', s: number): number {
  const line = piece[side];
  if (line === null) return side === 'left' ? -Infinity : Infinity;
  const value =
    line.anchored && s === line.start
      ? line.from
      : line.anchored && s === line.end
        ? line.to
        : line.from + (line.to - line.from) * ((s - line.start) / (line.end - line.start));
  return value + (line.offset ?? 0);
}

/** Split first at activation/knots, then at every affine edge crossing; declaration order remains authoritative. */
export function resolveStripSlabs<Value>(
  length: number,
  pieces: readonly StripPiece<Value>[],
  outside: Value,
  path: string,
): readonly StripSlab<Value>[] {
  const stations = [...new Set([0, length, ...pieces.flatMap((p) => [p.start, p.end])])].sort((a, b) => a - b);
  const starts = pieces.map((piece, order) => ({ piece, order })).sort((a, b) => a.piece.start - b.piece.start);
  let next = 0;
  let active: typeof starts = [];
  const slabs: StripSlab<Value>[] = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const start = stations[i]!,
      end = stations[i + 1]!;
    active = active.filter((p) => p.piece.end > start);
    while (next < starts.length && starts[next]!.piece.start <= start) active.push(starts[next++]!);
    active.sort((a, b) => a.order - b.order);
    const edges = active.flatMap(({ piece }) =>
      (['left', 'right'] as const).filter((side) => piece[side] !== null).map((side) => ({ piece, side })),
    );
    const cuts = [start, end];
    for (let a = 0; a < edges.length; a++)
      for (let b = a + 1; b < edges.length; b++) {
        const x = edges[a]!,
          y = edges[b]!;
        const d0 = stripEdgeAt(x.piece, x.side, start) - stripEdgeAt(y.piece, y.side, start);
        const d1 = stripEdgeAt(x.piece, x.side, end) - stripEdgeAt(y.piece, y.side, end);
        if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) {
          const s = start + ((end - start) * d0) / (d0 - d1);
          if (s > start && s < end) cuts.push(s);
        }
      }
    const sorted = [...new Set(cuts)].sort((a, b) => a - b);
    for (let j = 0; j + 1 < sorted.length; j++) {
      const a = sorted[j]!,
        b = sorted[j + 1]!,
        middle = a + (b - a) / 2;
      const ordered = edges
        .map((edge) => ({ ...edge, x: stripEdgeAt(edge.piece, edge.side, middle) }))
        .sort((x, y) => x.x - y.x);
      const distinct = ordered.filter((edge, index) => index === 0 || edge.x !== ordered[index - 1]!.x);
      const spans: StripPiece<Value>[] = [];
      for (let k = 0; k <= distinct.length; k++) {
        const le = distinct[k - 1],
          re = distinct[k];
        const l = le?.x ?? -Infinity,
          r = re?.x ?? Infinity;
        let value = outside;
        for (let n = active.length - 1; n >= 0; n--) {
          const p = active[n]!.piece;
          // Every edge already bounds a cell; interval containment avoids an unrepresentable interior witness.
          if (stripEdgeAt(p, 'left', middle) <= l && r <= stripEdgeAt(p, 'right', middle)) {
            value = p.value;
            break;
          }
        }
        const edgeLine = (edge: typeof le): StripEdgeLine | null => {
          if (!edge) return null;
          const line = edge.piece[edge.side]!;
          return line.anchored
            ? Object.freeze({ ...line })
            : Object.freeze({
                start: a,
                end: b,
                from: stripEdgeAt(edge.piece, edge.side, a),
                to: stripEdgeAt(edge.piece, edge.side, b),
              });
        };
        const left = edgeLine(le),
          right = edgeLine(re);
        const previous = spans.at(-1);
        if (previous && previous.value === value) spans[spans.length - 1] = { ...previous, right };
        else spans.push({ start: a, end: b, left, right, value });
      }
      slabs.push(
        Object.freeze({
          start: a,
          end: b,
          active: active.length,
          spans: Object.freeze(spans.map((p) => Object.freeze(p))),
        }),
      );
      if (slabs.length > COURSE_DOCUMENT_LIMITS.stripSlabs)
        throw new CourseInputError('resource_limit', path, 'Resolved Strip slab limit exceeded');
    }
  }
  return Object.freeze(slabs);
}

/** Half-open station ownership, with the final slab also owning the Section terminal. */
export function stripSlabAt(slabs: readonly StripSlab<unknown>[], s: number): number {
  let lo = 0,
    hi = slabs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (slabs[mid]!.start <= s) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

/** Point ownership compares shifted edges directly, without adding an origin back to l. */
export function stripSpanAt<Value>(slab: StripSlab<Value>, s: number, l: number, lateralOrigin = 0): StripPiece<Value> {
  let lo = 0,
    hi = slab.spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (stripEdgeAt(slab.spans[mid]!, 'left', s) - lateralOrigin <= l) lo = mid + 1;
    else hi = mid;
  }
  return slab.spans[Math.max(0, lo - 1)]!;
}
