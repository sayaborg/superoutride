import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { rgb555LinearChannel } from '../image/image-filter.js';

export const STRIP_ACTIVE_LIMIT = COURSE_DOCUMENT_LIMITS.activeStrips;
/** Smallest cached interval in metres. */
export const STRIP_BASE_STEP = 1;

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

interface StripLateralField {
  readonly count: number;
  readonly base: readonly number[];
  /** x, premultiplied linear R/G/B/coverage, then their lateral slopes. Private owned storage. */
  readonly data: Float64Array;
}
interface Level {
  readonly step: number;
  readonly indices: Uint32Array;
  readonly active: Uint8Array;
}
interface Event {
  readonly x: number;
  readonly value: number[];
  readonly slope: number[];
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
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('Strip field length must be positive and finite');
  for (const p of pieces) {
    if (!(p.start >= 0 && p.end > p.start && p.end <= length) || !Number.isFinite(p.end))
      throw new RangeError('Expanded Strip interval must lie inside the Section');
    for (const side of ['left', 'right'] as const) {
      const line = p[side];
      if (
        line !== null &&
        !(
          Number.isFinite(line.start) &&
          Number.isFinite(line.end) &&
          line.end > line.start &&
          Number.isFinite(line.from) &&
          Number.isFinite(line.to) &&
          Number.isFinite(line.offset ?? 0)
        )
      )
        throw new RangeError('Strip edges must be finite affine lines or open');
    }
    if (
      stripEdgeAt(p, 'left', p.start) > stripEdgeAt(p, 'right', p.start) ||
      stripEdgeAt(p, 'left', p.end) > stripEdgeAt(p, 'right', p.end)
    )
      throw new RangeError('Strip left edge cannot exceed its right edge');
  }
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
    if (active.length > STRIP_ACTIVE_LIMIT)
      throw new RangeError(`Active Strips ${active.length} exceed ${STRIP_ACTIVE_LIMIT} at s=${start}`);
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

/** Integrating an affine edge over s yields a lateral ramp, not a relocated hard edge. */
function lateralFieldFor(
  slabs: readonly StripSlab[],
  first: number,
  start: number,
  end: number,
  path: string,
): { field: StripLateralField; active: number; key: string } {
  const base = [0, 0, 0, 0],
    events = new Map<number, Event>();
  let active = 0;
  const event = (x: number) => {
    let value = events.get(x);
    if (!value) {
      value = { x, value: [0, 0, 0, 0], slope: [0, 0, 0, 0] };
      events.set(x, value);
    }
    return value;
  };
  for (let i = first; i < slabs.length && slabs[i]!.start < end; i++) {
    const slab = slabs[i]!,
      a = Math.max(start, slab.start),
      b = Math.min(end, slab.end),
      weight = (b - a) / (end - start);
    if (!(b > a)) continue;
    active = Math.max(active, slab.active);
    for (const p of slab.spans) {
      if (p.value === null) continue;
      const color = [
        rgb555LinearChannel(p.value >>> 10),
        rgb555LinearChannel((p.value >>> 5) & 31),
        rgb555LinearChannel(p.value & 31),
        1,
      ];
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'left' ? 1 : -1;
        if (p[side] === null) {
          if (side === 'left') for (let c = 0; c < 4; c++) base[c]! += color[c]! * weight;
          continue;
        }
        const x0 = stripEdgeAt(p, side, a),
          x1 = stripEdgeAt(p, side, b),
          lo = Math.min(x0, x1),
          hi = Math.max(x0, x1);
        if (lo === hi) {
          const e = event(lo);
          for (let c = 0; c < 4; c++) e.value[c]! += sign * color[c]! * weight;
        } else {
          const l = event(lo),
            r = event(hi);
          for (let c = 0; c < 4; c++) {
            const slope = (sign * color[c]! * weight) / (hi - lo);
            l.slope[c]! += slope;
            r.slope[c]! -= slope;
          }
        }
      }
    }
  }
  const sorted = [...events.values()]
    .sort((a, b) => a.x - b.x)
    .filter((e) => e.value.some((v) => v !== 0) || e.slope.some((v) => v !== 0));
  if (
    base.some((v) => !Number.isFinite(v)) ||
    sorted.some(
      (e) =>
        !Number.isFinite(e.x) || e.value.some((v) => !Number.isFinite(v)) || e.slope.some((v) => !Number.isFinite(v)),
    )
  )
    throw new CourseInputError(
      'invalid_numeric_domain',
      path,
      'Strip lateral field coefficients must be finite and representable',
    );
  const key = JSON.stringify([base, sorted]);
  const data = new Float64Array(sorted.length * 9),
    values = [...base],
    slopes = [0, 0, 0, 0];
  let previous = sorted[0]?.x ?? 0;
  sorted.forEach((e, i) => {
    data[i * 9] = e.x;
    for (let c = 0; c < 4; c++) {
      values[c]! += slopes[c]! * (e.x - previous) + e.value[c]!;
      slopes[c]! += e.slope[c]!;
      data[i * 9 + 1 + c] = values[c]!;
      data[i * 9 + 5 + c] = slopes[c]!;
    }
    previous = e.x;
  });
  if (data.some((v) => !Number.isFinite(v)))
    throw new CourseInputError(
      'invalid_numeric_domain',
      path,
      'Strip lateral field integrals must be finite and representable',
    );
  // Outside all finite edges the field is constant. Remove accumulated cancellation in the final slope.
  if (sorted.length) for (let c = 0; c < 4; c++) data[(sorted.length - 1) * 9 + 5 + c] = 0;
  return { field: { base: Object.freeze(base), data, count: sorted.length }, active, key };
}

