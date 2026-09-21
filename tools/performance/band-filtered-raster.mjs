import {
  IMAGE_OPAQUE_COVERAGE,
  imageLodExponent,
  linearToRgb555,
  rgb555LinearChannel,
} from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { BAND_ROW_BASE_WIDTH_METERS, sampleBandNormalization } from './band-normalized-rows.mjs';

const rgba = Uint32Array.from({ length: 32768 }, (_, color) => rgb555ToRgba(color));
function center(source, level, index) {
  const bucket = level.firstBucket + index;
  return (Math.max(source.start, bucket * level.width) + Math.min(source.end, (bucket + 1) * level.width)) / 2;
}
function chooseRows(source, decoded, level, s, weight, first, second) {
  let low = 0,
    high = level.ids.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (center(source, level, mid) <= s) low = mid + 1;
    else high = mid;
  }
  const a = Math.max(0, low - 1),
    b = Math.min(level.ids.length - 1, low);
  const t = a === b ? 0 : (s - center(source, level, a)) / (center(source, level, b) - center(source, level, a));
  first.values = decoded[level.ids[a]];
  first.weight = weight * (1 - t);
  first.count = level.count;
  first.opaque = source.dictionary[level.ids[a]].opaque;
  second.values = decoded[level.ids[b]];
  second.weight = weight * t;
  second.count = level.count;
  second.opaque = source.dictionary[level.ids[b]].opaque;
}

