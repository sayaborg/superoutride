import { courseBoundaryAt } from '../../dist/course/course-bands.js';
import { linearToRgb555, rgb555LinearChannel } from '../../dist/graphics/image-filter.js';

export const BAND_ROW_BASE_WIDTH_METERS = 1.6;

const at = (a, b, t) => a + (b - a) * t;

/** Geometry-only normalization. Paint order/colors do not change the chart's outer finite edges. */
export function compileBandNormalization(bands, resolved) {
  const frames = [];
  for (const slab of resolved.slabs) {
    const mid = (slab.start + slab.end) / 2;
    const edges = [];
    for (const band of bands) {
      if (mid < band.start || mid >= band.end) continue;
      if (!band.openLeft) edges.push(band.left);
      if (!band.openRight) edges.push(band.right);
    }
    edges.sort((a, b) => courseBoundaryAt(a, mid) - courseBoundaryAt(b, mid));
    if (!edges.length) throw new RangeError('An empty chart requires explicit finite normalization geometry');
    const left = edges[0],
      right = edges.at(-1);
    const frame = {
      start: slab.start,
      end: slab.end,
      left0: courseBoundaryAt(left, slab.start),
      left1: courseBoundaryAt(left, slab.end),
      right0: courseBoundaryAt(right, slab.start),
      right1: courseBoundaryAt(right, slab.end),
    };
    const previous = frames.at(-1);
    if (
      previous &&
      previous.end === frame.start &&
      previous.left1 === frame.left0 &&
      previous.right1 === frame.right0 &&
      (previous.left1 - previous.left0) / (previous.end - previous.start) ===
        (frame.left1 - frame.left0) / (frame.end - frame.start) &&
      (previous.right1 - previous.right0) / (previous.end - previous.start) ===
        (frame.right1 - frame.right0) / (frame.end - frame.start)
    ) {
      previous.end = frame.end;
      previous.left1 = frame.left1;
      previous.right1 = frame.right1;
    } else frames.push(frame);
  }
  return Object.freeze(frames.map(Object.freeze));
}

function firstInterval(rows, s) {
  let a = 0,
    b = rows.length;
  while (a < b) {
    const m = (a + b) >>> 1;
    if (rows[m].end <= s) a = m + 1;
    else b = m;
  }
  return Math.min(a, rows.length - 1);
}

export function sampleBandNormalization(frames, s, out) {
  const frame = frames[firstInterval(frames, s)];
  const t = (s - frame.start) / (frame.end - frame.start);
  out.left = at(frame.left0, frame.left1, t);
  out.right = at(frame.right0, frame.right1, t);
  return out;
}

// Integral of an affine numerator divided by a strictly positive affine denominator.
// A centered series avoids cancellation when the width is almost constant.
function ratioIntegral(n0, n1, w0, w1, lo, hi) {
  const mid = (lo + hi) / 2,
    half = (hi - lo) / 2;
  const dn = n1 - n0,
    dw = w1 - w0;
  const n = n0 + dn * mid,
    w = w0 + dw * mid;
  if (dw === 0) return ((hi - lo) * n) / w;
  const x = (dw * half) / w,
    x2 = x * x,
    q = n / w;
  const correction =
    Math.abs(x) < 0.001
      ? (((q * dw - dn) * dw * half * half) / (w * w)) * (1 / 3 + x2 / 5 + (x2 * x2) / 7 + (x2 * x2 * x2) / 9)
      : (q - dn / dw) * ((Math.log1p(x) - Math.log1p(-x)) / (2 * x) - 1);
  return (hi - lo) * (q + correction);
}

/** Compile-time exact normalized box integral. No area integration is performed by a far pixel query. */
function clippedRatioIntegral(n0, n1, w0, w1) {
  const cuts = [0, 1];
  for (const [a, b] of [
    [n0, n1],
    [n0 - w0, n1 - w1],
  ]) {
    const t = -a / (b - a);
    if (t > 0 && t < 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i],
      b = cuts[i + 1],
      m = (a + b) / 2;
    const ratio = at(n0, n1, m) / at(w0, w1, m);
    if (ratio >= 1) sum += b - a;
    else if (ratio > 0) sum += ratioIntegral(n0, n1, w0, w1, a, b);
  }
  return Math.max(0, Math.min(1, sum));
}

