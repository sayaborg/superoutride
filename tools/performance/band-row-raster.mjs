import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';

const colors = Uint32Array.from({ length: 32768 }, (_, value) => rgb555ToRgba(value));
const interpolate = (a, b, t) => a + (b - a) * t;

// Integral of clamp(a + (b-a)t, 0, width), for t in [0,1].
function clippedIntegral(a, b, width) {
  if (a > b) return clippedIntegral(b, a, width);
  if (b <= 0) return 0;
  if (a >= width) return width;
  if (a === b) return a;
  const slope = b - a;
  const low = Math.max(0, -a / slope);
  const high = Math.min(1, (width - a) / slope);
  return (high - low) * (a + (slope * (low + high)) / 2) + (1 - high) * width;
}

/** Exact trapezoid/rectangle integration, independent of cross-section averaging. */
export function integrateBandRectangle(slabs, start, end, left, right, out) {
  let low = 0;
  let high = slabs.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (slabs[mid].end <= start) low = mid + 1;
    else high = mid;
  }
  const width = right - left;
  for (let index = low; index < slabs.length && slabs[index].start < end; index++) {
    const slab = slabs[index];
    const a = Math.max(start, slab.start);
    const b = Math.min(end, slab.end);
    if (!(b > a)) continue;
    const t0 = (a - slab.start) / (slab.end - slab.start);
    const t1 = (b - slab.start) / (slab.end - slab.start);
    for (const piece of slab.pieces) {
      const upper = piece.openRight
        ? width
        : clippedIntegral(
            interpolate(piece.right0, piece.right1, t0) - left,
            interpolate(piece.right0, piece.right1, t1) - left,
            width,
          );
      const lower = piece.openLeft
        ? 0
        : clippedIntegral(
            interpolate(piece.left0, piece.left1, t0) - left,
            interpolate(piece.left0, piece.left1, t1) - left,
            width,
          );
      const area = (b - a) * (upper - lower);
      out.opaque += area;
      out.red += area * piece.rgb[0];
      out.green += area * piece.rgb[1];
      out.blue += area * piece.rgb[2];
    }
  }
  return out;
}