/** One renderer's decoded, owned row buffers and accumulation scratch; compiled products stay immutable. */
export function createNormalizedRowRaster(width, pyramids) {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError('Positive row width required');
  const decoded = new Map(
    pyramids.map((source) => [
      source,
      source.dictionary.map((row) => {
        const values = new Float64Array(row.colors.length * 4);
        for (let i = 0; i < row.colors.length; i++) {
          const a = row.coverage[i] / 255,
            color = row.colors[i];
          values[i * 4] = a;
          values[i * 4 + 1] = a * rgb555LinearChannel(color >>> 10);
          values[i * 4 + 2] = a * rgb555LinearChannel((color >>> 5) & 31);
          values[i * 4 + 3] = a * rgb555LinearChannel(color & 31);
        }
        return values;
      }),
    ]),
  );
  const sums = new Float64Array(width * 4),
    pool = [],
    contributions = [];
  function publish(pixels, offset, x, a, r, g, b) {
    if (a >= IMAGE_OPAQUE_COVERAGE) pixels[offset + x] = rgba[linearToRgb555(r / a, g / a, b / a)];
  }
  function tail(pixels, offset, first, last, rows, right, weight, direct) {
    if (last <= first) return;
    let a = 0,
      r = 0,
      g = 0,
      b = 0;
    for (const row of rows) {
      const i = right ? row.values.length - 4 : 0,
        w = row.weight * weight;
      a += w * row.values[i];
      r += w * row.values[i + 1];
      g += w * row.values[i + 2];
      b += w * row.values[i + 3];
    }
    if (direct) {
      if (a >= IMAGE_OPAQUE_COVERAGE)
        pixels.fill(rgba[linearToRgb555(r / a, g / a, b / a)], offset + first, offset + last);
    } else
      for (let x = first; x < last; x++) {
        const i = x * 4;
        sums[i] += a;
        sums[i + 1] += r;
        sums[i + 2] += g;
        sums[i + 3] += b;
      }
  }
  return Object.freeze({
    sample(pixels, offset, count, start, end, station, lateral, stepL, spans, trace) {
      if (!(end > start) || !(stepL > 0) || !Number.isInteger(count) || count < 0 || count > width)
        throw new RangeError('Invalid normalized row footprint');
      const exponent = imageLodExponent((end - start) / BAND_ROW_BASE_WIDTH_METERS);
      contributions.length = 0;
      if (trace) {
        trace.sections = 0;
        trace.buckets = 0;
        trace.lateralSamples = 0;
        trace.maximumRowLength = 0;
        trace.flatPixels = 0;
        trace.levelExponent = exponent;
      }
      for (const span of spans) {
        const lo = Math.max(start, span.frameStart),
          hi = Math.min(end, span.frameEnd);
        if (!(hi > lo)) continue;
        const source = span.pyramid,
          values = decoded.get(source);
        if (!values) throw new Error('Far rows must be prepared before rendering');
        const s = Math.max(
          span.sourceChainageInFrame(lo),
          Math.min(span.sourceChainageInFrame(hi), span.sourceChainageInFrame(station)),
        );
        const k0 = Math.min(source.levels.length - 1, Math.floor(exponent));
        const k1 = Math.min(source.levels.length - 1, k0 + 1),
          blend = k0 === k1 ? 0 : exponent - k0;
        const index = contributions.length;
        let c = pool[index];
        if (!c) {
          c = {
            left: 0,
            right: 0,
            origin: 0,
            weight: 0,
            rows: Array.from({ length: 4 }, () => ({ values: null, weight: 0, count: 0, opaque: false })),
          };
          pool.push(c);
        }
        sampleBandNormalization(source.normalization, s, c);
        c.origin = lateral + span.sourceLateralOrigin;
        c.weight = (hi - lo) / (end - start);
        chooseRows(source, values, source.levels[k0], s, 1 - blend, c.rows[0], c.rows[1]);
        chooseRows(source, values, source.levels[k1], s, blend, c.rows[2], c.rows[3]);
        let opaque = false;
        for (const row of c.rows) opaque ||= row.weight > 0 && row.opaque;
        if (!opaque) continue;
        contributions.push(c);
        if (trace) {
          trace.sections++;
          trace.buckets += c.rows.filter((row) => row.weight > 0).length;
          trace.maximumRowLength = Math.max(
            trace.maximumRowLength,
            source.levels[k0].rowLength,
            source.levels[k1].rowLength,
          );
        }
      }
      if (!contributions.length) return;
      const direct = contributions.length === 1 && contributions[0].weight === 1;
      if (!direct) sums.fill(0, 0, count * 4);
      for (const c of contributions) {
        const spanWidth = c.right - c.left,
          rows = c.rows;
        const minCount = Math.min(rows[0].count, rows[2].count);
        const first = Math.max(0, Math.min(count, Math.ceil((c.left - spanWidth / (2 * minCount) - c.origin) / stepL)));
        const last = Math.max(
          first,
          Math.min(count, Math.ceil((c.right + spanWidth / (2 * minCount) - c.origin) / stepL)),
        );
        tail(pixels, offset, 0, first, rows, false, c.weight, direct);
        tail(pixels, offset, last, count, rows, true, c.weight, direct);
        if (trace) trace.flatPixels += first + count - last;
        for (let x = first; x < last; x++) {
          const u = (c.origin + x * stepL - c.left) / spanWidth;
          let a = 0,
            r = 0,
            g = 0,
            b = 0;
          for (const row of rows) {
            if (!row.weight) continue;
            const p = Math.max(0, Math.min(row.count + 1, u * row.count + 0.5));
            const left = Math.floor(p),
              right = Math.min(row.count + 1, left + 1),
              t = p - left;
            const v = row.values,
              i = left * 4,
              j = right * 4,
              w = row.weight * c.weight;
            a += w * (v[i] + (v[j] - v[i]) * t);
            r += w * (v[i + 1] + (v[j + 1] - v[i + 1]) * t);
            g += w * (v[i + 2] + (v[j + 2] - v[i + 2]) * t);
            b += w * (v[i + 3] + (v[j + 3] - v[i + 3]) * t);
            if (trace) trace.lateralSamples += 2;
          }
          if (direct) publish(pixels, offset, x, a, r, g, b);
          else {
            const i = x * 4;
            sums[i] += a;
            sums[i + 1] += r;
            sums[i + 2] += g;
            sums[i + 3] += b;
          }
        }
      }
      if (!direct)
        for (let x = 0; x < count; x++) {
          const i = x * 4;
          publish(pixels, offset, x, sums[i], sums[i + 1], sums[i + 2], sums[i + 3]);
        }
    },
  });
}
