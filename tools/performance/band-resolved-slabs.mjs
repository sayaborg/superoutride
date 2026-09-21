import { courseBoundaryAt } from '../../dist/course/course-bands.js';

const at = (a, b, t) => a + (b - a) * t;
const same = (a, b) => a.color === b.color && a.right0 === b.left0 && a.right1 === b.left1;

/** Offline ordered paint admission and arrangement. No product schema or physical partition is changed. */
export function compileResolvedBands(bands, length) {
  if (!Array.isArray(bands)) throw new TypeError('Band trial input must be an array');
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('Finite positive Section length required');
  const events = new Map([
    [0, { add: [], remove: [] }],
    [length, { add: [], remove: [] }],
  ]);
  const event = (s) => {
    if (!events.has(s)) events.set(s, { add: [], remove: [] });
    return events.get(s);
  };
  bands.forEach((band, order) => {
    if (!band || typeof band !== 'object') throw new TypeError('Band must be an object');
    if (
      !Number.isFinite(band.start) ||
      !Number.isFinite(band.end) ||
      band.start < 0 ||
      band.end > length ||
      band.end <= band.start
    )
      throw new RangeError('Band activation must lie inside its Section');
    if (band.color !== null && (!Number.isInteger(band.color) || band.color < 0 || band.color > 32767))
      throw new RangeError('Band color must be RGB555 or transparent');
    for (const side of ['openLeft', 'openRight'])
      if (band[side] !== undefined && typeof band[side] !== 'boolean') throw new TypeError('Open side must be boolean');
    if (band.openLeft && band.openRight) throw new RangeError('One authored Band may open only one side');
    const stations = new Set([band.start, band.end]);
    for (const boundary of [band.left, band.right]) {
      if (!boundary || !Array.isArray(boundary.knots) || boundary.knots.length < 2)
        throw new TypeError('An affine boundary requires an ordered knot array');
      let previous = -Infinity;
      for (const knot of boundary.knots) {
        const s = knot.anchor?.s;
        if (!Number.isFinite(s) || !Number.isFinite(knot.l) || s <= previous)
          throw new RangeError('Boundary knots must be finite and strictly ordered');
        previous = s;
        if (s > band.start && s < band.end) stations.add(s);
      }
      if (boundary.knots[0].anchor.s > band.start || boundary.knots.at(-1).anchor.s < band.end)
        throw new RangeError('Boundary must cover the active Band');
    }
    for (const s of stations) {
      if (!band.openLeft && !band.openRight && courseBoundaryAt(band.left, s) > courseBoundaryAt(band.right, s))
        throw new RangeError('Finite Band boundaries are reversed');
      event(s);
    }
    event(band.start).add.push(order);
    event(band.end).remove.push(order);
  });
  const cuts = [...events.keys()].sort((a, b) => a - b);
  const active = new Set(),
    dictionary = [],
    ids = new Map(),
    slabs = [];
  const distribution = new Map();
  for (let i = 0; i + 1 < cuts.length; i++) {
    const start = cuts[i],
      end = cuts[i + 1];
    for (const order of events.get(start).remove) active.delete(order);
    for (const order of events.get(start).add) active.add(order);
    const edges = [];
    for (const order of active) {
      const band = bands[order];
      if (!band.openLeft) edges.push({ a: courseBoundaryAt(band.left, start), b: courseBoundaryAt(band.left, end) });
      if (!band.openRight) edges.push({ a: courseBoundaryAt(band.right, start), b: courseBoundaryAt(band.right, end) });
    }
    const crossings = [0, 1];
    for (let a = 0; a < edges.length; a++)
      for (let b = a + 1; b < edges.length; b++) {
        const gap = edges[a].a - edges[b].a;
        const slope = edges[a].b - edges[a].a - edges[b].b + edges[b].a;
        const t = -gap / slope;
        if (t > 0 && t < 1) crossings.push(t);
      }
    const splits = [...new Set(crossings)].sort((a, b) => a - b);
    for (let j = 0; j + 1 < splits.length; j++) {
      const lo = splits[j],
        hi = splits[j + 1],
        mid = (lo + hi) / 2,
        s = at(start, end, mid);
      edges.sort((a, b) => at(a.a, a.b, mid) - at(b.a, b.b, mid));
      const unique = edges.filter((e, n) => n === 0 || e.a !== edges[n - 1].a || e.b !== edges[n - 1].b);
      const intervals = [];
      for (let n = 0; n <= unique.length; n++) {
        const left = unique[n - 1],
          right = unique[n];
        if (left && right && !(at(right.a, right.b, mid) > at(left.a, left.b, mid))) continue;
        let color = null,
          visible = -1;
        for (const order of active) {
          const band = bands[order];
          // Tails are tested by their open-side declaration, never with infinite coordinates.
          const covers = !left
            ? band.openLeft
            : !right
              ? band.openRight
              : (band.openLeft ||
                  courseBoundaryAt(band.left, s) <= (at(left.a, left.b, mid) + at(right.a, right.b, mid)) / 2) &&
                (band.openRight ||
                  courseBoundaryAt(band.right, s) > (at(left.a, left.b, mid) + at(right.a, right.b, mid)) / 2);
          if (covers && order > visible) {
            color = band.color;
            visible = order;
          }
        }
        const piece = {
          openLeft: !left,
          openRight: !right,
          left0: left ? at(left.a, left.b, lo) : 0,
          left1: left ? at(left.a, left.b, hi) : 0,
          right0: right ? at(right.a, right.b, lo) : 0,
          right1: right ? at(right.a, right.b, hi) : 0,
          color,
        };
        const previous = intervals.at(-1);
        if (previous && same(previous, piece)) {
          previous.right0 = piece.right0;
          previous.right1 = piece.right1;
          previous.openRight = piece.openRight;
        } else intervals.push(piece);
      }
      if (intervals.length > 64) throw new RangeError(`Resolved slab exceeds 64 intervals: ${intervals.length}`);
      const key = JSON.stringify(intervals);
      let row = ids.get(key);
      if (row === undefined) {
        row = dictionary.length;
        ids.set(key, row);
        dictionary.push(Object.freeze(intervals.map(Object.freeze)));
      }
      const a = at(start, end, lo),
        b = at(start, end, hi);
      slabs.push(
        Object.freeze({
          start: a,
          end: b,
          row,
          intervals: dictionary[row],
          opaque: intervals.some((piece) => piece.color !== null),
        }),
      );
      distribution.set(intervals.length, (distribution.get(intervals.length) ?? 0) + b - a);
    }
  }
  return Object.freeze({
    length,
    slabs: Object.freeze(slabs),
    dictionary: Object.freeze(dictionary),
    maximumIntervals: dictionary.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    distributionMetres: Object.freeze(Object.fromEntries(distribution)),
  });
}

