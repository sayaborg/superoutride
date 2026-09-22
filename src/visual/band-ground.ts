import { SOURCE_ENDPOINT_TOLERANCE_METERS } from '../core/tolerances.js';
import { IMAGE_OPAQUE_COVERAGE, linearToRgb555, rgb555LinearChannel } from '../graphics/image-filter.js';
import { rgb555ToRgba } from '../graphics/rgb555.js';

export const BAND_FILTERS = Object.freeze(['POINT', 'BOX', 'TENT'] as const);
export type BandFilter = (typeof BAND_FILTERS)[number];
export const BAND_DEFAULT_FILTER: BandFilter = 'BOX';
export const BAND_ACTIVE_LIMIT = 64;
/** Smallest cached interval in metres; partial ends use exact resolved edges, not resampled cells. */
export const BAND_BASE_STEP = 1;
const MAX_CELLS = 1_048_576;
const MAX_COEFFICIENT_BYTES = 64 * 1024 * 1024;
/** Numerical integration roundoff at the shared half-coverage tie, measured relative to row area. */
const COVERAGE_ROUNDOFF = 64 * Number.EPSILON;

/** One affine piece of an expanded Band. Null left/right denotes the corresponding open side. */
export interface BandPiece {
  readonly start: number;
  readonly end: number;
  readonly left: number | null;
  readonly right: number | null;
  readonly leftEnd: number | null;
  readonly rightEnd: number | null;
  readonly color: number | null;
}
export interface BandSlab {
  readonly start: number;
  readonly end: number;
  readonly active: number;
  readonly spans: readonly BandPiece[];
}

export interface BandRenderMetrics {
  activeBands: number;
  preblendLevel: number;
  profileSegments: number;
  outputPixels: number;
}
export function createBandRenderMetrics(): BandRenderMetrics {
  return { activeBands: 0, preblendLevel: 0, profileSegments: 0, outputPixels: 0 };
}

interface Profile {
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

export function bandEdgeAt(piece: BandPiece, side: 'left' | 'right', s: number): number {
  const a = piece[side],
    b = piece[side === 'left' ? 'leftEnd' : 'rightEnd'];
  return a === null
    ? side === 'left'
      ? -Infinity
      : Infinity
    : a + (b! - a) * ((s - piece.start) / (piece.end - piece.start));
}

/** Split first at activation/knots, then at every affine edge crossing; declaration order remains authoritative. */
export function resolveBandSlabs(length: number, pieces: readonly BandPiece[]): readonly BandSlab[] {
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('Band field length must be positive and finite');
  for (const p of pieces) {
    if (!(p.start >= 0 && p.end > p.start && p.end <= length) || !Number.isFinite(p.end))
      throw new RangeError('Expanded Band interval must lie inside the Section');
    for (const side of ['left', 'right'] as const) {
      const a = p[side],
        b = p[side === 'left' ? 'leftEnd' : 'rightEnd'];
      if ((a === null) !== (b === null) || (a !== null && (!Number.isFinite(a) || !Number.isFinite(b))))
        throw new RangeError('Band edges are finite affine values or consistently open');
    }
    if (
      bandEdgeAt(p, 'left', p.start) > bandEdgeAt(p, 'right', p.start) ||
      bandEdgeAt(p, 'left', p.end) > bandEdgeAt(p, 'right', p.end)
    )
      throw new RangeError('Band left edge cannot exceed its right edge');
    if (p.color !== null && (!Number.isInteger(p.color) || p.color < 0 || p.color > 32767))
      throw new RangeError('Band color must be RGB555 or transparent');
  }
  const stations = [...new Set([0, length, ...pieces.flatMap((p) => [p.start, p.end])])].sort((a, b) => a - b);
  const starts = pieces.map((piece, order) => ({ piece, order })).sort((a, b) => a.piece.start - b.piece.start);
  let next = 0;
  let active: typeof starts = [];
  const slabs: BandSlab[] = [];
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
      const spans: BandPiece[] = [];
      for (let k = 0; k <= distinct.length; k++) {
        const le = distinct[k - 1],
          re = distinct[k];
        const l = le?.x ?? -Infinity,
          r = re?.x ?? Infinity;
        const witness = !Number.isFinite(l)
          ? !Number.isFinite(r)
            ? 0
            : r - 1
          : !Number.isFinite(r)
            ? l + 1
            : l + (r - l) / 2;
        let color: number | null = null;
        for (let n = active.length - 1; n >= 0; n--) {
          const p = active[n]!.piece;
          if (bandEdgeAt(p, 'left', middle) <= witness && witness < bandEdgeAt(p, 'right', middle)) {
            color = p.color;
            break;
          }
        }
        const left = le ? bandEdgeAt(le.piece, le.side, a) : null;
        const right = re ? bandEdgeAt(re.piece, re.side, a) : null;
        const leftEnd = le ? bandEdgeAt(le.piece, le.side, b) : null;
        const rightEnd = re ? bandEdgeAt(re.piece, re.side, b) : null;
        const previous = spans.at(-1);
        if (previous && previous.color === color) spans[spans.length - 1] = { ...previous, right, rightEnd };
        else spans.push({ start: a, end: b, left, right, leftEnd, rightEnd, color });
      }
      slabs.push(
        Object.freeze({
          start: a,
          end: b,
          active: active.length,
          spans: Object.freeze(spans.map((p) => Object.freeze(p))),
        }),
      );
      if (slabs.length > MAX_CELLS) throw new RangeError('Resolved Band slab limit exceeded');
    }
  }
  return Object.freeze(slabs);
}

