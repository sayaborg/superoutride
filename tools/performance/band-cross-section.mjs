// Offline feasibility data only. Input slabs are already paint-ordered, disjoint trapezoids.
// A longitudinal average of a linear edge is a ramp in l, not a constant-color interval.
const zero = () => [0, 0, 0, 0];
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const interpolate = (a, b, t) => a + (b - a) * t;
const frozenRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));

/** Exact longitudinal averaging, retaining affine opaque/color moments along l. */
export function compileCrossSection(slabs, start, end) {
  if (!Array.isArray(slabs)) throw new TypeError('Expected compiled Band slabs');
  if (!finite(start) || !finite(end) || !(end > start)) throw new RangeError('Invalid bucket interval');
  const events = new Map();
  const base = zero();
  const rightBase = zero();
  const eventAt = (l) => {
    if (!events.has(l)) events.set(l, { jump: zero(), slope: zero() });
    return events.get(l);
  };
  const edge = (a, b, sign, moments) => {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    if (low === high) {
      const event = eventAt(low);
      for (let c = 0; c < 4; c++) event.jump[c] += sign * moments[c];
    } else {
      const first = eventAt(low);
      const last = eventAt(high);
      for (let c = 0; c < 4; c++) {
        const slope = (sign * moments[c]) / (high - low);
        first.slope[c] += slope;
        last.slope[c] -= slope;
      }
    }
  };
  for (const slab of slabs) {
    if (slab.end <= start) continue;
    if (slab.start >= end) break;
    const a = Math.max(start, slab.start);
    const b = Math.min(end, slab.end);
    if (!(b > a)) continue;
    const t0 = (a - slab.start) / (slab.end - slab.start);
    const t1 = (b - slab.start) / (slab.end - slab.start);
    const weight = (b - a) / (end - start);
    for (const piece of slab.pieces) {
      const moments = [weight, ...piece.rgb.map((channel) => channel * weight)];
      if (piece.openLeft) {
        for (let c = 0; c < 4; c++) base[c] += moments[c];
      } else {
        edge(interpolate(piece.left0, piece.left1, t0), interpolate(piece.left0, piece.left1, t1), 1, moments);
      }
      if (piece.openRight) {
        for (let c = 0; c < 4; c++) rightBase[c] += moments[c];
      } else {
        edge(interpolate(piece.right0, piece.right1, t0), interpolate(piece.right0, piece.right1, t1), -1, moments);
      }
    }
  }
  const knots = [...events.keys()]
    .filter((l) => events.get(l).jump.some((v) => v !== 0) || events.get(l).slope.some((v) => v !== 0))
    .sort((a, b) => a - b);
  const values = [base.slice()];
  const slopes = [zero()];
  let value = base.slice();
  let slope = zero();
  let previous = knots[0] ?? 0;
  for (const l of knots) {
    const event = events.get(l);
    value = value.map((v, c) => v + slope[c] * (l - previous) + event.jump[c]);
    slope = slope.map((v, c) => v + event.slope[c]);
    values.push(value);
    slopes.push(slope);
    previous = l;
  }
  // Tail moments follow open-side declarations exactly, rather than accumulated cancellation.
  if (knots.length) {
    values[values.length - 1] = rightBase;
    slopes[slopes.length - 1] = zero();
  }
  const finiteIntervalCount = Math.max(0, knots.length - 1);
  const leftTail = values[0].some((v) => v !== 0) ? 1 : 0;
  const rightTail = knots.length && values.at(-1).some((v) => v !== 0) ? 1 : 0;
  return Object.freeze({
    knots: Object.freeze(knots),
    values: frozenRows(values),
    slopes: frozenRows(slopes),
    finiteIntervalCount,
    intervalCount: finiteIntervalCount + leftTail + rightTail,
  });
}

export function createBandArea() {
  return { opaque: 0, red: 0, green: 0, blue: 0 };
}

