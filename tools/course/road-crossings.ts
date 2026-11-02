/**
 * Where a compiled course's road passes over itself, and how far apart in height its two passages lie there: the check
 * that a moved profile keeps what follows the road's height with it ([Original road data](../../docs/original-road-data.md#crests-and-dips)).
 * Strips, sprites, their bodies and walls stand on the compiled profile and move with it; two passages of one road over
 * each other are the one height a course lays apart, so a profile moved under them can bring them together.
 */
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledSection } from '../../src/course/compiler/course-graph.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import {
  composePlanarTransforms,
  invertPlanarTransform,
  transformPlanarPoint,
  type PlanarTransform,
} from '../../src/core/planar-transform.js';

/** A place on the road: a Section's station. */
export interface RoadPlace {
  readonly section: string;
  readonly s: number;
}

/**
 * Where the road passes over itself: its two passages' nearest places and their heights apart there, metres; with
 * `against`, the least their heights lie apart by another profile laid on the same plan.
 */
export interface RoadCrossing {
  readonly a: RoadPlace;
  readonly b: RoadPlace;
  readonly apart: number;
  readonly against?: number;
}

/** The road is sampled this often, metres; passages nearer than `APART` along the road are one passage. */
const STEP = 2;
const APART = 200;

/** A sample of the road: its Section and station, its middle in the world, its half width and its height. */
interface Sample {
  readonly section: CompiledSection;
  readonly s: number;
  readonly x: number;
  readonly z: number;
  readonly half: number;
}

/** Each Section's frame in the course's, through the Links from the entry, as a route lays them. */
function worldFrames(course: CompiledCourse) {
  const frames = new Map<CompiledSection, PlanarTransform>([
    [course.entry, { cosine: 1, sine: 0, translation: { x: 0, z: 0 } }],
  ]);
  for (const [section, frame] of frames)
    for (const link of section.outgoing)
      if (!frames.has(link.to.section))
        frames.set(link.to.section, composePlanarTransforms(frame, invertPlanarTransform(link.toFromFrom)));
  return frames;
}

/** The road's distance between two places, metres, along its Sections and Links either way. */
function roadDistances(course: CompiledCourse) {
  // Nodes: each Section's start (2k) and end (2k + 1); a Section joins its two, a Link an end to a start.
  const index = new Map(course.sections.map((section, k) => [section, k]));
  const n = 2 * course.sections.length;
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  course.sections.forEach((section, k) => {
    const length = section.coordinates.domain.end;
    d[2 * k]![2 * k + 1] = d[2 * k + 1]![2 * k] = length;
    for (const link of section.outgoing) {
      const to = index.get(link.to.section)!;
      d[2 * k + 1]![2 * to] = d[2 * to]![2 * k + 1] = 0;
    }
  });
  for (let m = 0; m < n; m++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (d[i]![m]! + d[m]![j]! < d[i]![j]!) d[i]![j] = d[i]![m]! + d[m]![j]!;
  return (a: Sample, b: Sample) => {
    if (a.section === b.section) return Math.abs(a.s - b.s);
    const [i, j] = [index.get(a.section)!, index.get(b.section)!];
    const ends = (k: number, s: number, length: number) => [
      [2 * k, s],
      [2 * k + 1, length - s],
    ];
    let best = Infinity;
    for (const [p, dp] of ends(i, a.s, a.section.coordinates.domain.end))
      for (const [q, dq] of ends(j, b.s, b.section.coordinates.domain.end))
        best = Math.min(best, dp! + d[p!]![q!]! + dq!);
    return best;
  };
}

/** The road's samples every `STEP` metres, each Section's in the course's frame. */
function samplesOf(course: CompiledCourse): Sample[] {
  const frames = worldFrames(course);
  const out: Sample[] = [];
  const at = { s: 0, l: 0, x: 0, z: 0, heading: 0 };
  for (const section of course.sections) {
    const frame = frames.get(section);
    if (!frame) continue;
    const length = section.coordinates.domain.end;
    for (let s = 0; s <= length; s += STEP) {
      const roads = courseRoadsAt(section.lanes, s);
      if (!roads.length) continue;
      const half = Math.max(...roads.flatMap((r) => [Math.abs(r.left), Math.abs(r.right)]));
      section.coordinates.toWorld(s, 0, at);
      const p = transformPlanarPoint(frame, { x: at.x, z: at.z });
      out.push({ section, s, x: p.x, z: p.z, half });
    }
  }
  return out;
}

/**
 * Where `course`'s road passes over itself: each pair of passages at least `APART` metres apart along the road whose
 * roads overlap, their nearest places and their heights apart there; with `against`, a course of the same plan and
 * Sections whose profile was moved (the crests and dips rule laid on it, say), the least they lie apart by its profile.
 */
export function roadCrossings(course: CompiledCourse, against?: CompiledCourse): RoadCrossing[] {
  const heightOf = (c: CompiledCourse) => {
    const byId = new Map(c.sections.map((section) => [section.id, section]));
    return (sample: Sample) => byId.get(sample.section.id)!.height.sample(sample.s);
  };
  const [height, other] = [heightOf(course), against ? heightOf(against) : null];
  const samples = samplesOf(course);
  const distance = roadDistances(course);
  const reach = Math.max(...samples.map((p) => p.half)) * 2;
  const cells = new Map<string, Sample[]>();
  const key = (x: number, z: number) => `${Math.floor(x / reach)},${Math.floor(z / reach)}`;
  for (const p of samples) cells.set(key(p.x, p.z), [...(cells.get(key(p.x, p.z)) ?? []), p]);
  // Each overlapping pair far apart along the road, grouped by the passages it joins.
  const groups = new Map<string, { a: RoadPlace; b: RoadPlace; apart: number; against?: number }>();
  for (const p of samples) {
    const [cx, cz] = [Math.floor(p.x / reach), Math.floor(p.z / reach)];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const q of cells.get(`${cx + i},${cz + j}`) ?? []) {
          if (q === p || Math.hypot(p.x - q.x, p.z - q.z) >= p.half + q.half) continue;
          if (distance(p, q) < APART) continue;
          const [a, b] = p.section.id < q.section.id || (p.section === q.section && p.s < q.s) ? [p, q] : [q, p];
          const group = `${a.section.id}:${Math.floor(a.s / APART)}|${b.section.id}:${Math.floor(b.s / APART)}`;
          const apart = Math.abs(height(a) - height(b));
          const known = groups.get(group);
          if (!known || apart < known.apart)
            groups.set(group, {
              a: { section: a.section.id, s: a.s },
              b: { section: b.section.id, s: b.s },
              apart,
              ...(known?.against !== undefined ? { against: known.against } : {}),
            });
          if (other) {
            const entry = groups.get(group)!;
            entry.against = Math.min(entry.against ?? Infinity, Math.abs(other(a) - other(b)));
          }
        }
  }
  return [...groups.values()].sort((x, y) => x.apart - y.apart);
}
