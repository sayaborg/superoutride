import { stripEdgeAt, stripSlabAt } from '../course/strip-slabs.js';
import {
  IMAGE_OPAQUE_COVERAGE,
  linearToRgb555,
  rgb555LinearChannel,
  selectImageLodLevel,
} from '../image/image-filter.js';
import { STRIP_ACTIVE_LIMIT, STRIP_BASE_STEP, type StripGround, type StripCellTarget } from '../course/strip-ground.js';
import type { StripRenderMethod } from './display-settings.js';

// Dimensionless coverage fraction: 64 eps (~1.42e-14) budgets rounding in the affine
// point evaluation at the half-coverage tie.
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
/** A route interval; subtract start to sample its Section ground. */
interface StripFieldSpan {
  readonly ground: StripGround;
  readonly start: number;
  readonly end: number;
  readonly lateralOrigin: number;
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
  const pointField: StripCellTarget = {
      base: [0, 0, 0, 0],
      data: new Float64Array(9 * 2 * STRIP_ACTIVE_LIMIT),
      count: 0,
      active: 0,
    },
    sample = new Float64Array(4),
    colorCache = new Float64Array([NaN, NaN, NaN, NaN, 0]);
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
  return Object.freeze({
    sampleSpan(
      pixels: Uint16Array,
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
      const span = spanAt(s);
      const at = Math.max(0, Math.min(span.ground.length, s - span.start));
      if ((method === 'LEVEL-POINT' || method === 'LEVEL2-POINT') && deltaS >= STRIP_BASE_STEP) {
        const level = selectImageLodLevel(STRIP_BASE_STEP / deltaS, span.ground.reader.levelCount - 1);
        // LEVEL2-POINT reads, from the level's aligned and half-shifted cells, the one centered nearest the row.
        if (method === 'LEVEL2-POINT') span.ground.reader.readCentered(level, at, pointField);
        else span.ground.reader.read(level, at, pointField);
        stats.activeStrips = Math.max(stats.activeStrips, pointField.active);
        field = pointField;
      } else field = readPointField(pointField, span.ground, at, stats);
      l += span.lateralOrigin;
      const width = Math.abs(stepL);
      const threshold = IMAGE_OPAQUE_COVERAGE - COVERAGE_ROUNDOFF;
      for (let x = 0; x < count;) {
        const node = nodeAt(field, l),
          at = node * 9;
        const next = node + 1 < field.count ? field.data[(node + 1) * 9]! : Infinity;
        // A constant span has the same value for every covered destination pixel.
        // Skip both point evaluation and color conversion in such interiors, including transparent spans.
        if (
          stepL !== 0 &&
          l < next &&
          (node < 0 ||
            (field.data[at + 5] === 0 &&
              field.data[at + 6] === 0 &&
              field.data[at + 7] === 0 &&
              field.data[at + 8] === 0))
        ) {
          const boundary = stepL > 0 ? next : node < 0 ? -Infinity : field.data[at]!;
          const distance = stepL > 0 ? boundary - l : l - boundary;
          const run = Math.min(count - x, Math.max(1, Math.ceil(distance / width)));
          for (let c = 0; c < 4; c++) sample[c] = node < 0 ? field.base[c]! : field.data[at + 1 + c]!;
          writeStripPixels(pixels, offset + x, run, sample, threshold, colorCache, stats);
          x += run;
          l += stepL * run;
          continue;
        }
        sample.fill(0);
        point(field, l, sample);
        writeStripPixels(pixels, offset + x, 1, sample, threshold, colorCache, stats);
        x++;
        l += stepL;
      }
    },
  });
}

/** Premultiplied channels are divided by opacity only when a pixel is written. */
function writeStripPixels(
  pixels: Uint16Array,
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
    cache[4] = linearToRgb555(r / a, g / a, b / a);
    cache[0] = r;
    cache[1] = g;
    cache[2] = b;
    cache[3] = a;
  }
  pixels.fill(cache[4]!, offset, offset + count);
  stats.outputPixels += count;
}
