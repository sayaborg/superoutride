import type { StripSlabTarget } from '../../src/course/strip-ground.js';
import { stripEdgeAt } from '../../src/course/strip-slabs.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import type { SurfaceMaterial } from '../../src/course/surface-material.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { transformPlanarPoint } from '../../src/core/planar-transform.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { LineBuilder, MeshBuilder } from './viewer-gl.js';
import { createPlanClearance, sampleClearance } from '../../src/course/plan-clearance.js';
import { routeOccurrenceAt, sectionStations, type CourseLayout, type PlacedSection } from './viewer-layout.js';
import { routeS } from '../../src/course/course-route.js';
import { createRouteSkies } from '../../src/view/route-sky.js';
import { createRouteGroundSampler } from '../../src/view/course-route-visual-readers.js';
import { createStripRenderMetrics } from '../../src/view/strip-ground-sampler.js';

/**
 * The ground and the walls as the game's Strips declare them, each resolved slab drawn as it is: the ground's cross
 * sections between stations, its colors (or its materials), within the course limits and out to the display width beyond
 * them, its color pairs mixed within a change of sky as the game mixes them; each visible wall along its Boundary, its
 * Strips' colors by height.
 */

/** A placed Section's road frame at a station: its centreline point (relative to the origin), right normal and height. */
export interface StationFrame {
  x: number;
  z: number;
  nx: number;
  nz: number;
  y: number;
}

const frameSample = createPlanCoordinateSample();

export function stationFrame(layout: CourseLayout, placed: PlacedSection, s: number, out: StationFrame): StationFrame {
  const native = placed.section.coordinates.toWorld(s, 0, frameSample);
  const world = transformPlanarPoint(placed.worldFromSection, native);
  out.x = world.x - layout.origin.x;
  out.z = world.z - layout.origin.z;
  const heading = native.heading + placed.rotation;
  out.nx = Math.cos(heading);
  out.nz = -Math.sin(heading);
  out.y = placed.section.height.sample(s);
  return out;
}

/** The point `l` right of a frame's centreline and `up` above its road, appended to `out`. */
export function framePoint(frame: StationFrame, l: number, up: number, out: number[]): void {
  out.push(frame.x + l * frame.nx, frame.y + up, frame.z + l * frame.nz);
}

/** An RGB555 color as the game presents it (`rgb555ToRgba`), its RGBA bytes. */
export function rgb555Bytes(value: number): number[] {
  const { r, g, b, a } = unpackRgba(rgb555ToRgba(value));
  return [r, g, b, a];
}

