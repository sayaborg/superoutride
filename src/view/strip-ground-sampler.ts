import { IMAGE_OPAQUE_COVERAGE, linearToRgb555, selectImageLodLevel } from '../image/image-filter.js';
import { halveRgb555 } from '../image/rgb555.js';
import { STRIP_ACTIVE_LIMIT, STRIP_BASE_STEP, type StripGround, type StripCellTarget } from '../course/strip-ground.js';

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
export interface StripGroundReader {
  /**
   * Write one ground row of `count` pixels from `offset`. Its opaque pixels within `shade`, ascending disjoint
   * `[start, end)` pixel pairs counted from `offset`, are written at half brightness; transparent pixels stay unwritten.
   */
  sampleSpan(
    pixels: Uint16Array,
    offset: number,
    count: number,
    s: number,
    l: number,
    stepL: number,
    deltaS: number,
    stats: StripRenderMetrics,
    shade?: readonly number[],
  ): void;
}

/** A row with no shaded pixels. */
const NO_SHADE: readonly number[] = Object.freeze([]);

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
  /** The ground with its color pairs at their old colors, or null without pairs. */
  readonly from?: StripGround | null;
  readonly start: number;
  readonly end: number;
  readonly lateralOrigin: number;
}

/** The instantaneous lateral field follows already resolved span order; no event composition or sorting. */
function readPointField(
  field: StripCellTarget,
  ground: StripGround,
  s: number,
  stats: StripRenderMetrics,
): StripLateralField {
  ground.reader.readInstant(s, field);
  stats.activeStrips = Math.max(stats.activeStrips, field.active);
  return field;
}

/**
 * The one ground read, LEVEL-POINT: a row whose footprint reaches one metre reads one cached dyadic cell by the shared
 * image level selection, a nearer row the instantaneous Strips at s; either way the lateral read is a point at each
 * pixel centre. Within a change of sky, of share `shareAt(s)` at the row's route station, a ground with color pairs
 * mixes its old colors' field and its new colors' in linear light by that share before each pixel is rounded.
 */
export function createStripGroundSampler(
  intervals: readonly StripFieldSpan[],
  shareAt: (s: number) => number = () => 1,
) {
  const spans = intervals;
  const scratch = (): StripCellTarget => ({
    base: [0, 0, 0, 0],
    data: new Float64Array(9 * 2 * STRIP_ACTIVE_LIMIT),
    count: 0,
    active: 0,
  });
  const pointField = scratch(),
    fromField = scratch(),
    sample = new Float64Array(4),
    fromSample = new Float64Array(4),
    colorCache = new Float64Array([NaN, NaN, NaN, NaN, 0]);
  const readField = (
    ground: StripGround,
    at: number,
    deltaS: number,
    target: StripCellTarget,
    stats: StripRenderMetrics,
  ): StripLateralField => {
    if (deltaS < STRIP_BASE_STEP) return readPointField(target, ground, at, stats);
    const level = selectImageLodLevel(STRIP_BASE_STEP / deltaS, ground.reader.levelCount - 1);
    ground.reader.read(level, at, target);
    stats.activeStrips = Math.max(stats.activeStrips, target.active);
    return target;
  };
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
      stats: StripRenderMetrics,
      shade: readonly number[] = NO_SHADE,
    ) {
      const span = spanAt(s);
      const at = Math.max(0, Math.min(span.ground.length, s - span.start));
      const p = span.from ? shareAt(s) : 1;
      const field = readField(p > 0 ? span.ground : span.from!, at, deltaS, pointField, stats);
      l += span.lateralOrigin;
      const width = Math.abs(stepL);
      const threshold = IMAGE_OPAQUE_COVERAGE - COVERAGE_ROUNDOFF;
      if (p > 0 && p < 1) {
        // Both fields at each pixel centre, mixed by the share.
        const from = readField(span.from!, at, deltaS, fromField, stats);
        for (let x = 0; x < count; x++, l += stepL) {
          sample.fill(0);
          fromSample.fill(0);
          point(field, l, sample);
          point(from, l, fromSample);
          for (let c = 0; c < 4; c++) sample[c] = fromSample[c]! + p * (sample[c]! - fromSample[c]!);
          writeStripPixels(pixels, offset, x, 1, sample, threshold, colorCache, stats, shade);
        }
        return;
      }
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
          writeStripPixels(pixels, offset, x, run, sample, threshold, colorCache, stats, shade);
          x += run;
          l += stepL * run;
          continue;
        }
        sample.fill(0);
        point(field, l, sample);
        writeStripPixels(pixels, offset, x, 1, sample, threshold, colorCache, stats, shade);
        x++;
        l += stepL;
      }
    },
  });
}

/**
 * Premultiplied channels are divided by opacity only when a pixel is written; pixels `x` to `x + count` of the row at
 * `offset` within its `shade` spans take the color at half brightness.
 */
function writeStripPixels(
  pixels: Uint16Array,
  offset: number,
  x: number,
  count: number,
  sample: Float64Array,
  threshold: number,
  cache: Float64Array,
  stats: StripRenderMetrics,
  shade: readonly number[],
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
  const color = cache[4]!,
    end = x + count;
  pixels.fill(color, offset + x, offset + end);
  for (let i = 0; i < shade.length && shade[i]! < end; i += 2) {
    const from = Math.max(x, shade[i]!),
      to = Math.min(end, shade[i + 1]!);
    if (from < to) pixels.fill(halveRgb555(color), offset + from, offset + to);
  }
  stats.outputPixels += count;
}
