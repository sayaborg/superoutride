import { linearToRgb555, rgb555LinearChannel } from '../../dist/graphics/image-filter.js';

const at = (a, b, t) => a + (b - a) * t;

/** Integral of an affine numerator divided by a positive affine width, over unit t. */
function ratioIntegral(n0, n1, w0, w1) {
  const d = (w1 - w0) / w0;
  // log1p(d)/d and (d-log1p(d))/d^2, evaluated without cancellation near a constant width.
  let a, b;
  if (Math.abs(d) < 1e-3) {
    a = 1;
    b = 0.5;
    let power = 1;
    for (let i = 1; i < 8; i++) {
      power *= -d;
      a += power / (i + 1);
      b += power / (i + 2);
    }
  } else {
    const log = Math.log1p(d);
    a = log / d;
    b = (d - log) / (d * d);
  }
  return (n0 * a + (n1 - n0) * b) / w0;
}

/** Exact normalized-u box area in one affine cell. Compilation only, not a runtime fallback. */
function cellCoverage(piece, t0, t1, left0, right0, left1, right1, u0, u1) {
  const w0 = right0 - left0,
    w1 = right1 - left1;
  const boxL = [left0 + u0 * w0, left1 + u0 * w1];
  const boxR = [left0 + u1 * w0, left1 + u1 * w1];
  const bandL = piece.openLeft ? boxL : [at(piece.left0, piece.left1, t0), at(piece.left0, piece.left1, t1)];
  const bandR = piece.openRight ? boxR : [at(piece.right0, piece.right1, t0), at(piece.right0, piece.right1, t1)];
  const edges = [boxL, boxR, bandL, bandR],
    cuts = [0, 1];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const gap = edges[i][0] - edges[j][0];
      const slope = edges[i][1] - edges[i][0] - edges[j][1] + edges[j][0];
      const t = -gap / slope;
      if (t > 0 && t < 1) cuts.push(t);
    }
  cuts.sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i],
      b = cuts[i + 1],
      mid = (a + b) / 2;
    if (!(b > a)) continue;
    const lower = at(boxL[0], boxL[1], mid) > at(bandL[0], bandL[1], mid) ? boxL : bandL;
    const upper = at(boxR[0], boxR[1], mid) < at(bandR[0], bandR[1], mid) ? boxR : bandR;
    if (at(upper[0], upper[1], mid) <= at(lower[0], lower[1], mid)) continue;
    const n0 = at(upper[0], upper[1], a) - at(lower[0], lower[1], a);
    const n1 = at(upper[0], upper[1], b) - at(lower[0], lower[1], b);
    area += ((b - a) * ratioIntegral(n0, n1, at(w0, w1, a), at(w0, w1, b))) / (u1 - u0);
  }
  return area;
}

/** Derived finite normalization frame; no raw Bands or infinite coordinates reach the reader. */
export function compileBandFrame(knots, length) {
  if (!Array.isArray(knots) || knots.length < 2) throw new TypeError('Normalization requires finite edge knots');
  let previous = -1;
  const owned = knots.map(({ s, left, right }) => {
    if (![s, left, right].every(Number.isFinite) || s <= previous || s < 0 || s > length || !(right > left))
      throw new RangeError('Normalization edges must have a positive finite ordered width');
    previous = s;
    return Object.freeze({ s, left, right });
  });
  if (owned[0].s !== 0 || owned.at(-1).s !== length) throw new RangeError('Normalization must cover the Section');
  const points = Object.freeze(owned);
  return Object.freeze({
    knots: points,
    maximumWidth: Math.max(...points.map((p) => p.right - p.left)),
    sample(s, out) {
      if (!Number.isFinite(s) || s < 0 || s > length) throw new RangeError('Normalization query outside Section');
      let lo = 0,
        hi = points.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid].s <= s) lo = mid;
        else hi = mid;
      }
      const a = points[lo],
        b = points[lo + 1],
        t = (s - a.s) / (b.s - a.s);
      out.left = at(a.left, b.left, t);
      out.right = at(a.right, b.right, t);
      return out;
    },
  });
}

