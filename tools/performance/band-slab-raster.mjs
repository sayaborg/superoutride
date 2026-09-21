import { IMAGE_OPAQUE_COVERAGE, linearToRgb555, rgb555LinearChannel } from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';

const rgba = Uint32Array.from({ length: 32768 }, (_, color) => rgb555ToRgba(color));
const at = (a, b, t) => a + (b - a) * t;

// Integral of clamp(a + (b-a)t, 0, 1), t in [0,1]. Used only for swept edge pixels.
function clippedIntegral(a, b) {
  if (a > b) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  if (b <= 0) return 0;
  if (a >= 1) return 1;
  if (a === b) return a;
  const slope = b - a,
    low = Math.max(0, -a / slope),
    high = Math.min(1, (1 - a) / slope);
  return (high - low) * (a + (slope * (low + high)) / 2) + 1 - high;
}

function firstSlab(slabs, s) {
  let low = 0,
    high = slabs.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (slabs[mid].end <= s) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Offline near-row prototype. Input rows and spans are caller-owned; no raw Bands reach this path. */
export function createResolvedSlabRaster(width) {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError('Positive integer row width required');
  const area = new Float64Array(width * 4),
    touched = new Uint8Array(width);
  const contributions = [],
    pool = [];
  function edge(x, weight, red, green, blue) {
    const i = x * 4;
    area[i] += weight;
    area[i + 1] += weight * red;
    area[i + 2] += weight * green;
    area[i + 3] += weight * blue;
    touched[x] = 1;
  }
  return Object.freeze({
    sample(pixels, offset, count, start, end, lateral, stepL, spans, trace, projection) {
      if (!(end > start) || !(stepL > 0) || !Number.isInteger(count) || count < 0 || count > width)
        throw new RangeError('Invalid resolved row footprint');
      contributions.length = 0;
      for (const span of spans) {
        const lo = Math.max(start, span.frameStart),
          hi = Math.min(end, span.frameEnd);
        if (!(hi > lo)) continue;
        const a = span.sourceChainageInFrame(lo),
          b = span.sourceChainageInFrame(hi);
        const slabs = span.source.slabs;
        for (let i = firstSlab(slabs, a); i < slabs.length && slabs[i].start < b; i++) {
          const slab = slabs[i],
            first = Math.max(a, slab.start),
            last = Math.min(b, slab.end);
          if (!(last > first) || !slab.opaque) continue;
          const index = contributions.length;
          let c = pool[index];
          if (!c) {
            c = { slab: null, first: 0, last: 0, lateral: 0, x0: 0, x1: 0, scale0: 0, scale1: 0 };
            pool.push(c);
          }
          c.slab = slab;
          c.first = first;
          c.last = last;
          c.lateral = lateral + span.sourceLateralOrigin;
          if (projection) {
            projection.prepare(lo + first - a, lo + last - a, c);
            c.x0 -= c.scale0 * span.sourceLateralOrigin;
            c.x1 -= c.scale1 * span.sourceLateralOrigin;
          } else {
            c.scale0 = c.scale1 = 1 / stepL;
            c.x0 = c.x1 = 0.5 - c.lateral / stepL;
          }
          contributions.push(c);
        }
      }
      if (trace) {
        trace.slabs = contributions.length;
        trace.flatPixels = 0;
        trace.edgePixels = 0;
        trace.maximumIntervals = 0;
      }
      if (!contributions.length) return;
      area.fill(0, 0, count * 4);
      touched.fill(0, 0, count);
      const total = end - start;
      const direct = contributions.length === 1 && contributions[0].last - contributions[0].first === total;
      for (const c of contributions) {
        const { slab, first, last } = c;
        const t0 = (first - slab.start) / (slab.end - slab.start),
          t1 = (last - slab.start) / (slab.end - slab.start);
        const weight = (last - first) / total;
        if (trace) trace.maximumIntervals = Math.max(trace.maximumIntervals, slab.intervals.length);
        for (const piece of slab.intervals) {
          if (piece.color === null) continue;
          const l0 = c.x0 + c.scale0 * at(piece.left0, piece.left1, t0);
          const l1 = c.x1 + c.scale1 * at(piece.left0, piece.left1, t1);
          const r0 = c.x0 + c.scale0 * at(piece.right0, piece.right1, t0);
          const r1 = c.x1 + c.scale1 * at(piece.right0, piece.right1, t1);
          const firstPixel = piece.openLeft ? 0 : Math.max(0, Math.floor(Math.min(l0, l1)));
          const lastPixel = piece.openRight ? count : Math.min(count, Math.ceil(Math.max(r0, r1)));
          const innerFirst = piece.openLeft ? 0 : Math.max(firstPixel, Math.ceil(Math.max(l0, l1)));
          const innerLast = piece.openRight ? count : Math.min(lastPixel, Math.floor(Math.min(r0, r1)));
          const red = rgb555LinearChannel(piece.color >>> 10),
            green = rgb555LinearChannel((piece.color >>> 5) & 31),
            blue = rgb555LinearChannel(piece.color & 31);
          if (innerLast > innerFirst) {
            if (trace) trace.flatPixels += innerLast - innerFirst;
            if (direct) pixels.fill(rgba[piece.color], offset + innerFirst, offset + innerLast);
            else for (let x = innerFirst; x < innerLast; x++) edge(x, weight, red, green, blue);
          }
          for (let x = firstPixel; x < lastPixel; x++) {
            if (x >= innerFirst && x < innerLast) {
              x = innerLast - 1;
              continue;
            }
            const upper = piece.openRight ? 1 : clippedIntegral(r0 - x, r1 - x);
            const lower = piece.openLeft ? 0 : clippedIntegral(l0 - x, l1 - x);
            edge(x, weight * (upper - lower), red, green, blue);
            if (trace) trace.edgePixels++;
          }
        }
      }
      for (let x = 0; x < count; x++) {
        const i = x * 4,
          coverage = area[i];
        if (!touched[x] || coverage < IMAGE_OPAQUE_COVERAGE) continue;
        pixels[offset + x] =
          rgba[linearToRgb555(area[i + 1] / coverage, area[i + 2] / coverage, area[i + 3] / coverage)];
      }
    },
  });
}
