import {
  IMAGE_OPAQUE_COVERAGE,
  imageLodExponent,
  linearToRgb555,
  rgb555LinearChannel,
} from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';

const rgba = Uint32Array.from({ length: 32768 }, (_, color) => rgb555ToRgba(color));

function pair(level, s, out) {
  let lo = 0,
    hi = level.bucketCount - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (level.centerAt(mid) <= s) lo = mid;
    else hi = mid;
  }
  if (s <= level.centerAt(0)) lo = hi = 0;
  else if (s >= level.centerAt(level.bucketCount - 1)) lo = hi = level.bucketCount - 1;
  const t = lo === hi ? 0 : (s - level.centerAt(lo)) / (level.centerAt(hi) - level.centerAt(lo));
  out.first = level.rowAt(lo);
  out.last = level.rowAt(hi);
  out.weight = t;
}

/** Constant-size row/level selection; caller retains the mutable observation apart from compiled rows. */
function cursor() {
  return { first: null, last: null, weight: 0, levelWeight: 0, frameWeight: 0, u: 0, stepU: 0 };
}

function lateralValues(row, u, out) {
  const position = Math.max(0, Math.min(row.length + 1, u * row.length + 0.5));
  const first = Math.floor(position),
    last = Math.min(row.length + 1, first + 1);
  out.a = row.valueAt(first);
  out.b = row.valueAt(last);
  out.weight = position - first;
}

/** Far interpolation in linear light and premultiplied coverage. No raw Band or area oracle access. */
export function createFilteredBandRaster(width) {
  const sums = new Float64Array(width * 4),
    cursors = [],
    pool = [];
  const edges = { left: 0, right: 0 },
    values = { a: 0, b: 0, weight: 0 };
  function add(word, weight, offset) {
    const coverage = ((word >>> 16) / 255) * weight,
      color = word & 32767;
    sums[offset] += coverage;
    sums[offset + 1] += coverage * rgb555LinearChannel(color >>> 10);
    sums[offset + 2] += coverage * rgb555LinearChannel((color >>> 5) & 31);
    sums[offset + 3] += coverage * rgb555LinearChannel(color & 31);
  }
  return Object.freeze({
    copyObservation(out) {
      if (out.length < sums.length) throw new RangeError('Observation buffer is too small');
      out.set(sums);
    },
    sample(pixels, offset, count, start, end, station, lateral, stepL, spans, trace) {
      if (!(end > start) || !(stepL > 0) || count > width) throw new RangeError('Invalid far-row footprint');
      cursors.length = 0;
      const exponent = imageLodExponent((end - start) / 1.6);
      if (trace) {
        trace.sections = 0;
        trace.rowReads = 0;
        trace.lateralSamples = 0;
        trace.level = exponent;
      }
      for (const span of spans) {
        const lo = Math.max(start, span.frameStart),
          hi = Math.min(end, span.frameEnd);
        if (!(hi > lo)) continue;
        const pyramid = span.pyramid;
        const center = span.sourceChainageInFrame((lo + hi) / 2);
        const mapping = span.sourceChainageInFrame(Math.max(lo, Math.min(hi, station)));
        pyramid.frame.sample(mapping, edges);
        const k = Math.min(pyramid.levels.length - 1, Math.floor(exponent));
        const levelWeight = k === pyramid.levels.length - 1 ? 0 : exponent - k;
        if (trace) trace.sections++;
        for (let n = 0; n < (levelWeight > 0 ? 2 : 1); n++) {
          const index = cursors.length;
          if (!pool[index]) pool[index] = cursor();
          const c = pool[index];
          pair(pyramid.levels[k + n], center, c);
          if (!c.first.opaque && !c.last.opaque) continue;
          c.levelWeight = n ? levelWeight : 1 - levelWeight;
          c.frameWeight = (hi - lo) / (end - start);
          c.u = (lateral + span.sourceLateralOrigin - edges.left) / (edges.right - edges.left);
          c.stepU = stepL / (edges.right - edges.left);
          cursors.push(c);
          if (trace) trace.rowReads += c.first === c.last ? 1 : 2;
        }
      }
      sums.fill(0, 0, count * 4);
      if (!cursors.length) return;
      for (const c of cursors) {
        const weight = c.levelWeight * c.frameWeight;
        for (let x = 0; x < count; x++) {
          const u = c.u + x * c.stepU,
            i = x * 4;
          lateralValues(c.first, u, values);
          add(values.a, weight * (1 - c.weight) * (1 - values.weight), i);
          add(values.b, weight * (1 - c.weight) * values.weight, i);
          if (c.weight > 0) {
            lateralValues(c.last, u, values);
            add(values.a, weight * c.weight * (1 - values.weight), i);
            add(values.b, weight * c.weight * values.weight, i);
          }
        }
        if (trace) trace.lateralSamples += count * (c.weight > 0 ? 4 : 2);
      }
      for (let x = 0; x < count; x++) {
        const i = x * 4,
          coverage = sums[i];
        if (coverage < IMAGE_OPAQUE_COVERAGE) continue;
        pixels[offset + x] =
          rgba[linearToRgb555(sums[i + 1] / coverage, sums[i + 2] / coverage, sums[i + 3] / coverage)];
      }
    },
  });
}