/** Integrating an affine edge over s yields a lateral ramp, not a relocated hard edge. */
function profileFor(
  slabs: readonly BandSlab[],
  first: number,
  start: number,
  end: number,
): { profile: Profile; active: number; key: string } {
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
    throw new RangeError('Band profile coefficients must be finite and representable');
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
    throw new RangeError('Band profile integrals must be finite and representable');
  // Outside all finite edges the field is constant. Remove accumulated cancellation in the final slope.
  if (sorted.length) for (let c = 0; c < 4; c++) data[(sorted.length - 1) * 9 + 5 + c] = 0;
  return { profile: { base: Object.freeze(base), data, count: sorted.length }, active, key };
}

function nodeAt(profile: Profile, x: number): number {
  const data = profile.data;
  let lo = 0,
    hi = profile.count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid * 9]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
function point(profile: Profile, x: number, out: Float64Array, weight: number, stats: BandRenderMetrics) {
  const i = nodeAt(profile, x) * 9;
  stats.profileSegments++;
  for (let c = 0; c < 4; c++)
    out[c]! +=
      weight *
      (i < 0 ? profile.base[c]! : profile.data[i + 1 + c]! + profile.data[i + 5 + c]! * (x - profile.data[i]!));
}
/** Stable local integration of two affine functions; no cancellation of large global antiderivatives. */
function integrate(
  profile: Profile,
  a: number,
  b: number,
  ka: number,
  kb: number,
  out: Float64Array,
  weight: number,
  stats: BandRenderMetrics,
) {
  const data = profile.data;
  let index = nodeAt(profile, a),
    x = a;
  while (x < b) {
    const end = Math.min(b, index + 1 < profile.count ? data[(index + 1) * 9]! : Infinity);
    const t0 = (x - a) / (b - a),
      t1 = (end - a) / (b - a),
      k0 = ka + (kb - ka) * t0,
      k1 = ka + (kb - ka) * t1;
    const extent = end - x,
      i = index * 9;
    for (let c = 0; c < 4; c++) {
      const v0 = i < 0 ? profile.base[c]! : data[i + 1 + c]! + data[i + 5 + c]! * (x - data[i]!);
      const v1 = i < 0 ? profile.base[c]! : data[i + 1 + c]! + data[i + 5 + c]! * (end - data[i]!);
      out[c]! += weight * (((v0 * (2 * k0 + k1) + v1 * (k0 + 2 * k1)) * extent) / 6);
    }
    stats.profileSegments++;
    x = end;
    index++;
  }
}

