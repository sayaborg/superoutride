import { normalFromHeading, tangentFromHeading } from '../core/math.js';
import { samplePlanPath, type CompiledPlanSegment, type PlanPath, type PlanPathSample } from './geometry/plan-path.js';
import { MAXIMUM_VEHICLE_REACH } from './course-coordinate-domain.js';
import { stripEdgeAt, stripSlabAt, type StripPiece } from './strip-slabs.js';
import type { StripMaterial } from './strip-material.js';
import type { SurfaceMaterial } from './surface-material.js';

/**
 * The most a sampled cell of an arc turns, five degrees: with the clearance's sampling at the extent's own scale it sets
 * how finely a curve's clearance is followed, not whether it holds.
 */
const CELL_TURN_RADIANS = Math.PI / 36;
/**
 * Metres: how closely the clip line follows the clearance less the reach. The line is a polyline under a curved
 * clearance, so it needs a tolerance; a centimetre is far below anything a driver or a picture resolves, and keeps the
 * clips to cells of metres. The line lies this much inside, so a chord within it of the clearance keeps out of it.
 */
const CLEARANCE_TOLERANCE_METERS = 0.01;
/** Metres: the side of the grid that finds the segments near a station, about the clearance asked for. */
const GRID_CELL_METERS = 64;
/** A grid cell's key is its row times this plus its column: far more columns than any Section spans. */
const GRID_ROW = 2 ** 24;
/** Halvings of a sampled cell at most: a cell of metres halved this often is far below the tolerance's scale. */
const MAXIMUM_HALVINGS = 24;

/**
 * The plan's clearance ([Architecture](../../docs/architecture.md#plan-authority)): at station `s` on side `side` (1
 * right, −1 left), up to `bound`, the radius of the largest circle tangent to the plan there on that side whose inside
 * holds no point of the Section's plan, its distance to the plan's medial axis there. The segment through `s`, and one
 * ending within `CLEARANCE_TOLERANCE_METERS` of it, limits it to its own radius on a curve's inside: as `s` nears a
 * joint, the neighbour's limit nears its radius, and its end and touch would divide vanishing lengths. Every other
 * segment limits it exactly: the circles grow nested from the tangent point, so one first meets a segment at an end or
 * where it touches the segment's line or circle.
 */
export function createPlanClearance(path: PlanPath): (s: number, side: 1 | -1, bound: number) => number {
  const scratch: PlanPathSample = { x: 0, z: 0, s: 0, heading: 0, segmentIndex: 0 };
  // Each segment's ends, and its middle and half length (a circle holding the whole segment).
  const features = path.segments.map((segment) => {
    const end = samplePlanPath(path, segment.sEnd, { ...scratch });
    const middle = samplePlanPath(path, (segment.sStart + segment.sEnd) / 2, { ...scratch });
    return { segment, end, middle, half: (segment.sEnd - segment.sStart) / 2 };
  });
  // The features by grid cell, each in every cell its holding circle meets.
  const cells = new Map<number, number[]>();
  const cellOf = (x: number) => Math.floor(x / GRID_CELL_METERS);
  features.forEach(({ middle, half }, index) => {
    for (let i = cellOf(middle.x - half); i <= cellOf(middle.x + half); i++)
      for (let j = cellOf(middle.z - half); j <= cellOf(middle.z + half); j++) {
        const key = i * GRID_ROW + j;
        const list = cells.get(key);
        if (list) list.push(index);
        else cells.set(key, [index]);
      }
  });
  const seen = new Int32Array(features.length).fill(-1);
  let query = 0;
  const sample = { ...scratch };
  return (s, side, bound) => {
    samplePlanPath(path, s, sample);
    const normal = normalFromHeading(sample.heading);
    const [px, pz, nx, nz] = [sample.x, sample.z, side * normal.x, side * normal.z];
    query++;
    // The radius at which the circle tangent at p first holds point q: |q − p|² / 2(q − p)·n, if q lies on its side.
    const through = (qx: number, qz: number) => {
      const [dx, dz] = [qx - px, qz - pz];
      const along = dx * nx + dz * nz;
      return along > 0 ? (dx * dx + dz * dz) / (2 * along) : Infinity;
    };
    let limit = bound;
    // The circle up to the bound lies within twice the bound of p: the segments of the cells that square meets.
    for (let i = cellOf(px - 2 * bound); i <= cellOf(px + 2 * bound); i++)
      for (let j = cellOf(pz - 2 * bound); j <= cellOf(pz + 2 * bound); j++)
        for (const index of cells.get(i * GRID_ROW + j) ?? []) {
          if (seen[index] === query) continue;
          seen[index] = query;
          const { segment, end, middle, half } = features[index]!;
          // A segment through s, or ending within the tolerance of it: its own curve, on its inside, is as far as its
          // radius. Beside a joint a neighbour's end and touch would divide vanishing lengths.
          if (segment.sStart - CLEARANCE_TOLERANCE_METERS <= s && s <= segment.sEnd + CLEARANCE_TOLERANCE_METERS) {
            if (segment.curvature !== 0 && Math.sign(segment.curvature) === side)
              limit = Math.min(limit, 1 / Math.abs(segment.curvature));
            continue;
          }
          if (Math.hypot(middle.x - px, middle.z - pz) - half >= 2 * limit) continue;
          limit = Math.min(limit, through(segment.start.x, segment.start.z), through(end.x, end.z));
          const touch = touching(segment, px, pz, nx, nz);
          if (touch < limit) limit = touch;
        }
    return limit;
  };
}