/** A distinct color for each material, by its place in the catalog. */
export function materialColor(material: SurfaceMaterial, index: number): number[] {
  void material;
  const hue = (index * 0.61803398875) % 1;
  const f = (n: number) => {
    const k = (n + hue * 6) % 6;
    return Math.round(255 * (0.75 - 0.5 * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1), 255];
}

/** One slab's spans as affine edges over `[start, end]`: each span's color (null for none) and its edges' laterals. */
interface Slab {
  readonly start: number;
  readonly end: number;
  readonly spans: readonly {
    readonly color: readonly number[] | null;
    readonly left: [number, number];
    readonly right: [number, number];
  }[];
}

function colorSlabs(ground: {
  readonly reader: { readonly slabCount: number; readSlab(i: number, t: StripSlabTarget): StripSlabTarget };
}): Slab[] {
  const target: StripSlabTarget = { start: 0, end: 0, colors: [], edges: [] };
  const slabs: Slab[] = [];
  for (let i = 0; i < ground.reader.slabCount; i++) {
    ground.reader.readSlab(i, target);
    const n = target.colors.length;
    slabs.push({
      start: target.start,
      end: target.end,
      spans: target.colors.map((color, k) => ({
        color: color < 0 ? null : rgb555Bytes(color),
        left: k === 0 ? [-Infinity, -Infinity] : [target.edges[2 * k - 2]!, target.edges[2 * k - 1]!],
        right: k === n - 1 ? [Infinity, Infinity] : [target.edges[2 * k]!, target.edges[2 * k + 1]!],
      })),
    });
  }
  return slabs;
}

function materialSlabs(placed: PlacedSection, colors: ReadonlyMap<string, readonly number[]>): Slab[] {
  return placed.section.material.slabs.map((slab) => ({
    start: slab.start,
    end: slab.end,
    spans: slab.spans.map((span) => ({
      color: span.value === null ? null : colors.get(span.value.id)!,
      left: [stripEdgeAt(span, 'left', slab.start), stripEdgeAt(span, 'left', slab.end)],
      right: [stripEdgeAt(span, 'right', slab.start), stripEdgeAt(span, 'right', slab.end)],
    })),
  }));
}

/** Metres along s: within a change of sky, each step this long from its knot takes the share at its middle. */
const MIX_STEP = 1;

/**
 * The ground's color pairs mixed along the Route as the game mixes them: within a change of sky (`createRouteSkies`), a
 * piece divided at the edges of both its new colors and its old, each part in the colors the game's ground
 * (`createRouteGroundSampler`) gives at its middle with the share at the middle of its step.
 */
function routeMix(layout: CourseLayout) {
  const route = layout.route;
  const skies = createRouteSkies()({
    occurrences: route,
    start: route[0]!.start,
    at: (s) => routeOccurrenceAt(route, s),
  });
  /** Route station `s`, or within a change the middle of its step. */
  const stepMiddle = (s: number) => {
    let i = skies.changes.length - 1;
    while (i >= 0 && skies.changes[i]!.start > s) i--;
    const change = skies.changes[i];
    if (!change || !(s < change.start + change.length)) return s;
    const from = change.start + Math.floor((s - change.start) / MIX_STEP) * MIX_STEP;
    return from + Math.min(MIX_STEP, change.start + change.length - from) / 2;
  };
  const sampler = createRouteGroundSampler(route, (s) => skies.shareAt(stepMiddle(s)));
  const pixel = new Uint16Array(1),
    stats = createStripRenderMetrics();
  const olds = new Map<PlacedSection, Slab[]>();
  const old = (placed: PlacedSection) => {
    let slabs = olds.get(placed);
    if (!slabs) olds.set(placed, (slabs = colorSlabs(placed.section.colorFrom!)));
    return slabs;
  };
  /** Each edge between two of `slab`'s spans over `[a, b]`: its laterals at `a` and `b`. */
  const edges = (slab: Slab, a: number, b: number) => {
    const ta = (a - slab.start) / (slab.end - slab.start),
      tb = (b - slab.start) / (slab.end - slab.start);
    return slab.spans.slice(1).map((span): [number, number] => [lerp(span.left, ta), lerp(span.left, tb)]);
  };
  return {
    /**
     * The stations of `placed` within a change: its steps' ends and its old colors' slab ends; none without pairs.
     */
    cuts(placed: PlacedSection): number[] {
      if (!placed.section.colorFrom) return [];
      const start = placed.occurrence.start,
        length = placed.section.coordinates.domain.end;
      const out: number[] = [];
      for (const change of skies.changes) {
        if (change.length === 0) continue;
        const a = change.start - start,
          b = a + change.length;
        for (let k = 0, s = a; s < b; s = a + ++k * MIX_STEP) out.push(s);
        out.push(b);
        for (const slab of old(placed)) if (slab.start > a && slab.start < b) out.push(slab.start);
      }
      return out.filter((s) => s > 0 && s < length);
    },
    /**
     * `slab` over `[a, b]` of `placed`, within one step of a change divided at the edges of its new colors and its old,
     * each part in the game's colors at its middle; `slab` itself elsewhere.
     */
    at(placed: PlacedSection, slab: Slab, a: number, b: number): Slab {
      const s = (a + b) / 2,
        station = routeS(placed.occurrence, s);
      if (!placed.section.colorFrom || skies.shareAt(station) === 1) return slab;
      const lines = [...edges(slab, a, b), ...edges(slabAt(old(placed), s), a, b)].sort(
        (p, q) => p[0] + p[1] - q[0] - q[1],
      );
      const bounds: [number, number][] = [[-Infinity, -Infinity], ...lines, [Infinity, Infinity]];
      const origin = placed.occurrence.lateralOrigin;
      return {
        start: a,
        end: b,
        spans: bounds.slice(1).map((right, i) => {
          const left = bounds[i]!;
          // The part's middle, or a metre within its one edge, or the centreline without edges.
          const lm = (left[0] + left[1]) / 2,
            rm = (right[0] + right[1]) / 2;
          const l = Number.isFinite(lm)
            ? Number.isFinite(rm)
              ? (lm + rm) / 2
              : lm + 1
            : Number.isFinite(rm)
              ? rm - 1
              : 0;
          // A pixel the game leaves unwritten is transparent.
          pixel[0] = 0xffff;
          sampler.sampleSpan(pixel, 0, 1, station, l - origin, 0, 0, stats);
          return { color: pixel[0] === 0xffff ? null : rgb555Bytes(pixel[0]!), left, right };
        }),
      };
    },
  };
}

const lerp = (pair: readonly number[], t: number) =>
  pair[0] === pair[1] ? pair[0]! : pair[0]! + (pair[1]! - pair[0]!) * t;

/**
 * The course limits at `a` and `b`, within one material slab: the outer edges of its covered material
 * (`materialOuterEdges`), continuous where slabs meet.
 */
export function courseLimits(placed: PlacedSection, a: number, b: number) {
  const at = placed.limits.at(a, { left: 0, right: 0 }),
    to = placed.limits.at(b, { left: 0, right: 0 });
  return { left: [at.left, to.left], right: [at.right, to.right] };
}

/** The farthest any drawn ground reaches from a Section's centreline. */
function drawnReach(placed: PlacedSection, width: number): number {
  let reach = 0;
  const edges = { left: 0, right: 0 };
  for (const s of placed.limits.stations) {
    placed.limits.at(s, edges);
    reach = Math.max(reach, Math.abs(edges.left), Math.abs(edges.right));
  }
  return reach + width;
}

/** Stations within `[a, b]` of the sorted `stations`, with `a` and `b`. */
function within(stations: readonly number[], a: number, b: number): number[] {
  const out = [a];
  between(stations, a, b, out);
  out.push(b);
  return out;
}

/** Stations of the sorted `stations` strictly within `(a, b)`. */
function between(stations: readonly number[], a: number, b: number, out: number[]): void {
  let lo = 0,
    hi = stations.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (stations[mid]! <= a) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < stations.length && stations[i]! < b; i++) out.push(stations[i]!);
}