export interface BandGround {
  readonly kind: 'bands';
  readonly length: number;
  readonly slabs: readonly BandSlab[];
  readonly metrics: {
    readonly expandedBands: number;
    readonly maxActiveBands: number;
    readonly preblendCells: number;
    readonly profiles: number;
    readonly coefficientBytes: number;
    readonly directoryBytes: number;
  };
}

/** Compile all s levels before driving. Storage is private; each renderer owns its sampling scratch. */
export function compileBandGround(length: number, pieces: readonly BandPiece[]): BandGround {
  const slabs = resolveBandSlabs(length, pieces),
    levels: Level[] = [],
    profiles: Profile[] = [],
    intern = new Map<string, number>();
  let cells = 0,
    coefficientBytes = 0,
    directoryBytes = 0;
  for (let step = BAND_BASE_STEP; ; step *= 2) {
    const count = Math.floor(length / step);
    if (count === 0) break;
    cells += count;
    if (cells > MAX_CELLS) throw new RangeError(`Band preblend cells exceed ${MAX_CELLS}`);
    const indices = new Uint32Array(count),
      active = new Uint8Array(count);
    directoryBytes += indices.byteLength + active.byteLength;
    let slab = 0;
    for (let i = 0; i < count; i++) {
      const start = i * step,
        end = Math.min(length, (i + 1) * step);
      while (slab + 1 < slabs.length && slabs[slab]!.end <= start) slab++;
      const built = profileFor(slabs, slab, start, end);
      let index = intern.get(built.key);
      if (index === undefined) {
        index = profiles.length;
        intern.set(built.key, index);
        profiles.push(built.profile);
        coefficientBytes += built.profile.data.byteLength + 32;
        if (coefficientBytes > MAX_COEFFICIENT_BYTES) throw new RangeError('Band coefficient storage exceeds 64 MiB');
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
    profiles: profiles.length,
    coefficientBytes,
    directoryBytes,
  });
  const ground = Object.freeze({ kind: 'bands' as const, length, slabs, metrics });
  storage.set(ground, { levels, profiles });
  return ground;
}

/** Private compiled coefficients never escape through a callback, mutable collection or typed-array view. */
const storage = new WeakMap<BandGround, { readonly levels: readonly Level[]; readonly profiles: readonly Profile[] }>();

/** One source-owned interval in the renderer's ruler; lateralOrigin maps view l to source l. */
export interface BandSourceSpan {
  readonly ground: BandGround;
  readonly frameStart: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly lateralOrigin: number;
}

/** Persistent row scratch. Cached profiles and the at-most-two clipped leaf ends become one lateral function. */
class BandRow {
  readonly profile = { base: [0, 0, 0, 0], data: new Float64Array(9 * 256), count: 0 };
  private events = new Float64Array(9 * 256);
  private readonly order: number[] = [];
  private count = 0;
  private readonly values = new Float64Array(4);
  private readonly slopes = new Float64Array(4);
  private readonly compare = (a: number, b: number) => this.events[a * 9]! - this.events[b * 9]!;
  reset() {
    this.profile.base.fill(0);
    this.profile.count = 0;
    this.count = 0;
  }
  private event(x: number) {
    if ((this.count + 1) * 9 > this.events.length) {
      const next = new Float64Array(this.events.length * 2);
      next.set(this.events);
      this.events = next;
    }
    const i = this.count++ * 9;
    this.events.fill(0, i, i + 9);
    this.events[i] = x;
    return i;
  }
  addProfile(profile: Profile, weight: number, lateralOrigin: number) {
    for (let c = 0; c < 4; c++) this.profile.base[c]! += weight * profile.base[c]!;
    const d = profile.data;
    for (let i = 0; i < profile.count; i++) {
      const at = i * 9,
        previous = at - 9,
        event = this.event(d[at]! - lateralOrigin);
      for (let c = 0; c < 4; c++) {
        const oldSlope = i === 0 ? 0 : d[previous + 5 + c]!;
        const oldValue = i === 0 ? profile.base[c]! : d[previous + 1 + c]! + oldSlope * (d[at]! - d[previous]!);
        this.events[event + 1 + c] = weight * (d[at + 1 + c]! - oldValue);
        this.events[event + 5 + c] = weight * (d[at + 5 + c]! - oldSlope);
      }
    }
  }
  addEdge(a: number, b: number, weight: number, color: number, lateralOrigin: number) {
    const r = rgb555LinearChannel(color >>> 10),
      g = rgb555LinearChannel((color >>> 5) & 31),
      blue = rgb555LinearChannel(color & 31);
    if (a === -Infinity) {
      this.profile.base[0]! += weight * r;
      this.profile.base[1]! += weight * g;
      this.profile.base[2]! += weight * blue;
      this.profile.base[3]! += weight;
      return;
    }
    if (a === Infinity) return;
    const lo = Math.min(a, b) - lateralOrigin,
      hi = Math.max(a, b) - lateralOrigin;
    const first = this.event(lo);
    if (lo === hi) {
      this.events[first + 1] = weight * r;
      this.events[first + 2] = weight * g;
      this.events[first + 3] = weight * blue;
      this.events[first + 4] = weight;
    } else {
      const last = this.event(hi),
        slope = weight / (hi - lo);
      this.events[first + 5] = slope * r;
      this.events[first + 6] = slope * g;
      this.events[first + 7] = slope * blue;
      this.events[first + 8] = slope;
      for (let c = 0; c < 4; c++) this.events[last + 5 + c] = -this.events[first + 5 + c]!;
    }
  }
  finish() {
    const profile = this.profile;
    if (this.count * 9 > profile.data.length)
      profile.data = new Float64Array(9 * 2 ** Math.ceil(Math.log2(this.count)));
    this.order.length = this.count;
    for (let i = 0; i < this.count; i++) this.order[i] = i;
    this.order.sort(this.compare);
    let previous = this.count ? this.events[this.order[0]! * 9]! : 0;
    const values = this.values,
      slopes = this.slopes;
    values.set(profile.base);
    slopes.fill(0);
    for (let i = 0; i < this.count;) {
      const x = this.events[this.order[i]! * 9]!,
        at = profile.count++ * 9;
      profile.data[at] = x;
      for (let c = 0; c < 4; c++) values[c]! += slopes[c]! * (x - previous);
      do {
        const event = this.order[i++]! * 9;
        for (let c = 0; c < 4; c++) {
          values[c]! += this.events[event + 1 + c]!;
          slopes[c]! += this.events[event + 5 + c]!;
        }
      } while (i < this.count && this.events[this.order[i]! * 9] === x);
      for (let c = 0; c < 4; c++) {
        profile.data[at + 1 + c] = values[c]!;
        profile.data[at + 5 + c] = slopes[c]!;
      }
      previous = x;
    }
    if (profile.count) for (let c = 0; c < 4; c++) profile.data[(profile.count - 1) * 9 + 5 + c] = 0;
    return profile;
  }
}

function slabAt(slabs: readonly BandSlab[], s: number) {
  let lo = 0,
    hi = slabs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (slabs[mid]!.start <= s) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

/** Only a clipped endpoint leaf uses its affine edges; full dyadic cells always reuse preblended coefficients. */
function appendExact(
  row: BandRow,
  ground: BandGround,
  start: number,
  end: number,
  lateralOrigin: number,
  stats: BandRenderMetrics,
  instant = false,
) {
  for (let i = slabAt(ground.slabs, start); i < ground.slabs.length; i++) {
    const slab = ground.slabs[i]!;
    if (!instant && slab.start >= end) break;
    const a = Math.max(start, slab.start),
      b = Math.min(end, slab.end),
      weight = instant ? 1 : b - a;
    if (!(weight > 0)) continue;
    stats.activeBands = Math.max(stats.activeBands, slab.active);
    for (const piece of slab.spans)
      if (piece.color !== null) {
        row.addEdge(bandEdgeAt(piece, 'left', a), bandEdgeAt(piece, 'left', b), weight, piece.color, lateralOrigin);
        row.addEdge(bandEdgeAt(piece, 'right', a), bandEdgeAt(piece, 'right', b), -weight, piece.color, lateralOrigin);
      }
    if (instant) break;
  }
}

/** Sampling is independent of how the requested interval decomposes, so changing the dyadic level cannot relocate edges. */
export function createBandGroundSampler(sources: readonly BandSourceSpan[]) {
  if (sources.length === 0) throw new RangeError('Band sampling requires source-owned intervals');
  const spans = sources.map((source, i) => {
    const product = storage.get(source.ground);
    if (!product) throw new TypeError('Band sampling requires a compiled ground');
    const { frameStart, sourceStart, sourceEnd, lateralOrigin } = source;
    if (
      ![frameStart, sourceStart, sourceEnd, lateralOrigin].every(Number.isFinite) ||
      !(sourceEnd > sourceStart) ||
      sourceStart < -SOURCE_ENDPOINT_TOLERANCE_METERS ||
      sourceEnd > source.ground.length + SOURCE_ENDPOINT_TOLERANCE_METERS
    )
      throw new RangeError('Band source interval is outside its compiled ground');
    if (i > 0) {
      const prior = sources[i - 1]!,
        end = prior.frameStart + (prior.sourceEnd - prior.sourceStart);
      if (Math.abs(frameStart - end) > SOURCE_ENDPOINT_TOLERANCE_METERS)
        throw new RangeError('Band source intervals must be contiguous and ordered');
    }
    return { ...source, frameEnd: frameStart + (sourceEnd - sourceStart), ...product };
  });
  const row = new BandRow(),
    sample = new Float64Array(4),
    colorCache = new Float64Array([NaN, NaN, NaN, NaN, 0]);
  const first = spans[0]!.frameStart,
    last = spans.at(-1)!.frameEnd;
  const append = (span: (typeof spans)[number], start: number, end: number, stats: BandRenderMetrics) => {
    const a = Math.max(0, span.sourceStart + start - span.frameStart),
      b = Math.min(span.ground.length, span.sourceStart + end - span.frameStart);
    const fullStart = Math.ceil(a / BAND_BASE_STEP),
      fullEnd = Math.floor(b / BAND_BASE_STEP);
    if (fullEnd <= fullStart) {
      appendExact(row, span.ground, a, b, span.lateralOrigin, stats);
      return b - a;
    }
    if (fullStart * BAND_BASE_STEP > a)
      appendExact(row, span.ground, a, fullStart * BAND_BASE_STEP, span.lateralOrigin, stats);
    for (let index = fullStart; index < fullEnd;) {
      const remaining = Math.floor(Math.log2(fullEnd - index));
      const alignment = index === 0 ? remaining : Math.log2(index & -index);
      const level = Math.min(alignment, remaining),
        source = span.levels[level]!,
        cell = index / 2 ** level;
      row.addProfile(span.profiles[source.indices[cell]!]!, source.step, span.lateralOrigin);
      stats.activeBands = Math.max(stats.activeBands, source.active[cell]!);
      stats.preblendLevel = Math.max(stats.preblendLevel, level);
      index += 2 ** level;
    }
    if (fullEnd * BAND_BASE_STEP < b)
      appendExact(row, span.ground, fullEnd * BAND_BASE_STEP, b, span.lateralOrigin, stats);
    return b - a;
  };
  return Object.freeze({
    sampleSpan(
      pixels: Uint32Array,
      offset: number,
      count: number,
      s: number,
      l: number,
      stepL: number,
      deltaS: number,
      filter: BandFilter,
      stats: BandRenderMetrics,
    ) {
      row.reset();
      const start = Math.max(first, s - deltaS / 2),
        end = Math.min(last, s + deltaS / 2);
      let area = 0;
      if (end > start) {
        for (const span of spans) {
          const a = Math.max(start, span.frameStart),
            b = Math.min(end, span.frameEnd);
          if (b > a) area += append(span, a, b, stats);
        }
      } else {
        const span = spans.find((p) => p.frameEnd > s) ?? spans.at(-1)!;
        const at = Math.max(0, Math.min(span.ground.length, span.sourceStart + s - span.frameStart));
        appendExact(row, span.ground, at, at, span.lateralOrigin, stats, true);
      }
      const profile = row.finish(),
        width = Math.abs(stepL),
        normalization = area > 0 ? area : 1;
      const threshold = (IMAGE_OPAQUE_COVERAGE - COVERAGE_ROUNDOFF) * normalization;
      const support = filter === 'POINT' ? 0 : filter === 'BOX' ? width / 2 : width;
      for (let x = 0; x < count;) {
        const node = nodeAt(profile, l - support),
          at = node * 9;
        const next = node + 1 < profile.count ? profile.data[(node + 1) * 9]! : Infinity;
        // A kernel wholly inside a constant span has the same integral for every covered destination pixel.
        // Skip both pixel integration and color conversion in such interiors, including transparent spans.
        if (
          stepL !== 0 &&
          l + support < next &&
          (node < 0 ||
            (profile.data[at + 5] === 0 &&
              profile.data[at + 6] === 0 &&
              profile.data[at + 7] === 0 &&
              profile.data[at + 8] === 0))
        ) {
          const boundary = stepL > 0 ? next : node < 0 ? -Infinity : profile.data[at]!;
          const distance = stepL > 0 ? boundary - support - l : l - support - boundary;
          const run = Math.min(count - x, Math.max(1, Math.ceil(distance / width)));
          for (let c = 0; c < 4; c++) sample[c] = node < 0 ? profile.base[c]! : profile.data[at + 1 + c]!;
          stats.profileSegments++;
          writeBandPixels(pixels, offset + x, run, sample, threshold, colorCache, stats);
          x += run;
          l += stepL * run;
          continue;
        }
        sample.fill(0);
        if (filter === 'POINT' || width === 0) point(profile, l, sample, 1, stats);
        else if (filter === 'BOX')
          integrate(profile, l - width / 2, l + width / 2, 1 / width, 1 / width, sample, 1, stats);
        else {
          integrate(profile, l - width, l, 0, 1 / width, sample, 1, stats);
          integrate(profile, l, l + width, 1 / width, 0, sample, 1, stats);
        }
        writeBandPixels(pixels, offset + x, 1, sample, threshold, colorCache, stats);
        x++;
        l += stepL;
      }
    },
  });
}

/** Premultiplied channels and opacity are normalized only after all source-owned intervals are combined. */
function writeBandPixels(
  pixels: Uint32Array,
  offset: number,
  count: number,
  sample: Float64Array,
  threshold: number,
  cache: Float64Array,
  stats: BandRenderMetrics,
) {
  const a = sample[3]!;
  if (a < threshold) return;
  const r = sample[0]!,
    g = sample[1]!,
    b = sample[2]!;
  if (r !== cache[0] || g !== cache[1] || b !== cache[2] || a !== cache[3]) {
    cache[4] = rgb555ToRgba(linearToRgb555(r / a, g / a, b / a));
    cache[0] = r;
    cache[1] = g;
    cache[2] = b;
    cache[3] = a;
  }
  pixels.fill(cache[4]!, offset, offset + count);
  stats.outputPixels += count;
}
