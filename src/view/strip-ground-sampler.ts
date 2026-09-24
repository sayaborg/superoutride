import { stripSlabAt } from '../course/strip-ground.js';
import {
  IMAGE_OPAQUE_COVERAGE,
  linearToRgb555,
  rgb555LinearChannel,
  selectImageLodLevel,
} from '../image/image-filter.js';
import { rgb555ToRgba } from '../image/rgb555.js';
import {
  STRIP_ACTIVE_LIMIT,
  STRIP_BASE_STEP,
  stripEdgeAt,
  type StripGround,
  type StripCellTarget,
} from '../course/strip-ground.js';
import type { StripRenderMethod } from './display-settings.js';

// Dimensionless coverage fraction: 64 eps (~1.42e-14) budgets rounding in the small
// polynomial/integral evaluation at the half-coverage tie, relative to row area.
const COVERAGE_ROUNDOFF = 64 * Number.EPSILON;
interface StripLateralField {
  readonly count: number;
  readonly base: readonly number[];
  readonly data: Float64Array;
}
export interface StripRenderMetrics {
  activeStrips: number;
  outputPixels: number;
}
export function createStripRenderMetrics(): StripRenderMetrics {
  return { activeStrips: 0, outputPixels: 0 };
}
function nodeAt(field: StripLateralField, x: number): number {
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
function point(field: StripLateralField, x: number, out: Float64Array) {
  const i = nodeAt(field, x) * 9;
  for (let c = 0; c < 4; c++)
    out[c]! += i < 0 ? field.base[c]! : field.data[i + 1 + c]! + field.data[i + 5 + c]! * (x - field.data[i]!);
}
/** Exact local box mean of the piecewise-affine lateral field, without global antiderivative cancellation. */
function integrate(field: StripLateralField, a: number, b: number, out: Float64Array) {
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

/** A route interval; subtract start to sample its Section ground. */
interface StripFieldSpan {
  readonly ground: StripGround;
  readonly start: number;
  readonly end: number;
  readonly lateralOrigin: number;
}

/** Persistent row scratch. Cached lateral fields and the at-most-two clipped leaf ends become one lateral function. */
class StripRow {
  readonly field = { base: [0, 0, 0, 0], data: new Float64Array(9 * 256), count: 0 };
  private events = new Float64Array(9 * 256);
  private readonly order: number[] = [];
  private count = 0;
  private readonly values = new Float64Array(4);
  private readonly slopes = new Float64Array(4);
  private readonly compare = (a: number, b: number) => this.events[a * 9]! - this.events[b * 9]!;
  private readonly cellField: StripCellTarget = {
    base: [0, 0, 0, 0],
    data: new Float64Array(9 * 256),
    count: 0,
    length: 0,
    active: 0,
  };
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
  addCell(ground: StripGround, level: number, s: number, lateralOrigin: number) {
    const cell = this.cellField;
    ground.reader.read(level, s, cell);
    const weight = cell.length;
    for (let c = 0; c < 4; c++) this.field.base[c]! += weight * cell.base[c]!;
    const data = cell.data;
    for (let i = 0; i < cell.count; i++) {
      const at = i * 9,
        previous = at - 9,
        event = this.event(data[at]! - lateralOrigin);
      for (let c = 0; c < 4; c++) {
        const oldSlope = i === 0 ? 0 : data[previous + 5 + c]!;
        const oldValue = i === 0 ? cell.base[c]! : data[previous + 1 + c]! + oldSlope * (data[at]! - data[previous]!);
        this.events[event + 1 + c] = weight * (data[at + 1 + c]! - oldValue);
        this.events[event + 5 + c] = weight * (data[at + 5 + c]! - oldSlope);
      }
    }
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

/** Only a clipped endpoint leaf uses its affine edges; full dyadic cells always reuse preblended coefficients. */
function appendExact(
  row: StripRow,
  ground: StripGround,
  start: number,
  end: number,
  lateralOrigin: number,
  stats: StripRenderMetrics,
  instant = false,
) {
  for (let i = stripSlabAt(ground.slabs, start); i < ground.slabs.length; i++) {
    const slab = ground.slabs[i]!;
    if (!instant && slab.start >= end) break;
    const a = Math.max(start, slab.start),
      b = Math.min(end, slab.end),
      weight = instant ? 1 : b - a;
    if (!(weight > 0)) continue;
    stats.activeStrips = Math.max(stats.activeStrips, slab.active);
    for (const piece of slab.spans)
      if (piece.value !== null) {
        row.addEdge(stripEdgeAt(piece, 'left', a), stripEdgeAt(piece, 'left', b), weight, piece.value, lateralOrigin);
        row.addEdge(
          stripEdgeAt(piece, 'right', a),
          stripEdgeAt(piece, 'right', b),
          -weight,
          piece.value,
          lateralOrigin,
        );
      }
    if (instant) break;
  }
}

/** The instantaneous lateral field follows already resolved span order; no event composition or sorting. */
function readPointField(
  field: { base: number[]; data: Float64Array; count: number },
  ground: StripGround,
  s: number,
  stats: StripRenderMetrics,
): StripLateralField {
  const slab = ground.slabs[stripSlabAt(ground.slabs, s)]!;
  field.count = slab.spans.length - 1;
  stats.activeStrips = Math.max(stats.activeStrips, slab.active);
  for (let i = 0; i < slab.spans.length; i++) {
    const piece = slab.spans[i]!,
      color = piece.value;
    const target = i === 0 ? field.base : field.data;
    const at = i === 0 ? 0 : (i - 1) * 9 + 1;
    if (i > 0) field.data[at - 1] = stripEdgeAt(piece, 'left', s);
    target[at] = color === null ? 0 : rgb555LinearChannel(color >>> 10);
    target[at + 1] = color === null ? 0 : rgb555LinearChannel((color >>> 5) & 31);
    target[at + 2] = color === null ? 0 : rgb555LinearChannel(color & 31);
    target[at + 3] = color === null ? 0 : 1;
    if (i > 0) field.data.fill(0, at + 4, at + 8);
  }
  return field;
}

/** Each product method selects its complete longitudinal/lateral read, never independent kernels. */
export function createStripGroundSampler(intervals: readonly StripFieldSpan[]) {
  const spans = intervals;
  const row = new StripRow(),
    pointField: StripCellTarget = {
      base: [0, 0, 0, 0],
      data: new Float64Array(9 * 2 * STRIP_ACTIVE_LIMIT),
      count: 0,
      length: 0,
      active: 0,
    },
    sample = new Float64Array(4),
    colorCache = new Float64Array([NaN, NaN, NaN, NaN, 0]);
  const first = spans[0]!.start,
    last = spans.at(-1)!.end;
  const spanAt = (s: number) => {
    let lo = 0,
      hi = spans.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (spans[mid]!.end > s) hi = mid;
      else lo = mid + 1;
    }
    return spans[Math.min(lo, spans.length - 1)]!;
  };
  const append = (span: (typeof spans)[number], start: number, end: number, stats: StripRenderMetrics) => {
    const a = Math.max(0, start - span.start),
      b = Math.min(span.ground.length, end - span.start);
    const fullStart = Math.ceil(a / STRIP_BASE_STEP),
      fullEnd = Math.floor(b / STRIP_BASE_STEP);
    if (fullEnd <= fullStart) {
      appendExact(row, span.ground, a, b, span.lateralOrigin, stats);
      return b - a;
    }
    if (fullStart * STRIP_BASE_STEP > a)
      appendExact(row, span.ground, a, fullStart * STRIP_BASE_STEP, span.lateralOrigin, stats);
    for (let index = fullStart; index < fullEnd;) {
      const remaining = Math.floor(Math.log2(fullEnd - index));
      const alignment = index === 0 ? remaining : Math.log2(index & -index);
      const level = Math.min(alignment, remaining);
      stats.activeStrips = Math.max(stats.activeStrips, row.addCell(span.ground, level, index, span.lateralOrigin));
      index += 2 ** level;
    }
    if (fullEnd * STRIP_BASE_STEP < b) {
      if (b === span.ground.length) {
        stats.activeStrips = Math.max(stats.activeStrips, row.addCell(span.ground, 0, fullEnd, span.lateralOrigin));
      } else appendExact(row, span.ground, fullEnd * STRIP_BASE_STEP, b, span.lateralOrigin, stats);
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
      method: StripRenderMethod,
      stats: StripRenderMetrics,
    ) {
      let field: StripLateralField;
      let normalization = 1;
      if (method !== 'EXACT-BOX') {
        const span = spanAt(s);
        const at = Math.max(0, Math.min(span.ground.length, s - span.start));
        if (method === 'LEVEL-POINT' && deltaS >= STRIP_BASE_STEP) {
          const level = selectImageLodLevel(STRIP_BASE_STEP / deltaS, span.ground.reader.levelCount - 1);
          span.ground.reader.read(level, at, pointField);
          stats.activeStrips = Math.max(stats.activeStrips, pointField.active);
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
            const a = Math.max(start, span.start),
              b = Math.min(end, span.end);
            if (b > a) area += append(span, a, b, stats);
          }
        } else {
          const span = spanAt(s);
          const at = Math.max(0, Math.min(span.ground.length, s - span.start));
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
          writeStripPixels(pixels, offset + x, run, sample, threshold, colorCache, stats);
          x += run;
          l += stepL * run;
          continue;
        }
        sample.fill(0);
        if (method !== 'EXACT-BOX' || width === 0) point(field, l, sample);
        else integrate(field, l - width / 2, l + width / 2, sample);
        writeStripPixels(pixels, offset + x, 1, sample, threshold, colorCache, stats);
        x++;
        l += stepL;
      }
    },
  });
}

/** Premultiplied channels and opacity are normalized only after all field-owned intervals are combined. */
function writeStripPixels(
  pixels: Uint32Array,
  offset: number,
  count: number,
  sample: Float64Array,
  threshold: number,
  cache: Float64Array,
  stats: StripRenderMetrics,
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