/** The slab of the sorted `slabs` holding station `s` (half-open, the last owning the end). */
function slabAt(slabs: readonly Slab[], s: number): Slab {
  let lo = 0,
    hi = slabs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (slabs[mid]!.start <= s) lo = mid + 1;
    else hi = mid;
  }
  return slabs[Math.max(0, lo - 1)]!;
}

/**
 * One drawn piece of ground over `[a, b]`: a span's color, its edges' laterals at `a` and `b`, how far beyond its
 * course limit each corner lies, and whether it lies beyond the plan's clearance (where the plan stops being one-to-one).
 */
interface Piece {
  readonly color: readonly number[];
  /** Which side of each limit and clearance line it lies on, as one number. */
  readonly part: number;
  readonly unclear: boolean;
  a: number;
  b: number;
  readonly left: [number, number];
  readonly right: [number, number];
  readonly beyond: [number, number, number, number];
}

type Pair = readonly [number, number];

/**
 * The pieces `slab`'s colored spans draw over `[a, b]`, within the course limits and `width` beyond them, divided at the
 * limits and at the clearance lines (each a lateral at `a` and `b`).
 */
function slabPieces(
  slab: Slab,
  a: number,
  b: number,
  limits: { left: number[]; right: number[] },
  clearance: { left: Pair; right: Pair },
  width: number,
  out: Piece[],
) {
  const ta = (a - slab.start) / (slab.end - slab.start),
    tb = (b - slab.start) / (slab.end - slab.start);
  const clip = { left: limits.left.map((l) => l - width), right: limits.right.map((l) => l + width) };
  const at = (pair: readonly number[], u: number) => pair[0]! + (pair[1]! - pair[0]!) * u;
  const breaks = [limits.left, limits.right, clearance.left, clearance.right];
  for (const span of slab.spans) {
    if (!span.color) continue;
    const eL = [lerp(span.left, ta), lerp(span.left, tb)],
      eR = [lerp(span.right, ta), lerp(span.right, tb)];
    // Where any two of these lines cross, the drawn edges change line or order.
    const cuts = [0, 1];
    const lines = [eL, eR, clip.left, clip.right, ...breaks];
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const d0 = lines[i]![0]! - lines[j]![0]!,
          d1 = lines[i]![1]! - lines[j]![1]!;
        if (Number.isFinite(d0) && Number.isFinite(d1) && d0 * d1 < 0) cuts.push(d0 / (d0 - d1));
      }
    cuts.sort((x, y) => x - y);
    const lo = (u: number) => Math.max(Number.isFinite(eL[0]!) ? at(eL, u) : -Infinity, at(clip.left, u));
    const hi = (u: number) => Math.min(Number.isFinite(eR[0]!) ? at(eR, u) : Infinity, at(clip.right, u));
    const beyond = (l: number, u: number) => Math.max(0, at(limits.left, u) - l, l - at(limits.right, u));
    for (let k = 0; k + 1 < cuts.length; k++) {
      const u0 = cuts[k]!,
        u1 = cuts[k + 1]!;
      if (u1 <= u0) continue;
      const um = (u0 + u1) / 2;
      if (!(hi(um) > lo(um))) continue;
      // Across, divided at every limit and clearance line between its edges, in their order here.
      const edges = [
        lo,
        ...breaks
          .filter((line) => at(line, um) > lo(um) && at(line, um) < hi(um))
          .sort((p, q) => at(p, um) - at(q, um))
          .map((line) => (u: number) => at(line, u)),
        hi,
      ];
      for (let piece = 0; piece + 1 < edges.length; piece++) {
        const left = edges[piece]!,
          right = edges[piece + 1]!;
        const middle = (left(um) + right(um)) / 2;
        const sides = breaks.map((line) => middle > at(line, um));
        out.push({
          color: span.color,
          part: sides.reduce((sum, side, i) => sum + (side ? 1 << i : 0), 0),
          unclear: !sides[2] || sides[3]!,
          a: a + (b - a) * u0,
          b: u1 === 1 ? b : a + (b - a) * u1,
          left: [left(u0), left(u1)],
          right: [right(u0), right(u1)],
          beyond: [beyond(left(u0), u0), beyond(right(u0), u0), beyond(left(u1), u1), beyond(right(u1), u1)],
        });
      }
    }
  }
}

