import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { courseBoundaryAt } from '../../dist/course/course-bands.js';

const channels = (color) => [10, 5, 0].map((shift) => Math.round((((color >>> shift) & 31) * 255) / 31));
const interpolate = (a, b, t) => a + (b - a) * t;

/** Offline vector trial: authored metre-scale paint, never traced from image pixels. */
export function courseTrialBands(section) {
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
    // Preserve the existing Section phase, not its image or palette representation.
    const phase =
      section.presentation.ground.bands.find((entry) => entry.band === band)?.sections[0]?.paint.phaseS ?? 0;
    const left = grass && band.left.id === 'outer-left' ? constant(-section.presentation.ground.left) : band.left;
    const right = grass && band.right.id === 'outer-right' ? constant(section.presentation.ground.right) : band.right;
    let start = band.start.s;
    while (start < band.end.s) {
      const cell = period ? Math.floor((start - phase + 1e-9) / period) : 0;
      const end = period ? Math.min(band.end.s, phase + (cell + 1) * period) : band.end.s;
      bands.push({ start, end, left, right, color: colors[((cell % colors.length) + colors.length) % colors.length] });
      start = end;
    }
  }
  return bands;
}

/** Compile an exact planar arrangement for the trial. No pixel grid, texture or LOD is retained.
 * This deliberately measures a favourable case: occlusion and boundary crossings are resolved offline.
 * It is diagnostic data, not a proposed product schema or a substitute for runtime sweep qualification.
 */
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
        pieces.push({
          left0: interpolate(left.a, left.b, lo),
          left1: interpolate(left.a, left.b, hi),
          right0: interpolate(right.a, right.b, lo),
          right1: interpolate(right.a, right.b, hi),
          rgb: channels(bands[visible].color),
        });
      }
      slabs.push({ start: interpolate(start, end, lo), end: interpolate(start, end, hi), pieces });
    }
  }
  return { slabs, bandCount: bands.length, maximumActive, distributionMetres: Object.fromEntries(distribution) };
}

// Integral of clamp(linear(t), 0, width), t in [0,1]. Its breakpoints couple both source axes.
function clippedIntegral(a, b, width) {
  if (a > b) return clippedIntegral(b, a, width);
  if (b <= 0) return 0;
  if (a >= width) return width;
  if (a === b) return a;
  const slope = b - a;
  const lo = Math.max(0, -a / slope),
    hi = Math.min(1, (width - a) / slope);
  return (hi - lo) * (a + (slope * (lo + hi)) / 2) + (1 - hi) * width;
}

/** One shared row accumulator; only boundary pixels need clipped trapezoid integration. */
export function createBandTrialRaster(compiled, width = 320, transparencyThreshold = 0.5) {
  const area = new Float64Array(width),
    red = new Float64Array(width),
    green = new Float64Array(width),
    blue = new Float64Array(width);
  const { slabs } = compiled;
  let maximumFootprintSlabs = 0;
  return {
    get maximumFootprintSlabs() {
      return maximumFootprintSlabs;
    },
    sampleSpan(pixels, offset, count, s, l, stepL, deltaS) {
      if (!(deltaS > 0) || !(stepL > 0) || count > width) throw new RangeError('Invalid trial footprint');
      area.fill(0, 0, count);
      red.fill(0, 0, count);
      green.fill(0, 0, count);
      blue.fill(0, 0, count);
      const start = s - deltaS / 2,
        end = s + deltaS / 2;
      let lo = 0,
        hi = slabs.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (slabs[mid].end <= start) lo = mid + 1;
        else hi = mid;
      }
      let footprintSlabs = 0;
      for (let index = lo; index < slabs.length && slabs[index].start < end; index++) {
        const slab = slabs[index];
        const a = Math.max(start, slab.start),
          b = Math.min(end, slab.end),
          ds = b - a;
        if (ds <= 0 || slab.pieces.length === 0) continue;
        footprintSlabs++;
        const t0 = (a - slab.start) / (slab.end - slab.start),
          t1 = (b - slab.start) / (slab.end - slab.start);
        for (const piece of slab.pieces) {
          const l0 = interpolate(piece.left0, piece.left1, t0),
            l1 = interpolate(piece.left0, piece.left1, t1);
          const r0 = interpolate(piece.right0, piece.right1, t0),
            r1 = interpolate(piece.right0, piece.right1, t1);
          const first = Math.max(0, Math.floor((Math.min(l0, l1) - l) / stepL + 0.5));
          const last = Math.min(count - 1, Math.floor((Math.max(r0, r1) - l) / stepL + 0.5));
          const [r, g, bl] = piece.rgb;
          for (let x = first; x <= last; x++) {
            const pixelLeft = l + (x - 0.5) * stepL;
            const covered =
              ds *
              (clippedIntegral(r0 - pixelLeft, r1 - pixelLeft, stepL) -
                clippedIntegral(l0 - pixelLeft, l1 - pixelLeft, stepL));
            area[x] += covered;
            red[x] += covered * r;
            green[x] += covered * g;
            blue[x] += covered * bl;
          }
        }
      }
      maximumFootprintSlabs = Math.max(maximumFootprintSlabs, footprintSlabs);
      if (footprintSlabs === 0) return;
      const pixelArea = deltaS * stepL;
      for (let x = 0; x < count; x++) {
        const opaque = area[x];
        if (opaque <= pixelArea * (1 - transparencyThreshold)) continue;
        const scale = 31 / (255 * opaque);
        pixels[offset + x] = rgb555ToRgba(
          (Math.round(red[x] * scale) << 10) | (Math.round(green[x] * scale) << 5) | Math.round(blue[x] * scale),
        );
      }
    },
  };
}

export function createCourseBandTrial(course, resident) {
  const footprint = { deltaS: 0 };
  const reports = [];
  const readers = new Map(
    course.sections.map((section) => {
      const compiled = compileBandTrial(courseTrialBands(section));
      const raster = createBandTrialRaster(compiled);
      reports.push({ section: section.id, ...compiled, slabs: undefined, raster });
      const source = resident.forSection(section);
      return [
        section,
        {
          ...source,
          sampleSpan(pixels, offset, count, s, l, stepL, _level, lateralOrigin) {
            raster.sampleSpan(pixels, offset, count, s, l + lateralOrigin, stepL, footprint.deltaS);
          },
        },
      ];
    }),
  );
  return {
    ground: { ...resident, forSection: (section) => readers.get(section) },
    footprint,
    report: () =>
      reports.map(({ raster, ...report }) => ({ ...report, maximumFootprintSlabs: raster.maximumFootprintSlabs })),
  };
}
