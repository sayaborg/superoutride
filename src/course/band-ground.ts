import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { rgb555LinearChannel } from '../image/image-filter.js';

export const BAND_ACTIVE_LIMIT = COURSE_DOCUMENT_LIMITS.activeStrips;
/** Smallest cached interval in metres. */
export const BAND_BASE_STEP = 1;

/** Original affine arithmetic retained when a material edge is split at unrelated stations. */
export interface BandEdgeLine {
  readonly start: number;
  readonly end: number;
  readonly from: number;
  readonly to: number;
  /** Retain the canonical line and its exact endpoint values when subdividing. */
  readonly anchored?: true;
  readonly offset?: number;
}

/** One affine piece of an expanded Band. Null left/right denotes the corresponding open side. */
export interface BandPiece<Value = number | null> {
  readonly start: number;
  readonly end: number;
  readonly left: BandEdgeLine | null;
  readonly right: BandEdgeLine | null;
  /** Opaque cell payload; renamed in the naming stage. */
  readonly color: Value;
}
export interface BandSlab<Value = number | null> {
  readonly start: number;
  readonly end: number;
  readonly active: number;
  readonly spans: readonly BandPiece<Value>[];
}

interface BandLateralField {
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

export function bandEdgeAt(piece: BandPiece<unknown>, side: 'left' | 'right', s: number): number {
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
export function resolveBandSlabs<Value>(
  length: number,
  pieces: readonly BandPiece<Value>[],
  outside: Value,
): readonly BandSlab<Value>[] {
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('Band field length must be positive and finite');
  for (const p of pieces) {
    if (!(p.start >= 0 && p.end > p.start && p.end <= length) || !Number.isFinite(p.end))
      throw new RangeError('Expanded Band interval must lie inside the Section');
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
        throw new RangeError('Band edges must be finite affine lines or open');
    }
    if (
      bandEdgeAt(p, 'left', p.start) > bandEdgeAt(p, 'right', p.start) ||
      bandEdgeAt(p, 'left', p.end) > bandEdgeAt(p, 'right', p.end)
    )
      throw new RangeError('Band left edge cannot exceed its right edge');
  }
  const stations = [...new Set([0, length, ...pieces.flatMap((p) => [p.start, p.end])])].sort((a, b) => a - b);
  const starts = pieces.map((piece, order) => ({ piece, order })).sort((a, b) => a.piece.start - b.piece.start);
  let next = 0;
  let active: typeof starts = [];
  const slabs: BandSlab<Value>[] = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const start = stations[i]!,
      end = stations[i + 1]!;
    active = active.filter((p) => p.piece.end > start);
    while (next < starts.length && starts[next]!.piece.start <= start) active.push(starts[next++]!);
    if (active.length > BAND_ACTIVE_LIMIT)
      throw new RangeError(`Active Bands ${active.length} exceed ${BAND_ACTIVE_LIMIT} at s=${start}`);
    active.sort((a, b) => a.order - b.order);
    const edges = active.flatMap(({ piece }) =>
      (['left', 'right'] as const).filter((side) => piece[side] !== null).map((side) => ({ piece, side })),
    );
    const cuts = [start, end];
    for (let a = 0; a < edges.length; a++)
      for (let b = a + 1; b < edges.length; b++) {
        const x = edges[a]!,
          y = edges[b]!;
        const d0 = bandEdgeAt(x.piece, x.side, start) - bandEdgeAt(y.piece, y.side, start);
        const d1 = bandEdgeAt(x.piece, x.side, end) - bandEdgeAt(y.piece, y.side, end);
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
        .map((edge) => ({ ...edge, x: bandEdgeAt(edge.piece, edge.side, middle) }))
        .sort((x, y) => x.x - y.x);
      const distinct = ordered.filter((edge, index) => index === 0 || edge.x !== ordered[index - 1]!.x);
      const spans: BandPiece<Value>[] = [];
      for (let k = 0; k <= distinct.length; k++) {
        const le = distinct[k - 1],
          re = distinct[k];
        const l = le?.x ?? -Infinity,
          r = re?.x ?? Infinity;
        let color = outside;
        for (let n = active.length - 1; n >= 0; n--) {
          const p = active[n]!.piece;
          // Every edge already bounds a cell; interval containment avoids an unrepresentable interior witness.
          if (bandEdgeAt(p, 'left', middle) <= l && r <= bandEdgeAt(p, 'right', middle)) {
            color = p.color;
            break;
          }
        }
        const edgeLine = (edge: typeof le): BandEdgeLine | null => {
          if (!edge) return null;
          const line = edge.piece[edge.side]!;
          return line.anchored
            ? Object.freeze({ ...line })
            : Object.freeze({
                start: a,
                end: b,
                from: bandEdgeAt(edge.piece, edge.side, a),
                to: bandEdgeAt(edge.piece, edge.side, b),
              });
        };
        const left = edgeLine(le),
          right = edgeLine(re);
        const previous = spans.at(-1);
        if (previous && previous.color === color) spans[spans.length - 1] = { ...previous, right };
        else spans.push({ start: a, end: b, left, right, color });
      }
      slabs.push(
        Object.freeze({
          start: a,
          end: b,
          active: active.length,
          spans: Object.freeze(spans.map((p) => Object.freeze(p))),
        }),
      );
      if (slabs.length > COURSE_DOCUMENT_LIMITS.stripSlabs) throw new RangeError('Resolved Band slab limit exceeded');
    }
  }
  return Object.freeze(slabs);
}