/** Whether `next` continues `run` along the same color and lines, so the two draw as one quad. */
function continues(run: Piece, next: Piece): boolean {
  if (run.part !== next.part || run.b !== next.a || run.color.some((c, i) => c !== next.color[i])) return false;
  const same = (p: readonly number[], q: readonly number[]) => {
    const tolerance = 1e-9 * Math.max(1, Math.abs(p[1]!));
    const slopeRun = (p[1]! - p[0]!) / (run.b - run.a),
      slopeNext = (q[1]! - q[0]!) / (next.b - next.a);
    return Math.abs(p[1]! - q[0]!) <= tolerance && Math.abs(slopeRun - slopeNext) * (next.b - run.a) <= tolerance;
  };
  return same(run.left, next.left) && same(run.right, next.right);
}

/**
 * The plan's clearance on each side of a Section as the compiler samples it (`sampleClearance`), asked as far as the
 * drawn ground reaches (with a metre more): a polyline of laterals (left negative) at its stations.
 */
function sectionClearance(placed: PlacedSection, width: number) {
  const section = placed.section;
  const length = section.coordinates.domain.end;
  const path = { segments: section.segments, length };
  const base = [
    ...new Set([
      0,
      length,
      ...section.segments.flatMap((p) => [p.sStart, p.sEnd]),
      ...section.material.slabs.flatMap((slab) => [slab.start, slab.end]),
    ]),
  ]
    .filter((s) => s >= 0 && s <= length)
    .sort((x, y) => x - y);
  const clearance = createPlanClearance(path);
  const side = (sign: 1 | -1) => {
    const asked = (s: number) => {
      const limits = courseLimits(placed, s, s);
      return Math.max(0, sign * (sign > 0 ? limits.right[0]! : limits.left[0]!) + width) + 1;
    };
    return sampleClearance(path, sign, asked, base, clearance).map((sample) => ({
      s: sample.s,
      l: sign * sample.c,
      shown: sample.c < sample.bound,
    }));
  };
  return { left: side(-1), right: side(1) };
}