/**
 * The radius at which the circle tangent at p with inward normal n first touches the segment's own line or circle, if
 * that touch lies on the segment; otherwise infinite.
 */
function touching(segment: CompiledPlanSegment, px: number, pz: number, nx: number, nz: number): number {
  const { start } = segment;
  if (segment.geometry.kind === 'straight') {
    const tangent = tangentFromHeading(start.heading);
    const normal = normalFromHeading(start.heading);
    const offset = (px - start.x) * normal.x + (pz - start.z) * normal.z;
    const facing = Math.sign(offset) * (nx * normal.x + nz * normal.z);
    if (offset === 0 || facing >= 1) return Infinity;
    const r = Math.abs(offset) / (1 - facing);
    const along = (px + r * nx - start.x) * tangent.x + (pz + r * nz - start.z) * tangent.z;
    return along >= 0 && along <= segment.sEnd - segment.sStart ? r : Infinity;
  }
  const { radius, turn } = segment.geometry;
  // In the start's frame: `u` along its tangent, `v` toward the centre, (0, radius); the circle's normal likewise.
  const sign = Math.sign(turn);
  const tangent = tangentFromHeading(start.heading);
  const normal = normalFromHeading(start.heading);
  const [ax, az] = [px - start.x, pz - start.z];
  const [u, v] = [ax * tangent.x + az * tangent.z, sign * (ax * normal.x + az * normal.z)];
  const [nu, nv] = [nx * tangent.x + nz * tangent.z, sign * (nx * normal.x + nz * normal.z)];
  // p's squared distance from the centre less the radius squared, and its offset from the centre along n.
  const excess = u * u + v * v - 2 * radius * v;
  // From outside, the circles touch it from without (if they reach it at all); from inside, from within.
  const toward = radius * (1 + nv) - u * nu - v * nv;
  const r =
    excess > 0
      ? toward > 0
        ? excess / (2 * toward)
        : Infinity
      : -excess / (2 * (u * nu + v * nv + radius * (1 - nv)));
  if (!(r < Infinity)) return Infinity;
  const [uo, vo] = [u + r * nu, v + r * nv];
  const swept = Math.atan2(uo / radius, 1 - vo / radius);
  return (swept < 0 ? swept + 2 * Math.PI : swept) <= Math.abs(turn) ? r : Infinity;
}

/**
 * The material table's clips ([Architecture](../../docs/architecture.md#plan-authority)): on each side, where the
 * plan's clearance falls short of the outer covered edge plus `MAXIMUM_VEHICLE_REACH`, a piece of no material beyond the
 * clip line, declared after the Section's material so that it overrides it. The line is a polyline through the
 * clearance less the reach and `CLEARANCE_TOLERANCE_METERS`, sampled at the segments' and the slabs' ends, at cells no
 * longer than the extent asked for nor turning more than five degrees, and halved wherever the clearance lies more than
 * the tolerance below the line between its samples; so it keeps within the clearance less the reach. Each clip begins
 * and ends on the edge it crosses.
 */
