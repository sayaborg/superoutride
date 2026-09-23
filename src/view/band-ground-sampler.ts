import { SOURCE_ENDPOINT_TOLERANCE_METERS } from '../core/tolerances.js';
import {
  IMAGE_OPAQUE_COVERAGE,
  linearToRgb555,
  rgb555LinearChannel,
  selectImageLodLevel,
} from '../image/image-filter.js';
import { rgb555ToRgba } from '../image/rgb555.js';
import {
  BAND_ACTIVE_LIMIT,
  BAND_BASE_STEP,
  bandEdgeAt,
  type BandGround,
  type BandCellSink,
} from '../course/band-ground.js';
import type { BandRenderMethod } from './display-settings.js';

/** Numerical integration roundoff at the shared half-coverage tie, measured relative to row area. */
const COVERAGE_ROUNDOFF = 64 * Number.EPSILON;
interface BandLateralField {
  readonly count: number;
  readonly base: readonly number[];
  readonly data: Float64Array;
}
export interface BandRenderMetrics {
  activeBands: number;
  outputPixels: number;
}
export function createBandRenderMetrics(): BandRenderMetrics {
  return { activeBands: 0, outputPixels: 0 };
}
function nodeAt(field: BandLateralField, x: number): number {
  const data = field.data;
  let lo = 0,
    hi = field.count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid * 9]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
function point(field: BandLateralField, x: number, out: Float64Array) {
  const i = nodeAt(field, x) * 9;
  for (let c = 0; c < 4; c++)
    out[c]! += i < 0 ? field.base[c]! : field.data[i + 1 + c]! + field.data[i + 5 + c]! * (x - field.data[i]!);
}
/** Exact local box mean of the piecewise-affine lateral field, without global antiderivative cancellation. */
function integrate(field: BandLateralField, a: number, b: number, out: Float64Array) {
  const data = field.data;
  let index = nodeAt(field, a),
    x = a;
  while (x < b) {
    const end = Math.min(b, index + 1 < field.count ? data[(index + 1) * 9]! : Infinity);
    const weight = (end - x) / (b - a),
      i = index * 9;
    for (let c = 0; c < 4; c++) {
      const v0 = i < 0 ? field.base[c]! : data[i + 1 + c]! + data[i + 5 + c]! * (x - data[i]!);
      const v1 = i < 0 ? field.base[c]! : data[i + 1 + c]! + data[i + 5 + c]! * (end - data[i]!);
      out[c]! += (v0 + v1) * 0.5 * weight;
    }
    x = end;
    index++;
  }
}

/** One field-owned interval in the renderer's ruler; lateralOrigin maps frame l to native l. */
interface BandFieldSpan {
  readonly ground: BandGround;
  readonly frameStart: number;
  readonly nativeStart: number;
  readonly nativeEnd: number;
  readonly lateralOrigin: number;
}