/** A clearance polyline's lateral at `s`, between its samples. */
function clearanceAt(samples: readonly { s: number; l: number }[], s: number): number {
  let lo = 0,
    hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid]!.s <= s) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.min(Math.max(0, lo - 1), samples.length - 2);
  const p = samples[i]!,
    q = samples[i + 1]!;
  return q.s === p.s ? p.l : p.l + ((q.l - p.l) * (s - p.s)) / (q.s - p.s);
}

/**
 * The ground of every placed Section, colored by its Strips or, with `materials`, by its materials; the marks on what of
 * it lies beyond the plan's clearance; and the clearance lines where they cross the drawn ground.
 */
export function buildGround(
  layout: CourseLayout,
  width: number,
  materials: ReadonlyMap<string, readonly number[]> | null,
): { ground: MeshBuilder; unclear: MeshBuilder; clearance: LineBuilder } {
  const mesh = new MeshBuilder(),
    unclear = new MeshBuilder(),
    lines = new LineBuilder();
  const f0 = blankFrame(),
    f1 = blankFrame(),
    p0 = blankFrame(),
    p1 = blankFrame();
  const corners: number[] = [];
  const mix = materials ? null : routeMix(layout);
  for (const placed of layout.sections) {
    const section = placed.section;
    const slabs = materials ? materialSlabs(placed, materials) : colorSlabs(section.color);
    const length = section.coordinates.domain.end;
    const clearance = sectionClearance(placed, width);
    for (const samples of [clearance.left, clearance.right])
      for (let i = 0; i + 1 < samples.length; i++) {
        const p = samples[i]!,
          q = samples[i + 1]!;
        if (!p.shown && !q.shown) continue;
        const points: number[] = [];
        framePoint(stationFrame(layout, placed, p.s, f0), p.l, 0.08, points);
        framePoint(stationFrame(layout, placed, q.s, f0), q.l, 0.08, points);
        lines.segment(points.slice(0, 3), points.slice(3), [255, 255, 255, 255]);
      }
    // The surface is straight between these stations; slab ends and clearance samples between them lie on its pieces.
    const stations = sectionStations(section, 0, length, drawnReach(placed, width));
    const cuts = [
      ...new Set([
        ...slabs.map((slab) => slab.start),
        ...section.material.slabs.map((slab) => slab.start),
        ...clearance.left.map((sample) => sample.s),
        ...clearance.right.map((sample) => sample.s),
        ...(mix ? mix.cuts(placed) : []),
      ]),
    ].sort((x, y) => x - y);
    for (let g = 0; g + 1 < stations.length; g++) {
      const g0 = stations[g]!,
        g1 = stations[g + 1]!;
      stationFrame(layout, placed, g0, f0);
      stationFrame(layout, placed, g1, f1);
      const inner = [g0];
      between(cuts, g0, g1, inner);
      inner.push(g1);
      let open: Piece[] = [];
      const emit = (run: Piece) => {
        lerpFrame(f0, f1, (run.a - g0) / (g1 - g0), p0);
        lerpFrame(f0, f1, (run.b - g0) / (g1 - g0), p1);
        corners.length = 0;
        framePoint(p0, run.left[0], 0, corners);
        framePoint(p0, run.right[0], 0, corners);
        framePoint(p1, run.left[1], 0, corners);
        framePoint(p1, run.right[1], 0, corners);
        mesh.quad(corners, run.color, run.beyond);
        if (run.unclear) unclear.quad(corners, UNCLEAR);
      };
      for (let i = 0; i + 1 < inner.length; i++) {
        const a = inner[i]!,
          b = inner[i + 1]!;
        if (!(b > a)) continue;
        const pieces: Piece[] = [];
        const clear = {
          left: [clearanceAt(clearance.left, a), clearanceAt(clearance.left, b)] as const,
          right: [clearanceAt(clearance.right, a), clearanceAt(clearance.right, b)] as const,
        };
        const slab = slabAt(slabs, (a + b) / 2);
        slabPieces(mix ? mix.at(placed, slab, a, b) : slab, a, b, courseLimits(placed, a, b), clear, width, pieces);
        // A piece continuing a run's color and lines extends it; a run that ends before `b` is drawn.
        for (const piece of pieces) {
          const run = open.find((candidate) => continues(candidate, piece));
          if (!run) {
            open.push(piece);
            continue;
          }
          run.b = piece.b;
          run.left[1] = piece.left[1];
          run.right[1] = piece.right[1];
          run.beyond[2] = piece.beyond[2];
          run.beyond[3] = piece.beyond[3];
        }
        open = open.filter((run) => run.b === b || (emit(run), false));
      }
      for (const run of open) emit(run);
    }
  }
  return { ground: mesh, unclear, clearance: lines };
}