/** Add one Section's contribution. Caller supplies source-frame l and the clipped s length. */
export function integrateCrossSection(section, left, right, longitudinalLength, out) {
  const { knots, values, slopes } = section;
  let low = 0;
  let high = knots.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (knots[mid] <= left) low = mid + 1;
    else high = mid;
  }
  let index = low;
  let position = left;
  while (position < right) {
    const end = index < knots.length ? Math.min(right, knots[index]) : right;
    const width = end - position;
    const origin = index === 0 ? position : knots[index - 1];
    const midpoint = (position + end) / 2 - origin;
    const scale = width * longitudinalLength;
    out.opaque += scale * (values[index][0] + slopes[index][0] * midpoint);
    out.red += scale * (values[index][1] + slopes[index][1] * midpoint);
    out.green += scale * (values[index][2] + slopes[index][2] * midpoint);
    out.blue += scale * (values[index][3] + slopes[index][3] * midpoint);
    position = end;
    index++;
  }
  return out;
}

/** Threshold once, after all Section/interval contributions; null preserves existing BG. */
export function resolveBandArea(out, pixelArea, transparencyThreshold) {
  if (!(out.opaque > pixelArea * (1 - transparencyThreshold))) return null;
  const scale = 31 / (255 * out.opaque);
  return (Math.round(out.red * scale) << 10) | (Math.round(out.green * scale) << 5) | Math.round(out.blue * scale);
}

/** Course-wide 1D dictionary; mutable interning state does not escape compilation. */
export function compileCrossSectionPyramids(sources, { minimumWidth, maximumFootprint }) {
  if (!Array.isArray(sources) || sources.length === 0) throw new TypeError('Expected Section inputs');
  if (!finite(minimumWidth) || !(minimumWidth > 0)) throw new RangeError('Invalid minimum bucket width');
  if (!finite(maximumFootprint) || maximumFootprint < minimumWidth) {
    throw new RangeError('Maximum footprint must cover the minimum bucket');
  }
  const dictionary = [];
  const identities = new Map();
  const sections = sources.map(({ id, slabs, length }) => {
    if (!finite(length) || !(length > 0)) throw new RangeError('Invalid Section length');
    const levels = [];
    let width = minimumWidth;
    for (;;) {
      const indices = [];
      const distribution = new Map();
      for (let start = 0, index = 0; start < length; start = ++index * width) {
        const end = Math.min(length, start + width);
        const section = compileCrossSection(slabs, start, end);
        const key = JSON.stringify(section);
        let identity = identities.get(key);
        if (identity === undefined) {
          identity = dictionary.length;
          dictionary.push(section);
          identities.set(key, identity);
        }
        indices.push(identity);
        distribution.set(section.intervalCount, (distribution.get(section.intervalCount) ?? 0) + 1);
      }
      const level = Object.freeze({
        width,
        indices: Object.freeze(indices),
        maximumIntervals: Math.max(...distribution.keys()),
        distribution: Object.freeze(Object.fromEntries([...distribution].sort((a, b) => a[0] - b[0]))),
      });
      levels.push(level);
      if (width >= maximumFootprint) break;
      width *= 2;
    }
    return Object.freeze({
      id,
      levels: Object.freeze(levels),
      maximumIntervals: Math.max(...levels.map((level) => level.maximumIntervals)),
      selectLevel(deltaS) {
        if (!finite(deltaS) || deltaS < 0) throw new RangeError('Invalid row footprint');
        if (deltaS < minimumWidth) return -1;
        let level = 0;
        while (level + 1 < levels.length && deltaS >= levels[level + 1].width) level++;
        return level;
      },
    });
  });
  return Object.freeze({
    dictionary: Object.freeze(dictionary),
    sections: Object.freeze(sections),
    dictionaryBytes: Buffer.byteLength(JSON.stringify(dictionary)),
    directoryBytes: sections.reduce(
      (sum, section) => sum + section.levels.reduce((bytes, level) => bytes + level.indices.length * 4, 0),
      0,
    ),
    maximumIntervals: Math.max(...sections.map((section) => section.maximumIntervals)),
  });
}