/** Persistent row scratch. Cached lateral fields and the at-most-two clipped leaf ends become one lateral function. */
class BandRow {
  readonly field = { base: [0, 0, 0, 0], data: new Float64Array(9 * 256), count: 0 };
  private events = new Float64Array(9 * 256);
  private readonly order: number[] = [];
  private count = 0;
  private readonly values = new Float64Array(4);
  private readonly slopes = new Float64Array(4);
  private readonly compare = (a: number, b: number) => this.events[a * 9]! - this.events[b * 9]!;
  reset() {
    this.field.base.fill(0);
    this.field.count = 0;
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
  addCell(ground: BandGround, level: number, s: number, lateralOrigin: number) {
    let weight = 0;
    let previousX = 0;
    const previousValues = new Float64Array(4);
    const previousSlopes = new Float64Array(4);
    let first = true;
    const sink: BandCellSink = {
      base: (length, r, g, b, a) => {
        weight = length;
        const values = [r, g, b, a];
        for (let c = 0; c < 4; c++) {
          this.field.base[c]! += weight * values[c]!;
          previousValues[c] = values[c]!;
        }
      },
      node: (x, r, g, b, a, dr, dg, db, dc) => {
        const values = [r, g, b, a],
          slopes = [dr, dg, db, dc];
        const event = this.event(x - lateralOrigin);
        for (let c = 0; c < 4; c++) {
          const oldValue = first ? previousValues[c]! : previousValues[c]! + previousSlopes[c]! * (x - previousX);
          this.events[event + 1 + c] = weight * (values[c]! - oldValue);
          this.events[event + 5 + c] = weight * (slopes[c]! - previousSlopes[c]!);
          previousValues[c] = values[c]!;
          previousSlopes[c] = slopes[c]!;
        }
        previousX = x;
        first = false;
      },
    };
    const cell = ground.reader.read(level, s, sink);
    return cell.active;
  }
  addEdge(a: number, b: number, weight: number, color: number, lateralOrigin: number) {
    const r = rgb555LinearChannel(color >>> 10),
      g = rgb555LinearChannel((color >>> 5) & 31),
      blue = rgb555LinearChannel(color & 31);
    if (a === -Infinity) {
      this.field.base[0]! += weight * r;
      this.field.base[1]! += weight * g;
      this.field.base[2]! += weight * blue;
      this.field.base[3]! += weight;
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
    const field = this.field;
    if (this.count * 9 > field.data.length) field.data = new Float64Array(9 * 2 ** Math.ceil(Math.log2(this.count)));
    this.order.length = this.count;
    for (let i = 0; i < this.count; i++) this.order[i] = i;
    this.order.sort(this.compare);
    let previous = this.count ? this.events[this.order[0]! * 9]! : 0;
    const values = this.values,
      slopes = this.slopes;
    values.set(field.base);
    slopes.fill(0);
    for (let i = 0; i < this.count;) {
      const x = this.events[this.order[i]! * 9]!,
        at = field.count++ * 9;
      field.data[at] = x;
      for (let c = 0; c < 4; c++) values[c]! += slopes[c]! * (x - previous);
      do {
        const event = this.order[i++]! * 9;
        for (let c = 0; c < 4; c++) {
          values[c]! += this.events[event + 1 + c]!;
          slopes[c]! += this.events[event + 5 + c]!;
        }
      } while (i < this.count && this.events[this.order[i]! * 9] === x);
      for (let c = 0; c < 4; c++) {
        field.data[at + 1 + c] = values[c]!;
        field.data[at + 5 + c] = slopes[c]!;
      }
      previous = x;
    }
    if (field.count) for (let c = 0; c < 4; c++) field.data[(field.count - 1) * 9 + 5 + c] = 0;
    return field;
  }
}

function slabAt(slabs: BandGround['slabs'], s: number) {
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

/** The instantaneous lateral field follows already resolved span order; no event composition or sorting. */
function readPointField(
  field: { base: number[]; data: Float64Array; count: number },
  ground: BandGround,
  s: number,
  stats: BandRenderMetrics,
): BandLateralField {
  const slab = ground.slabs[slabAt(ground.slabs, s)]!;
  field.count = slab.spans.length - 1;
  stats.activeBands = Math.max(stats.activeBands, slab.active);
  for (let i = 0; i < slab.spans.length; i++) {
    const piece = slab.spans[i]!,
      color = piece.color;
    const target = i === 0 ? field.base : field.data;
    const at = i === 0 ? 0 : (i - 1) * 9 + 1;
    if (i > 0) field.data[at - 1] = bandEdgeAt(piece, 'left', s);
    target[at] = color === null ? 0 : rgb555LinearChannel(color >>> 10);
    target[at + 1] = color === null ? 0 : rgb555LinearChannel((color >>> 5) & 31);
    target[at + 2] = color === null ? 0 : rgb555LinearChannel(color & 31);
    target[at + 3] = color === null ? 0 : 1;
  }
  return field;
}

/** Each product method selects its complete longitudinal/lateral read, never independent kernels. */
export function createBandGroundSampler(intervals: readonly BandFieldSpan[]) {
  if (intervals.length === 0) throw new RangeError('Band sampling requires field-owned intervals');
  const spans = intervals.map((input, i) => {
    if (!input.ground.reader) throw new TypeError('Band sampling requires a compiled ground');
    const { frameStart, nativeStart, nativeEnd, lateralOrigin } = input;
    if (
      ![frameStart, nativeStart, nativeEnd, lateralOrigin].every(Number.isFinite) ||
      !(nativeEnd > nativeStart) ||
      nativeStart < -SOURCE_ENDPOINT_TOLERANCE_METERS ||
      nativeEnd > input.ground.length + SOURCE_ENDPOINT_TOLERANCE_METERS
    )
      throw new RangeError('Band field interval is outside its compiled ground');
    if (i > 0) {
      const prior = intervals[i - 1]!,
        end = prior.frameStart + (prior.nativeEnd - prior.nativeStart);
      if (Math.abs(frameStart - end) > SOURCE_ENDPOINT_TOLERANCE_METERS)
        throw new RangeError('Band field intervals must be contiguous and ordered');
    }
    return { ...input, frameEnd: frameStart + (nativeEnd - nativeStart) };
  });
  const row = new BandRow(),
    pointField = { base: [0, 0, 0, 0], data: new Float64Array(9 * 2 * BAND_ACTIVE_LIMIT), count: 0 },
    sample = new Float64Array(4),
    colorCache = new Float64Array([NaN, NaN, NaN, NaN, 0]);
  const first = spans[0]!.frameStart,
    last = spans.at(-1)!.frameEnd;
  const append = (span: (typeof spans)[number], start: number, end: number, stats: BandRenderMetrics) => {
    const a = Math.max(0, span.nativeStart + start - span.frameStart),
      b = Math.min(span.ground.length, span.nativeStart + end - span.frameStart);
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
      const level = Math.min(alignment, remaining);
      stats.activeBands = Math.max(stats.activeBands, row.addCell(span.ground, level, index, span.lateralOrigin));
      index += 2 ** level;
    }
    if (fullEnd * BAND_BASE_STEP < b) {
      if (b === span.ground.length) {
        stats.activeBands = Math.max(stats.activeBands, row.addCell(span.ground, 0, fullEnd, span.lateralOrigin));
      } else appendExact(row, span.ground, fullEnd * BAND_BASE_STEP, b, span.lateralOrigin, stats);
    }
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
      method: BandRenderMethod,
      stats: BandRenderMetrics,
    ) {
      let field: BandLateralField;
      let normalization = 1;
      if (method !== 'EXACT-BOX') {
        const span = spans.find((p) => p.frameEnd > s) ?? spans.at(-1)!;
        const at = Math.max(0, Math.min(span.ground.length, span.nativeStart + s - span.frameStart));
        if (method === 'LEVEL-POINT' && deltaS >= BAND_BASE_STEP) {
          const level = selectImageLodLevel(BAND_BASE_STEP / deltaS, span.ground.reader.levelCount - 1);
          pointField.count = 0;
          const selected = span.ground.reader.read(level, at, {
            base(_length, r, g, b, a) {
              pointField.base[0] = r;
              pointField.base[1] = g;
              pointField.base[2] = b;
              pointField.base[3] = a;
            },
            node(x, r, g, b, a, dr, dg, db, dc) {
              const i = pointField.count++ * 9;
              if (i + 9 > pointField.data.length) {
                const grown = new Float64Array(pointField.data.length * 2);
                grown.set(pointField.data);
                pointField.data = grown;
              }
              pointField.data.set([x, r, g, b, a, dr, dg, db, dc], i);
            },
          });
          stats.activeBands = Math.max(stats.activeBands, selected.active);
          field = pointField;
        } else field = readPointField(pointField, span.ground, at, stats);
        l += span.lateralOrigin;
      } else {
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
          const at = Math.max(0, Math.min(span.ground.length, span.nativeStart + s - span.frameStart));
          appendExact(row, span.ground, at, at, span.lateralOrigin, stats, true);
        }
        field = row.finish();
        normalization = area > 0 ? area : 1;
      }
      const width = Math.abs(stepL);
      const threshold = (IMAGE_OPAQUE_COVERAGE - COVERAGE_ROUNDOFF) * normalization;
      const support = method === 'EXACT-BOX' ? width / 2 : 0;
      for (let x = 0; x < count;) {
        const node = nodeAt(field, l - support),
          at = node * 9;
        const next = node + 1 < field.count ? field.data[(node + 1) * 9]! : Infinity;
        // A kernel wholly inside a constant span has the same integral for every covered destination pixel.
        // Skip both pixel integration and color conversion in such interiors, including transparent spans.
        if (
          stepL !== 0 &&
          l + support < next &&
          (node < 0 ||
            (field.data[at + 5] === 0 &&
              field.data[at + 6] === 0 &&
              field.data[at + 7] === 0 &&
              field.data[at + 8] === 0))
        ) {
          const boundary = stepL > 0 ? next : node < 0 ? -Infinity : field.data[at]!;
          const distance = stepL > 0 ? boundary - support - l : l - support - boundary;
          const run = Math.min(count - x, Math.max(1, Math.ceil(distance / width)));
          for (let c = 0; c < 4; c++) sample[c] = node < 0 ? field.base[c]! : field.data[at + 1 + c]!;
          writeBandPixels(pixels, offset + x, run, sample, threshold, colorCache, stats);
          x += run;
          l += stepL * run;
          continue;
        }
        sample.fill(0);
        if (method !== 'EXACT-BOX' || width === 0) point(field, l, sample);
        else integrate(field, l - width / 2, l + width / 2, sample);
        writeBandPixels(pixels, offset + x, 1, sample, threshold, colorCache, stats);
        x++;
        l += stepL;
      }
    },
  });
}

/** Premultiplied channels and opacity are normalized only after all field-owned intervals are combined. */
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