export function clearanceClips(path: PlanPath, material: StripMaterial): StripPiece<SurfaceMaterial | null>[] {
  const clips: StripPiece<SurfaceMaterial | null>[] = [];
  const length = path.length;
  // The outer covered edge each side at s (lateral), or null where the slab covers nothing.
  const covered = material.slabs.map((slab) => slab.spans.filter((span) => span.value !== null));
  const outer = (s: number, side: 1 | -1) => {
    const spans = covered[stripSlabAt(material.slabs, s)]!;
    if (!spans.length) return null;
    return side > 0 ? stripEdgeAt(spans.at(-1)!, 'right', s) : stripEdgeAt(spans[0]!, 'left', s);
  };
  const base = [
    ...new Set([
      0,
      length,
      ...path.segments.flatMap((segment) => [segment.sStart, segment.sEnd]),
      ...material.slabs.flatMap((slab) => [slab.start, slab.end]),
    ]),
  ]
    .filter((s) => s >= 0 && s <= length)
    .sort((a, b) => a - b);
  const clearance = createPlanClearance(path);
  for (const side of [1, -1] as const) {
    // The clearance asked for at s: the outer edge's distance plus the reach and the tolerance (0 with no material
    // there); where the plan leaves that much, the clearance returns it unchanged.
    const asked = (s: number) => {
      const edge = outer(s, side);
      return edge === null ? 0 : Math.max(0, side * edge + MAXIMUM_VEHICLE_REACH + CLEARANCE_TOLERANCE_METERS);
    };
    const sample = (s: number) => {
      const bound = asked(s);
      return { s, bound, c: bound > 0 ? clearance(s, side, bound) : 0 };
    };
    type Sample = ReturnType<typeof sample>;
    const samples: Sample[] = [];
    const refine = (a: Sample, b: Sample, depth: number) => {
      const m = sample((a.s + b.s) / 2);
      if (depth < MAXIMUM_HALVINGS && m.c < (a.c + b.c) / 2 - CLEARANCE_TOLERANCE_METERS) {
        refine(a, m, depth + 1);
        samples.push(m);
        refine(m, b, depth + 1);
      }
    };
    let index = 0;
    for (let i = 0; i + 1 < base.length; i++) {
      const [from, to] = [base[i]!, base[i + 1]!];
      while (path.segments[index]!.sEnd < to) index++;
      const turn = Math.abs(path.segments[index]!.curvature) * (to - from);
      const scale = Math.max(asked(from), asked(to), MAXIMUM_VEHICLE_REACH);
      const count = Math.max(1, Math.ceil(turn / CELL_TURN_RADIANS), Math.ceil((to - from) / scale));
      let a = sample(from);
      if (i === 0) samples.push(a);
      for (let j = 1; j <= count; j++) {
        const b = sample(j === count ? to : from + ((to - from) * j) / count);
        refine(a, b, 0);
        samples.push(b);
        a = b;
      }
    }
    // The clip line, lateral on this side, at a sample short of what it asked for; a clip between two such samples, or
    // from where the outer edge crosses the line to such a sample and back.
    const line = (x: Sample) => side * (x.c - MAXIMUM_VEHICLE_REACH - CLEARANCE_TOLERANCE_METERS);
    for (let k = 0; k + 1 < samples.length; k++) {
      const [a, b] = [samples[k]!, samples[k + 1]!];
      const [da, db] = [a.bound - a.c, b.bound - b.c];
      if (da <= 0 && db <= 0) continue;
      let [s0, v0, s1, v1] = [a.s, line(a), b.s, line(b)];
      const crossing = a.s + ((b.s - a.s) * da) / (da - db);
      if (da <= 0) [s0, v0] = [crossing, outer(crossing, side)!];
      if (db <= 0) [s1, v1] = [crossing, outer(crossing, side)!];
      if (!(s1 > s0)) continue;
      const edge = Object.freeze({ start: s0, end: s1, from: v0, to: v1, anchored: true as const });
      clips.push(
        side > 0
          ? { start: s0, end: s1, left: edge, right: null, value: null }
          : { start: s0, end: s1, left: null, right: edge, value: null },
      );
    }
  }
  return clips;
}