function firstSlab(slabs, s) {
  let lo = 0,
    hi = slabs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (slabs[mid].end <= s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function addColor(sums, i, coverage, color) {
  if (color === null || !(coverage > 0)) return;
  sums[i] += coverage;
  sums[i + 1] += coverage * rgb555LinearChannel(color >>> 10);
  sums[i + 2] += coverage * rgb555LinearChannel((color >>> 5) & 31);
  sums[i + 3] += coverage * rgb555LinearChannel(color & 31);
}

/** Compile bucket boxes directly from resolved master paint. Rows include one constant tail at either end.
 * All typed storage stays private; byte exports are owned copies, not writable aliases of published readers.
 */
export function compileBandRowPyramid(source, frame, options) {
  const { maximumFootprint, focalLength, cameraHeight } = options;
  const rangeStart = options.rangeStart ?? 0,
    rangeEnd = options.rangeEnd ?? source.length;
  if (!(rangeEnd > rangeStart) || rangeStart < 0 || rangeEnd > source.length)
    throw new RangeError('Owned row domain must lie inside Section');
  if (![maximumFootprint, focalLength, cameraHeight].every((v) => Number.isFinite(v) && v > 0))
    throw new RangeError('Positive finite footprint and camera calibration required');
  const levelCount = Math.max(1, Math.ceil(Math.log2(maximumFootprint / 1.6)) + 1);
  const dictionary = [],
    encoded = [],
    intern = new Map(),
    levels = [];
  const edge0 = { left: 0, right: 0 },
    edge1 = { left: 0, right: 0 };
  for (let k = 0; k < levelCount; k++) {
    const width = 1.6 * 2 ** k;
    const lateralSpacing = Math.sqrt(width * focalLength * cameraHeight) / focalLength;
    const rowLength = Math.max(1, Math.ceil(frame.maximumWidth / lateralSpacing));
    const bucketCount = Math.ceil((rangeEnd - rangeStart) / width),
      indices = new Uint32Array(bucketCount);
    for (let bucket = 0; bucket < bucketCount; bucket++) {
      const start = rangeStart + bucket * width,
        end = Math.min(rangeEnd, rangeStart + (bucket + 1) * width);
      const sums = new Float64Array((rowLength + 2) * 4);
      for (let j = firstSlab(source.slabs, start); j < source.slabs.length && source.slabs[j].start < end; j++) {
        const slab = source.slabs[j];
        if (!slab.opaque) continue;
        const a = Math.max(start, slab.start),
          b = Math.min(end, slab.end);
        const cuts = [a, ...frame.knots.filter((p) => p.s > a && p.s < b).map((p) => p.s), b];
        for (let c = 0; c + 1 < cuts.length; c++) {
          const first = cuts[c],
            last = cuts[c + 1],
            weight = (last - first) / (end - start);
          const t0 = (first - slab.start) / (slab.end - slab.start),
            t1 = (last - slab.start) / (slab.end - slab.start);
          frame.sample(first, edge0);
          frame.sample(last, edge1);
          addColor(sums, 0, weight, slab.intervals[0].openLeft ? slab.intervals[0].color : null);
          addColor(
            sums,
            (rowLength + 1) * 4,
            weight,
            slab.intervals.at(-1).openRight ? slab.intervals.at(-1).color : null,
          );
          for (const piece of slab.intervals) {
            if (piece.color === null) continue;
            // Interior work is bounded by the row lattice, not the number of subpixel edge events.
            for (let x = 0; x < rowLength; x++) {
              const coverage = cellCoverage(
                piece,
                t0,
                t1,
                edge0.left,
                edge0.right,
                edge1.left,
                edge1.right,
                x / rowLength,
                (x + 1) / rowLength,
              );
              addColor(sums, (x + 1) * 4, weight * coverage, piece.color);
            }
          }
        }
      }
      const bytes = new Uint8Array((rowLength + 2) * 3),
        view = new DataView(bytes.buffer);
      const words = new Uint32Array(rowLength + 2);
      let opaque = false;
      for (let x = 0; x < rowLength + 2; x++) {
        const i = x * 4,
          coverage = Math.max(0, Math.min(1, sums[i]));
        const alpha = Math.round(coverage * 255);
        const color =
          coverage > 0 ? linearToRgb555(sums[i + 1] / sums[i], sums[i + 2] / sums[i], sums[i + 3] / sums[i]) : 0;
        view.setUint16(x * 3, color, true);
        bytes[x * 3 + 2] = alpha;
        words[x] = color | (alpha << 16);
        opaque ||= alpha > 0;
        if (options.observeSample)
          options.observeSample({
            level: k,
            bucket,
            x,
            rowLength,
            start,
            end,
            coverage,
            red: coverage ? sums[i + 1] / sums[i] : 0,
            green: coverage ? sums[i + 2] / sums[i] : 0,
            blue: coverage ? sums[i + 3] / sums[i] : 0,
          });
      }
      const key = Buffer.from(bytes).toString('base64');
      let row = intern.get(key);
      if (row === undefined) {
        row = dictionary.length;
        intern.set(key, row);
        encoded.push(bytes);
        dictionary.push(
          Object.freeze({
            length: rowLength,
            opaque,
            valueAt(index) {
              return words[index];
            },
          }),
        );
      }
      indices[bucket] = row;
    }
    levels.push(
      Object.freeze({
        width,
        lateralSpacing,
        rowLength,
        bucketCount,
        rowAt(bucket) {
          return dictionary[indices[bucket]];
        },
        rowIdAt(bucket) {
          return indices[bucket];
        },
        centerAt(bucket) {
          return (rangeStart + bucket * width + Math.min(rangeEnd, rangeStart + (bucket + 1) * width)) / 2;
        },
      }),
    );
  }
  const rows = Object.freeze(dictionary),
    frozenLevels = Object.freeze(levels);
  const dictionaryBytes = 4 * (rows.length + 1) + encoded.reduce((sum, bytes) => sum + bytes.length, 0);
  const directoryBytes = levels.reduce((sum, level) => sum + level.bucketCount * 4, 0);
  const frameBytes = frame.knots.length * 24;
  const headerBytes = 40 + levels.length * 32;
  return Object.freeze({
    source,
    frame,
    rangeStart,
    rangeEnd,
    levels: frozenLevels,
    dictionary: rows,
    dictionaryBytes,
    directoryBytes,
    frameBytes,
    headerBytes,
    packedBytes: headerBytes + dictionaryBytes + directoryBytes + frameBytes,
    retainedSampleBytes: rows.reduce((sum, row) => sum + (row.length + 2) * 7, 0),
    pack() {
      const bytes = new Uint8Array(headerBytes + dictionaryBytes + directoryBytes + frameBytes),
        view = new DataView(bytes.buffer);
      [1, levels.length, rows.length, frame.knots.length].forEach((v, i) => view.setUint32(i * 4, v, true));
      view.setFloat64(16, source.length, true);
      view.setFloat64(24, rangeStart, true);
      view.setFloat64(32, rangeEnd, true);
      let offset = 40;
      for (const level of levels) {
        view.setFloat64(offset, level.width, true);
        view.setFloat64(offset + 8, level.lateralSpacing, true);
        view.setUint32(offset + 16, level.rowLength, true);
        view.setUint32(offset + 20, level.bucketCount, true);
        view.setUint32(offset + 24, 0, true);
        view.setUint32(offset + 28, 0, true);
        offset += 32;
      }
      let position = 0;
      for (const row of encoded) {
        view.setUint32(offset, position, true);
        offset += 4;
        position += row.length;
      }
      view.setUint32(offset, position, true);
      offset += 4;
      for (const row of encoded) {
        bytes.set(row, offset);
        offset += row.length;
      }
      for (const level of levels)
        for (let b = 0; b < level.bucketCount; b++) {
          view.setUint32(offset, level.rowIdAt(b), true);
          offset += 4;
        }
      for (const p of frame.knots)
        for (const value of [p.s, p.left, p.right]) {
          view.setFloat64(offset, value, true);
          offset += 8;
        }
      if (offset !== bytes.byteLength) throw new Error('Far-row packed length mismatch');
      return bytes;
    },
  });
}