/** Caller-owned row scratch; source dictionaries contain no render state. */
export function createBandRowRaster(width, pyramid, filtered) {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError('Invalid row width');
  const areas = new Float64Array(width * 4);
  const pieces = [];
  const pool = [];
  let used = 0;
  function contribution(source, section, start, end, lateralOrigin) {
    let piece = pool[used];
    if (!piece) {
      piece = { source: null, section: null, start: NaN, end: NaN, lateralOrigin: NaN };
      pool.push(piece);
    }
    used++;
    piece.source = source;
    piece.section = section;
    piece.start = start;
    piece.end = end;
    piece.lateralOrigin = lateralOrigin;
    pieces.push(piece);
  }
  return {
    /** Spans are ordinary owned intervals in one frame; gaps retain transparent area. */
    sample(pixels, offset, count, start, end, lateral, stepL, spans, trace = null) {
      if (!(end > start) || !(stepL > 0) || count > width) throw new RangeError('Invalid Band row footprint');
      const deltaS = end - start;
      used = 0;
      pieces.length = 0;
      if (trace) {
        trace.directSlabs = 0;
        trace.buckets = 0;
        trace.maximumIntervals = 0;
        trace.sections = 0;
        trace.boundaryFallbacks = 0;
      }
      for (const span of spans) {
        const a = Math.max(start, span.frameStart);
        const b = Math.min(end, span.frameEnd);
        if (!(b > a)) continue;
        const source = span.source;
        const sourceA = span.sourceChainageInFrame(a);
        const sourceB = span.sourceChainageInFrame(b);
        const levelIndex = filtered ? source.pyramid.selectLevel(deltaS) : -1;
        if (trace) trace.sections++;
        if (levelIndex < 0) {
          contribution(source, null, sourceA, sourceB, span.sourceLateralOrigin);
        } else {
          const level = source.pyramid.levels[levelIndex];
          const first = Math.floor(sourceA / level.width);
          for (let index = first; index < level.indices.length && index * level.width < sourceB; index++) {
            const bucketStart = index * level.width;
            const bucketEnd = Math.min(source.length, (index + 1) * level.width);
            const lo = Math.max(sourceA, bucketStart);
            const hi = Math.min(sourceB, bucketEnd);
            if (!(hi > lo)) continue;
            // Averages must not import non-owned guard content across an occurrence seam.
            // Partial ownership buckets retain exact integration; their cost is reported.
            const owned = bucketStart >= span.sourceRange.start && bucketEnd <= span.sourceRange.end;
            const section = owned ? pyramid.dictionary[level.indices[index]] : null;
            contribution(source, section, lo, hi, span.sourceLateralOrigin);
            if (trace) {
              trace.buckets++;
              trace.maximumIntervals = Math.max(trace.maximumIntervals, section?.intervalCount ?? 0);
              if (!owned) trace.boundaryFallbacks++;
            }
          }
        }
      }
      if (trace) {
        for (const piece of pieces)
          if (!piece.section)
            trace.directSlabs += piece.source.slabs.filter(
              (slab) => slab.start < piece.end && slab.end > piece.start && slab.pieces.length > 0,
            ).length;
      }
      if (pieces.length === 0) return;
      areas.fill(0, 0, count * 4);
      for (const piece of pieces) {
        const localLateral = lateral + piece.lateralOrigin;
        if (piece.section) {
          const { knots, values, slopes } = piece.section;
          const ds = piece.end - piece.start;
          let interval = 0;
          while (interval < knots.length && knots[interval] <= localLateral - stepL / 2) interval++;
          for (let x = 0; x < count; x++) {
            const right = localLateral + (x + 0.5) * stepL;
            let position = localLateral + (x - 0.5) * stepL;
            let opaque = 0;
            let red = 0;
            let green = 0;
            let blue = 0;
            while (position < right) {
              const edge = interval < knots.length ? Math.min(right, knots[interval]) : right;
              const origin = interval === 0 ? position : knots[interval - 1];
              const midpoint = (position + edge) / 2 - origin;
              const scale = (edge - position) * ds;
              const value = values[interval];
              const slope = slopes[interval];
              opaque += scale * (value[0] + slope[0] * midpoint);
              red += scale * (value[1] + slope[1] * midpoint);
              green += scale * (value[2] + slope[2] * midpoint);
              blue += scale * (value[3] + slope[3] * midpoint);
              position = edge;
              if (interval < knots.length && position >= knots[interval]) interval++;
            }
            const i = x * 4;
            areas[i] += opaque;
            areas[i + 1] += red;
            areas[i + 2] += green;
            areas[i + 3] += blue;
          }
        } else {
          const slabs = piece.source.slabs;
          let low = 0;
          let high = slabs.length;
          while (low < high) {
            const mid = (low + high) >>> 1;
            if (slabs[mid].end <= piece.start) low = mid + 1;
            else high = mid;
          }
          for (let index = low; index < slabs.length && slabs[index].start < piece.end; index++) {
            const slab = slabs[index];
            const a = Math.max(piece.start, slab.start);
            const b = Math.min(piece.end, slab.end);
            if (!(b > a)) continue;
            const ds = b - a;
            const t0 = (a - slab.start) / (slab.end - slab.start);
            const t1 = (b - slab.start) / (slab.end - slab.start);
            for (const band of slab.pieces) {
              const l0 = interpolate(band.left0, band.left1, t0);
              const l1 = interpolate(band.left0, band.left1, t1);
              const r0 = interpolate(band.right0, band.right1, t0);
              const r1 = interpolate(band.right0, band.right1, t1);
              const first = band.openLeft
                ? 0
                : Math.max(0, Math.floor((Math.min(l0, l1) - localLateral) / stepL + 0.5));
              const last = band.openRight
                ? count - 1
                : Math.min(count - 1, Math.floor((Math.max(r0, r1) - localLateral) / stepL + 0.5));
              const red = band.rgb[0];
              const green = band.rgb[1];
              const blue = band.rgb[2];
              for (let x = first; x <= last; x++) {
                const left = localLateral + (x - 0.5) * stepL;
                const upper = band.openRight ? stepL : clippedIntegral(r0 - left, r1 - left, stepL);
                const lower = band.openLeft ? 0 : clippedIntegral(l0 - left, l1 - left, stepL);
                const area = ds * (upper - lower);
                const i = x * 4;
                areas[i] += area;
                areas[i + 1] += area * red;
                areas[i + 2] += area * green;
                areas[i + 3] += area * blue;
              }
            }
          }
        }
      }
      const threshold = deltaS * stepL * 0.5;
      for (let x = 0; x < count; x++) {
        const i = x * 4;
        const opaque = areas[i];
        if (!(opaque > threshold)) continue;
        const scale = 31 / (255 * opaque);
        const color =
          (Math.round(areas[i + 1] * scale) << 10) |
          (Math.round(areas[i + 2] * scale) << 5) |
          Math.round(areas[i + 3] * scale);
        pixels[offset + x] = colors[color];
      }
    },
  };
}