/** Explicit little-endian packed artifact; returned storage belongs to the offline caller. */
export function packResolvedSlabs(source) {
  const intervalCount = source.dictionary.reduce((sum, row) => sum + row.length, 0);
  // Offsets locate 35-byte records: four float64 endpoints, int16 color (-1 = transparent), uint8 flags.
  const dictionaryBytes = 4 * (source.dictionary.length + 1) + 35 * intervalCount;
  const directoryBytes = 12 * source.slabs.length + 8;
  const bytes = new Uint8Array(16 + dictionaryBytes + directoryBytes);
  const view = new DataView(bytes.buffer);
  [1, source.dictionary.length, source.slabs.length, intervalCount].forEach((v, i) => view.setUint32(i * 4, v, true));
  let offset = 16 + 4 * (source.dictionary.length + 1),
    records = 0;
  source.dictionary.forEach((row, i) => {
    view.setUint32(16 + i * 4, records, true);
    for (const piece of row) {
      for (const key of ['left0', 'left1', 'right0', 'right1']) {
        view.setFloat64(offset, piece[key], true);
        offset += 8;
      }
      view.setInt16(offset, piece.color ?? -1, true);
      offset += 2;
      view.setUint8(offset++, Number(piece.openLeft) | (Number(piece.openRight) << 1));
      records++;
    }
  });
  view.setUint32(16 + source.dictionary.length * 4, records, true);
  for (const slab of source.slabs) {
    view.setFloat64(offset, slab.start, true);
    view.setUint32(offset + 8, slab.row, true);
    offset += 12;
  }
  view.setFloat64(offset, source.length, true);
  return { bytes, headerBytes: 16, dictionaryBytes, directoryBytes };
}