/** Half-open station ownership, with the final slab also owning the Section terminal. */
export function bandSlabAt(slabs: readonly BandSlab<unknown>[], s: number): number {
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
export function bandSpanAt<Value>(slab: BandSlab<Value>, s: number, l: number, lateralOrigin = 0): BandPiece<Value> {
  let lo = 0,
    hi = slab.spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bandEdgeAt(slab.spans[mid]!, 'left', s) - lateralOrigin <= l) lo = mid + 1;
    else hi = mid;
  }
  return slab.spans[Math.max(0, lo - 1)]!;
}

/** Integrating an affine edge over s yields a lateral ramp, not a relocated hard edge. */
function lateralFieldFor(
  slabs: readonly BandSlab[],
  first: number,
  start: number,
  end: number,
): { field: BandLateralField; active: number; key: string } {
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
      if (p.color === null) continue;
      const color = [
        rgb555LinearChannel(p.color >>> 10),
        rgb555LinearChannel((p.color >>> 5) & 31),
        rgb555LinearChannel(p.color & 31),
        1,
      ];
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'left' ? 1 : -1;
        if (p[side] === null) {
          if (side === 'left') for (let c = 0; c < 4; c++) base[c]! += color[c]! * weight;
          continue;
        }
        const x0 = bandEdgeAt(p, side, a),
          x1 = bandEdgeAt(p, side, b),
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
    throw new RangeError('Band lateral field coefficients must be finite and representable');
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
    throw new RangeError('Band lateral field integrals must be finite and representable');
  // Outside all finite edges the field is constant. Remove accumulated cancellation in the final slope.
  if (sorted.length) for (let c = 0; c < 4; c++) data[(sorted.length - 1) * 9 + 5 + c] = 0;
  return { field: { base: Object.freeze(base), data, count: sorted.length }, active, key };
}

export interface BandGround {
  readonly kind: 'bands';
  readonly length: number;
  readonly slabs: readonly BandSlab[];
  readonly reader: BandGroundCellReader;
  readonly metrics: {
    readonly expandedBands: number;
    readonly maxActiveBands: number;
    readonly preblendCells: number;
    readonly lateralFields: number;
    readonly coefficientBytes: number;
    readonly directoryBytes: number;
  };
}

/** Caller-owned scratch; copying coefficients never exposes the compiled buffers. */
export interface BandCellTarget {
  base: number[];
  data: Float64Array;
  count: number;
  length: number;
  active: number;
}
export interface BandGroundCellReader {
  readonly levelCount: number;
  read(level: number, s: number, target: BandCellTarget): void;
}

/** Compile all s levels before driving. Storage is private; each renderer owns its sampling scratch. */
export function compileBandGround(length: number, pieces: readonly BandPiece[]): BandGround {
  for (const piece of pieces)
    if (piece.color !== null && (!Number.isInteger(piece.color) || piece.color < 0 || piece.color > 32767))
      throw new RangeError('Band color must be RGB555 or transparent');
  const slabs = resolveBandSlabs(length, pieces, null),
    levels: Level[] = [],
    lateralFields: BandLateralField[] = [],
    intern = new Map<string, number>();
  let cells = 0,
    coefficientBytes = 0,
    directoryBytes = 0;
  for (let step = BAND_BASE_STEP; ; step *= 2) {
    const count = Math.ceil(length / step);
    cells += count;
    if (cells > COURSE_DOCUMENT_LIMITS.preblendCells)
      throw new RangeError(`Band preblend cells exceed ${COURSE_DOCUMENT_LIMITS.preblendCells}`);
    const indices = new Uint32Array(count),
      active = new Uint8Array(count);
    directoryBytes += indices.byteLength + active.byteLength;
    let slab = 0;
    for (let i = 0; i < count; i++) {
      const start = i * step,
        end = Math.min(length, (i + 1) * step);
      while (slab + 1 < slabs.length && slabs[slab]!.end <= start) slab++;
      const built = lateralFieldFor(slabs, slab, start, end);
      let index = intern.get(built.key);
      if (index === undefined) {
        index = lateralFields.length;
        intern.set(built.key, index);
        lateralFields.push(built.field);
        coefficientBytes += built.field.data.byteLength + 32;
        if (coefficientBytes > COURSE_DOCUMENT_LIMITS.coefficientBytes)
          throw new RangeError(`Band coefficient storage exceeds ${COURSE_DOCUMENT_LIMITS.coefficientBytes} bytes`);
      }
      indices[i] = index;
      active[i] = built.active;
    }
    levels.push({ step, indices, active });
    if (count === 1) break;
  }
  const metrics = Object.freeze({
    expandedBands: pieces.length,
    maxActiveBands: slabs.reduce((max, s) => Math.max(max, s.active), 0),
    preblendCells: cells,
    lateralFields: lateralFields.length,
    coefficientBytes,
    directoryBytes,
  });
  const reader: BandGroundCellReader = Object.freeze({
    levelCount: levels.length,
    read(level: number, s: number, target: BandCellTarget) {
      const input = levels[level];
      if (!input || !(s >= 0 && s <= length)) throw new RangeError('Band cell read outside compiled field');
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
  return Object.freeze({ kind: 'bands' as const, length, slabs, metrics, reader });
}