function filterBucket(source, frames, start, end, count) {
  const sums = new Float64Array((count + 2) * 4);
  function add(index, area, color) {
    if (!(area > 0) || color === null) return;
    const i = index * 4;
    sums[i] += area;
    sums[i + 1] += area * rgb555LinearChannel(color >>> 10);
    sums[i + 2] += area * rgb555LinearChannel((color >>> 5) & 31);
    sums[i + 3] += area * rgb555LinearChannel(color & 31);
  }
  for (let i = firstInterval(source.slabs, start); i < source.slabs.length && source.slabs[i].start < end; i++) {
    const slab = source.slabs[i];
    if (!slab.opaque) continue;
    const a = Math.max(start, slab.start),
      b = Math.min(end, slab.end);
    for (let j = firstInterval(frames, a); j < frames.length && frames[j].start < b; j++) {
      const frame = frames[j],
        lo = Math.max(a, frame.start),
        hi = Math.min(b, frame.end);
      if (!(hi > lo)) continue;
      const t0 = (lo - slab.start) / (slab.end - slab.start),
        t1 = (hi - slab.start) / (slab.end - slab.start);
      const f0 = (lo - frame.start) / (frame.end - frame.start),
        f1 = (hi - frame.start) / (frame.end - frame.start);
      const left0 = at(frame.left0, frame.left1, f0),
        left1 = at(frame.left0, frame.left1, f1);
      const w0 = at(frame.right0, frame.right1, f0) - left0,
        w1 = at(frame.right0, frame.right1, f1) - left1;
      for (const piece of slab.intervals) {
        if (piece.color === null) continue;
        const l0 = at(piece.left0, piece.left1, t0) - left0,
          l1 = at(piece.left0, piece.left1, t1) - left1;
        const r0 = at(piece.right0, piece.right1, t0) - left0,
          r1 = at(piece.right0, piece.right1, t1) - left1;
        if (piece.openLeft) add(0, hi - lo, piece.color);
        if (piece.openRight) add(count + 1, hi - lo, piece.color);
        const first = piece.openLeft ? 0 : Math.max(0, Math.floor(Math.min(l0 / w0, l1 / w1) * count));
        const last = piece.openRight ? count : Math.min(count, Math.ceil(Math.max(r0 / w0, r1 / w1) * count));
        for (let x = first; x < last; x++) {
          const u = x / count;
          const upper = piece.openRight ? 1 : clippedRatioIntegral(r0 - u * w0, r1 - u * w1, w0 / count, w1 / count);
          const lower = piece.openLeft ? 0 : clippedRatioIntegral(l0 - u * w0, l1 - u * w1, w0 / count, w1 / count);
          add(x + 1, (hi - lo) * (upper - lower), piece.color);
        }
      }
    }
  }
  const colors = [],
    coverage = [],
    bytes = Buffer.alloc((count + 2) * 3);
  for (let i = 0; i < count + 2; i++) {
    const area = sums[i * 4];
    const alpha = Math.max(0, Math.min(255, Math.round((255 * area) / (end - start))));
    const color = area > 0 ? linearToRgb555(sums[i * 4 + 1] / area, sums[i * 4 + 2] / area, sums[i * 4 + 3] / area) : 0;
    colors.push(color);
    coverage.push(alpha);
    bytes.writeUInt16LE(color, i * 3);
    bytes[i * 3 + 2] = alpha;
  }
  return { colors: Object.freeze(colors), coverage: Object.freeze(coverage), bytes };
}