/** The mark on ground beyond the plan's clearance. */
const UNCLEAR = [255, 0, 200, 110];

/** The surface's frame a share `t` of the way between two stations' frames: the straight piece between them. */
function lerpFrame(a: StationFrame, b: StationFrame, t: number, out: StationFrame): StationFrame {
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.nx = a.nx + (b.nx - a.nx) * t;
  out.nz = a.nz + (b.nz - a.nz) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}

const blankFrame = (): StationFrame => ({ x: 0, z: 0, nx: 0, nz: 0, y: 0 });

/** Every visible wall: a surface standing on its Boundary, its Strips' colors by height above the road. */
export function buildWalls(layout: CourseLayout): MeshBuilder {
  const mesh = new MeshBuilder();
  const f0 = blankFrame(),
    f1 = blankFrame();
  for (const placed of layout.sections)
    for (const wall of placed.section.appearance.walls) {
      const slabs = colorSlabs(wall.color);
      const reach = Math.max(...wall.boundary.vertices.map((v) => Math.abs(v.l)));
      const stations = sectionStations(placed.section, wall.start, wall.end, reach, [
        ...slabs.map((slab) => slab.start + wall.start),
        ...wall.boundary.vertices.map((v) => v.at.s),
      ]);
      for (const slab of slabs) {
        const cuts = within(stations, slab.start + wall.start, slab.end + wall.start);
        for (let i = 0; i + 1 < cuts.length; i++) {
          const a = cuts[i]!,
            b = cuts[i + 1]!;
          if (!(b > a)) continue;
          stationFrame(layout, placed, a, f0);
          stationFrame(layout, placed, b, f1);
          const la = courseBoundaryAt(wall.boundary, a),
            lb = courseBoundaryAt(wall.boundary, b);
          const ta = (a - wall.start - slab.start) / (slab.end - slab.start),
            tb = (b - wall.start - slab.start) / (slab.end - slab.start);
          for (const span of slab.spans) {
            if (!span.color) continue;
            const bottom = [Math.max(wall.bottom, lerp(span.left, ta)), Math.max(wall.bottom, lerp(span.left, tb))],
              top = [Math.min(wall.top, lerp(span.right, ta)), Math.min(wall.top, lerp(span.right, tb))];
            if (!(top[0]! > bottom[0]! || top[1]! > bottom[1]!)) continue;
            const p: number[] = [];
            framePoint(f0, la, bottom[0]!, p);
            framePoint(f0, la, Math.max(bottom[0]!, top[0]!), p);
            framePoint(f1, lb, bottom[1]!, p);
            framePoint(f1, lb, Math.max(bottom[1]!, top[1]!), p);
            mesh.quad(p, span.color, undefined, [f0.y, f0.y, f1.y, f1.y]);
          }
        }
      }
    }
  return mesh;
}
