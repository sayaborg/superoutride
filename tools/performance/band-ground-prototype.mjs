import { courseBoundaryAt } from '../../dist/course/course-bands.js';

const channels = (color) => [10, 5, 0].map((shift) => Math.round((((color >>> shift) & 31) * 255) / 31));
const interpolate = (a, b, t) => a + (b - a) * t;

/** Restore the retired direct trial's vector input and arrangement; no product format changes. */
export function courseTrialBands(section, wholePlane = false) {
  const bands = [];
  const constant = (l) => ({
    knots: [
      { anchor: { s: 0 }, l },
      { anchor: { s: section.raster.length }, l },
    ],
  });
  for (const band of section.bandPartition.bands) {
    const grass = band.id.includes('grass') || band.role === 'median';
    const kerb = band.id.includes('kerb');
    const stripe = band.id === 'center';
    const period = kerb ? 4 : stripe ? 5 : 0;
    const colors = grass ? [9799] : kerb ? [32767, 24806] : stripe ? [32767, 9548] : [9548];
    const phase =
      section.presentation.ground.bands.find((entry) => entry.band === band)?.sections[0]?.paint.phaseS ?? 0;
    const left = grass && band.left.id === 'outer-left' ? constant(-section.presentation.ground.left) : band.left;
    const right = grass && band.right.id === 'outer-right' ? constant(section.presentation.ground.right) : band.right;
    let start = band.start.s;
    while (start < band.end.s) {
      const cell = period ? Math.floor((start - phase + 1e-9) / period) : 0;
      const end = period ? Math.min(band.end.s, phase + (cell + 1) * period) : band.end.s;
      bands.push({
        start,
        end,
        left,
        right,
        color: colors[((cell % colors.length) + colors.length) % colors.length],
        openLeft: wholePlane && grass && band.left.id === 'outer-left',
        openRight: wholePlane && grass && band.right.id === 'outer-right',
      });
      start = end;
    }
  }
  return bands;
}

/** Resolve all paint order and edge intersections offline, exactly as the retired direct trial. */
export function compileBandTrial(bands) {
  const events = new Map();
  const event = (s) => {
    if (!events.has(s)) events.set(s, { add: [], remove: [] });
    return events.get(s);
  };
  bands.forEach((band, order) => {
    event(band.start).add.push(order);
    event(band.end).remove.push(order);
    for (const boundary of [band.left, band.right])
      for (const knot of boundary.knots)
        if (knot.anchor.s > band.start && knot.anchor.s < band.end) event(knot.anchor.s);
  });
  const cuts = [...events.keys()].sort((a, b) => a - b);
  const active = new Set();
  const slabs = [];
  const distribution = new Map();
  let maximumActive = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const start = cuts[i],
      end = cuts[i + 1];
    for (const order of events.get(start).remove) active.delete(order);
    for (const order of events.get(start).add) active.add(order);
    maximumActive = Math.max(maximumActive, active.size);
    distribution.set(active.size, (distribution.get(active.size) ?? 0) + end - start);
    const edges = [];
    for (const order of active)
      for (const boundary of [bands[order].left, bands[order].right])
        edges.push({ order, a: courseBoundaryAt(boundary, start), b: courseBoundaryAt(boundary, end) });
    const splits = [0, 1];
    for (let a = 0; a < edges.length; a++)
      for (let b = a + 1; b < edges.length; b++) {
        const gap = edges[a].a - edges[b].a;
        const slope = edges[a].b - edges[a].a - edges[b].b + edges[b].a;
        const crossing = -gap / slope;
        if (crossing > 0 && crossing < 1) splits.push(crossing);
      }
    const sorted = [...new Set(splits)].sort((a, b) => a - b);
    for (let j = 0; j + 1 < sorted.length; j++) {
      const lo = sorted[j],
        hi = sorted[j + 1],
        mid = (lo + hi) / 2;
      edges.sort((a, b) => interpolate(a.a, a.b, mid) - interpolate(b.a, b.b, mid));
      const pieces = [];
      for (let e = 0; e + 1 < edges.length; e++) {
        const left = edges[e],
          right = edges[e + 1];
        const lateral = (interpolate(left.a, left.b, mid) + interpolate(right.a, right.b, mid)) / 2;
        let visible = -1;
        for (const order of active) {
          const band = bands[order];
          const s = interpolate(start, end, mid);
          if (order > visible && courseBoundaryAt(band.left, s) <= lateral && courseBoundaryAt(band.right, s) > lateral)
            visible = order;
        }
        if (visible < 0 || bands[visible].color === null) continue;
        const piece = {
          left0: interpolate(left.a, left.b, lo),
          left1: interpolate(left.a, left.b, hi),
          right0: interpolate(right.a, right.b, lo),
          right1: interpolate(right.a, right.b, hi),
          rgb: channels(bands[visible].color),
        };
        const previous = pieces.at(-1);
        if (
          previous &&
          previous.right0 === piece.left0 &&
          previous.right1 === piece.left1 &&
          previous.rgb.every((value, index) => value === piece.rgb[index])
        ) {
          previous.right0 = piece.right0;
          previous.right1 = piece.right1;
        } else {
          pieces.push(piece);
        }
      }
      slabs.push({ start: interpolate(start, end, lo), end: interpolate(start, end, hi), pieces });
    }
  }
  return { slabs, bandCount: bands.length, maximumActive, distributionMetres: Object.fromEntries(distribution) };
}