/** Static ownership-clipped row pyramid. Range is a source-owned interval, not a moving view window. */
export function compileNormalizedBandRows(source, frames, { start, end, maximumFootprint, focalLength, cameraHeight }) {
  if (
    ![start, end, maximumFootprint, focalLength, cameraHeight].every(Number.isFinite) ||
    !(start >= 0 && end > start && end <= source.length && maximumFootprint > 0 && focalLength > 0 && cameraHeight > 0)
  )
    throw new RangeError('Invalid finite normalized ground compilation domain');
  if (!Array.isArray(frames) || !frames.length) throw new TypeError('Finite normalization frames required');
  let previous = 0,
    maximumWidth = 0;
  for (const frame of frames) {
    if (
      ![frame.start, frame.end, frame.left0, frame.left1, frame.right0, frame.right1].every(Number.isFinite) ||
      frame.start !== previous ||
      !(frame.end > frame.start) ||
      !(frame.right0 > frame.left0) ||
      !(frame.right1 > frame.left1)
    )
      throw new RangeError('Normalization must cover the Section with positive finite affine widths');
    previous = frame.end;
    maximumWidth = Math.max(maximumWidth, frame.right0 - frame.left0, frame.right1 - frame.left1);
  }
  if (previous !== source.length) throw new RangeError('Normalization must cover the complete Section');
  const normalization = Object.freeze(frames.map((frame) => Object.freeze({ ...frame })));
  const levels = [],
    dictionary = [],
    intern = new Map();
  for (let k = 0; ; k++) {
    const width = BAND_ROW_BASE_WIDTH_METERS * 2 ** k;
    const spacing = Math.sqrt(width * focalLength * cameraHeight) / focalLength;
    const count = Math.ceil(maximumWidth / spacing),
      ids = [];
    const firstBucket = Math.floor(start / width),
      lastBucket = Math.ceil(end / width) - 1;
    for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
      const row = filterBucket(
        source,
        normalization,
        Math.max(start, bucket * width),
        Math.min(end, (bucket + 1) * width),
        count,
      );
      const key = row.bytes.toString('base64');
      let id = intern.get(key);
      if (id === undefined) {
        id = dictionary.length;
        intern.set(key, id);
        dictionary.push(
          Object.freeze({ colors: row.colors, coverage: row.coverage, opaque: row.coverage.some((c) => c > 0) }),
        );
      }
      ids.push(id);
    }
    levels.push(Object.freeze({ width, spacing, count, rowLength: count + 2, firstBucket, ids: Object.freeze(ids) }));
    if (width >= maximumFootprint) break;
  }
  return Object.freeze({
    start,
    end,
    maximumWidth,
    normalization,
    levels: Object.freeze(levels),
    dictionary: Object.freeze(dictionary),
  });
}

/** Actual little-endian wire bytes, including normalization, both tail samples and all directories. */
export function packNormalizedBandRows(source) {
  const headerBytes = 32,
    frameBytes = source.normalization.length * 48;
  const levelBytes = source.levels.length * 24;
  const dictionaryBytes =
    (source.dictionary.length + 1) * 4 + source.dictionary.reduce((sum, row) => sum + row.colors.length * 3, 0);
  const directoryBytes = source.levels.reduce((sum, level) => sum + level.ids.length * 4, 0);
  const bytes = new Uint8Array(headerBytes + frameBytes + levelBytes + dictionaryBytes + directoryBytes),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, source.normalization.length, true);
  view.setUint32(8, source.levels.length, true);
  view.setUint32(12, source.dictionary.length, true);
  view.setFloat64(16, source.start, true);
  view.setFloat64(24, source.end, true);
  let offset = headerBytes;
  for (const frame of source.normalization)
    for (const key of ['start', 'end', 'left0', 'left1', 'right0', 'right1']) {
      view.setFloat64(offset, frame[key], true);
      offset += 8;
    }
  for (const level of source.levels) {
    view.setFloat64(offset, level.width, true);
    view.setFloat64(offset + 8, level.spacing, true);
    view.setUint32(offset + 16, level.firstBucket, true);
    view.setUint32(offset + 20, level.ids.length, true);
    offset += 24;
  }
  const offsets = offset;
  offset += (source.dictionary.length + 1) * 4;
  const data = offset;
  source.dictionary.forEach((row, i) => {
    view.setUint32(offsets + i * 4, offset - data, true);
    for (let j = 0; j < row.colors.length; j++) {
      view.setUint16(offset, row.colors[j], true);
      bytes[offset + 2] = row.coverage[j];
      offset += 3;
    }
  });
  view.setUint32(offsets + source.dictionary.length * 4, offset - data, true);
  for (const level of source.levels)
    for (const id of level.ids) {
      view.setUint32(offset, id, true);
      offset += 4;
    }
  if (offset !== bytes.length) throw new Error('Packed row byte accounting diverged');
  return { bytes, headerBytes, frameBytes, levelBytes, dictionaryBytes, directoryBytes };
}