export interface StripGround {
  readonly kind: 'strips';
  readonly length: number;
  readonly slabs: readonly StripSlab[];
  readonly reader: StripGroundCellReader;
  readonly metrics: {
    readonly expandedStrips: number;
    readonly maxActiveStrips: number;
    readonly preblendCells: number;
    readonly lateralFields: number;
    readonly coefficientBytes: number;
    readonly directoryBytes: number;
  };
}

/** Caller-owned scratch; copying coefficients never exposes the compiled buffers. */
export interface StripCellTarget {
  base: number[];
  data: Float64Array;
  count: number;
  length: number;
  active: number;
}
export interface StripGroundCellReader {
  readonly levelCount: number;
  read(level: number, s: number, target: StripCellTarget): void;
}

/** Compile all s levels before driving. Storage is private; each renderer owns its sampling scratch. */
export function compileStripGround(length: number, pieces: readonly StripPiece[], path: string): StripGround {
  for (const piece of pieces)
    if (piece.value !== null && (!Number.isInteger(piece.value) || piece.value < 0 || piece.value > 32767))
      throw new RangeError('Strip color must be RGB555 or transparent');
  const slabs = resolveStripSlabs(length, pieces, null, path),
    levels: Level[] = [],
    lateralFields: StripLateralField[] = [],
    intern = new Map<string, number>();
  let cells = 0,
    coefficientBytes = 0,
    directoryBytes = 0;
  for (let step = STRIP_BASE_STEP; ; step *= 2) {
    const count = Math.ceil(length / step);
    cells += count;
    if (cells > COURSE_DOCUMENT_LIMITS.preblendCells)
      throw new RangeError(`Strip preblend cells exceed ${COURSE_DOCUMENT_LIMITS.preblendCells}`);
    const indices = new Uint32Array(count),
      active = new Uint8Array(count);
    directoryBytes += indices.byteLength + active.byteLength;
    let slab = 0;
    for (let i = 0; i < count; i++) {
      const start = i * step,
        end = Math.min(length, (i + 1) * step);
      while (slab + 1 < slabs.length && slabs[slab]!.end <= start) slab++;
      const built = lateralFieldFor(slabs, slab, start, end, path);
      let index = intern.get(built.key);
      if (index === undefined) {
        index = lateralFields.length;
        intern.set(built.key, index);
        lateralFields.push(built.field);
        coefficientBytes += built.field.data.byteLength + 32;
        if (coefficientBytes > COURSE_DOCUMENT_LIMITS.coefficientBytes)
          throw new CourseInputError(
            'resource_limit',
            path,
            `Strip coefficient storage exceeds ${COURSE_DOCUMENT_LIMITS.coefficientBytes} bytes`,
          );
      }
      indices[i] = index;
      active[i] = built.active;
    }
    levels.push({ step, indices, active });
    if (count === 1) break;
  }
  const metrics = Object.freeze({
    expandedStrips: pieces.length,
    maxActiveStrips: slabs.reduce((max, s) => Math.max(max, s.active), 0),
    preblendCells: cells,
    lateralFields: lateralFields.length,
    coefficientBytes,
    directoryBytes,
  });
  const reader: StripGroundCellReader = Object.freeze({
    levelCount: levels.length,
    read(level: number, s: number, target: StripCellTarget) {
      const input = levels[level];
      if (!input || !(s >= 0 && s <= length)) throw new RangeError('Strip cell read outside compiled field');
      const cell = Math.min(input.indices.length - 1, Math.floor(s / input.step));
      const field = lateralFields[input.indices[cell]!]!;
      const cellLength = Math.min(input.step, length - cell * input.step);
      target.length = cellLength;
      target.active = input.active[cell]!;
      target.count = field.count;
      for (let c = 0; c < 4; c++) target.base[c] = field.base[c]!;
      if (target.data.length < field.data.length)
        target.data = new Float64Array(2 ** Math.ceil(Math.log2(field.data.length)));
      target.data.set(field.data);
    },
  });
  return Object.freeze({ kind: 'strips' as const, length, slabs, metrics, reader });
}
