import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import type { CourseDocument } from '../../src/course/course-document.js';
import { LineBuilder, MeshBuilder } from './viewer-gl.js';
import { sectionStations, type CourseLayout, type PlacedSection } from './viewer-layout.js';
import { courseLimits, framePoint, stationFrame, type StationFrame } from './viewer-surfaces.js';

/**
 * What the viewer adds to the game's view to show the course's structure: lines lying on the road (its centreline and
 * distances, lanes, Boundaries, plan and profile), marks across it (Section ends, gates, the grid), translucent curtains
 * where something unseen stands (the course limits and the invisible walls) and the solid objects' lines, with their
 * labels. All of them are read from the compiled course.
 */

export interface Label {
  readonly at: readonly number[];
  readonly text: string;
  readonly color: string;
}

export interface LineLayer {
  readonly lines: LineBuilder;
  readonly labels: Label[];
}

/** Metres: the height of the curtains standing where something unseen stands. */
export const CURTAIN_METERS = 1.5;
/** Metres between the distance marks along the centreline. */
const DISTANCE_STEP_METERS = 100;

const WHITE = [255, 255, 255, 255];

const frame = (): StationFrame => ({ x: 0, z: 0, nx: 0, nz: 0, y: 0 });

/** The polyline of a lateral line `lateralAt` over `[a, b]`, on the road, at the stations a curve needs. */
function roadLine(
  layout: CourseLayout,
  placed: PlacedSection,
  a: number,
  b: number,
  lateralAt: (s: number) => number,
  extra: Iterable<number>,
  up = 0,
): number[] {
  const out: number[] = [];
  const f = frame();
  const stations = sectionStations(placed.section, a, b, Math.abs(lateralAt((a + b) / 2)) + 1, extra);
  for (const s of stations) framePoint(stationFrame(layout, placed, s, f), lateralAt(s), up, out);
  return out;
}

/** A line across the road at station `s`, between laterals `left` and `right`. */
function across(layout: CourseLayout, placed: PlacedSection, s: number, left: number, right: number, up = 0): number[] {
  const f = stationFrame(layout, placed, s, frame());
  const out: number[] = [];
  framePoint(f, left, up, out);
  framePoint(f, right, up, out);
  return out;
}

/** The centreline with a mark and a label every 100 m of the course's distance. */
export function buildCentreline(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  for (const placed of layout.sections) {
    const length = placed.section.coordinates.domain.end;
    lines.polyline(
      roadLine(layout, placed, 0, length, () => 0, []),
      [255, 255, 0, 255],
    );
    const first = Math.ceil(placed.routeStart / DISTANCE_STEP_METERS) * DISTANCE_STEP_METERS;
    for (let d = first; d <= placed.routeStart + length; d += DISTANCE_STEP_METERS) {
      const s = d - placed.routeStart;
      const mark = across(layout, placed, s, -1.5, 1.5);
      lines.segment(mark.slice(0, 3), mark.slice(3), [255, 255, 0, 255]);
      labels.push({ at: mark.slice(0, 3), text: d % 1000 === 0 ? `${d / 1000} km` : `${d} m`, color: '#ff0' });
    }
  }
  return { lines, labels };
}

/** Every lane's edges and centre where it is wider than zero; the centre lane's centre is the centreline. */
export function buildLanes(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  for (const placed of layout.sections)
    for (const element of placed.section.lanes.elements) {
      if (element.kind !== 'lane') continue;
      const lane = element.lane;
      const vertices = lane.left.vertices.map((v) => v.at.s);
      // Only where the lane is wider than zero.
      const length = placed.section.coordinates.domain.end;
      const widths = lane.width.vertices;
      for (let i = 0; i + 1 < widths.length; i++) {
        const a = widths[i]!,
          b = widths[i + 1]!;
        if (a.l <= 0 && b.l <= 0) continue;
        const from = a.at.s,
          to = Math.min(b.at.s, length);
        for (const [line, color] of [
          [lane.left, [255, 255, 255, 255]],
          [lane.right, [255, 255, 255, 255]],
          [lane.center, [120, 200, 255, 255]],
        ] as const)
          lines.polyline(
            roadLine(layout, placed, from, to, (s) => courseBoundaryAt(line, s), vertices),
            color,
          );
      }
      const mid = length / 2;
      labels.push({
        at: roadLine(layout, placed, mid, mid, (s) => courseBoundaryAt(lane.center, s), []).slice(0, 3),
        text: lane.id,
        color: '#8cf',
      });
    }
  return { lines, labels };
}

/** Every Boundary, with its ID at its start. */
export function buildBoundaries(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  for (const placed of layout.sections)
    for (const boundary of placed.section.boundaries) {
      const vertices = boundary.vertices;
      const a = vertices[0]!.at.s,
        b = vertices.at(-1)!.at.s;
      const p = roadLine(
        layout,
        placed,
        a,
        b,
        (s) => courseBoundaryAt(boundary, s),
        vertices.map((v) => v.at.s),
        0.02,
      );
      lines.polyline(p, [255, 140, 0, 255]);
      labels.push({ at: p.slice(0, 3), text: boundary.id, color: '#f90' });
    }
  return { lines, labels };
}

/** The plan: the centreline as its straights and arcs (left and right turns apart), each arc's radius, the joints. */
export function buildPlan(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  for (const placed of layout.sections)
    for (const segment of placed.section.segments) {
      const arc = segment.geometry.kind === 'arc' ? segment.geometry : null;
      const color = !arc ? [230, 230, 230, 255] : arc.turn > 0 ? [255, 90, 90, 255] : [90, 160, 255, 255];
      lines.polyline(
        roadLine(layout, placed, segment.sStart, segment.sEnd, () => 0, [], 0.03),
        color,
      );
      const joint = across(layout, placed, segment.sStart, -3, 3, 0.03);
      lines.segment(joint.slice(0, 3), joint.slice(3), WHITE);
      if (arc) {
        const mid = (segment.sStart + segment.sEnd) / 2;
        labels.push({
          at: across(layout, placed, mid, 0, 0).slice(0, 3),
          text: `R ${arc.radius.toFixed(arc.radius < 100 ? 1 : 0)} ${arc.turn > 0 ? 'right' : 'left'}`,
          color: arc.turn > 0 ? '#f66' : '#69f',
        });
      }
    }
  return { lines, labels };
}

/**
 * A grade's color: uphill warm, downhill cool; steeper is stronger, and the steps at ±20 % and ±25 % are plain to see
 * (below 20 % a ramp from white, 20 % to 25 % orange or blue, 25 % and more red or purple).
 */
export function gradeColor(grade: number): number[] {
  const g = Math.abs(grade);
  if (g >= 0.25) return grade > 0 ? [255, 0, 0, 255] : [170, 0, 255, 255];
  if (g >= 0.2) return grade > 0 ? [255, 150, 0, 255] : [0, 90, 255, 255];
  const t = g / 0.2;
  return grade > 0
    ? [255, Math.round(255 - 40 * t), Math.round(255 - 200 * t), 255]
    : [Math.round(255 - 200 * t), Math.round(255 - 40 * t), 255, 255];
}

export const GRADE_LEGEND: readonly { readonly text: string; readonly grade: number }[] = [
  { text: '≥ 25 % up', grade: 0.25 },
  { text: '20–25 % up', grade: 0.22 },
  { text: '< 20 % up', grade: 0.15 },
  { text: '< 20 % down', grade: -0.15 },
  { text: '20–25 % down', grade: -0.22 },
  { text: '≥ 25 % down', grade: -0.25 },
];

/** The profile: the centreline by its grade, a post at each PVI and the ends of each vertical curve. */
export function buildProfile(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  const f = frame(),
    sample = { y: 0, dYdS: 0 };
  for (const placed of layout.sections) {
    const section = placed.section;
    const length = section.coordinates.domain.end;
    const stations = sectionStations(section, 0, length, 1);
    let previous: number[] | null = null;
    for (let i = 0; i < stations.length; i++) {
      const point: number[] = [];
      framePoint(stationFrame(layout, placed, stations[i]!, f), 0, 0.04, point);
      if (previous) {
        const mid = (stations[i - 1]! + stations[i]!) / 2;
        lines.segment(previous, point, gradeColor(section.height.sampleDifferential(mid, sample).dYdS));
      }
      previous = point;
    }
    for (const knot of section.height.knots) {
      const post = (s: number, height: number, color: number[]) => {
        const p: number[] = [];
        framePoint(stationFrame(layout, placed, s, f), 0, 0, p);
        framePoint(f, 0, height, p);
        lines.segment(p.slice(0, 3), p.slice(3), color);
        return p.slice(3);
      };
      const top = post(knot.s, 3, WHITE);
      labels.push({ at: top, text: `PVI ${knot.y.toFixed(2)} m`, color: '#fff' });
      if (knot.curveLength > 0) {
        post(knot.s - knot.curveLength / 2, 1.5, [255, 0, 255, 255]);
        post(knot.s + knot.curveLength / 2, 1.5, [255, 0, 255, 255]);
      }
    }
  }
  return { lines, labels };
}

/** A translucent curtain along a lateral line over `[a, b]`, `CURTAIN_METERS` high. */
function curtain(
  mesh: MeshBuilder,
  layout: CourseLayout,
  placed: PlacedSection,
  a: number,
  b: number,
  lateralAt: (s: number) => number,
  color: number[],
) {
  const f0 = frame(),
    f1 = frame();
  const stations = sectionStations(placed.section, a, b, Math.abs(lateralAt((a + b) / 2)) + 1);
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i]!,
      s1 = stations[i + 1]!;
    stationFrame(layout, placed, s0, f0);
    stationFrame(layout, placed, s1, f1);
    const p: number[] = [];
    framePoint(f0, lateralAt(s0), 0, p);
    framePoint(f0, lateralAt(s0), CURTAIN_METERS, p);
    framePoint(f1, lateralAt(s1), 0, p);
    framePoint(f1, lateralAt(s1), CURTAIN_METERS, p);
    mesh.quad(p, color);
  }
}

/** The closed course limits as curtains. */
export function buildLimitCurtains(layout: CourseLayout): MeshBuilder {
  const mesh = new MeshBuilder();
  for (const placed of layout.sections)
    for (const line of placed.section.barriers)
      if (line.keep !== 0)
        curtain(mesh, layout, placed, line.start, line.end, (s) => line.lateralAt(s), [255, 60, 60, 90]);
  return mesh;
}

/**
 * The invisible solid walls as curtains: the Section's solid walls are its first barrier lines, in authored order, and a
 * wall with no Strips is unseen.
 */
export function buildInvisibleWallCurtains(layout: CourseLayout, document: CourseDocument): MeshBuilder {
  const mesh = new MeshBuilder();
  for (const placed of layout.sections) {
    const solid = document.sections[placed.index]!.walls.filter((wall) => wall.solid !== null);
    solid.forEach((wall, k) => {
      if (wall.strips.length) return;
      const line = placed.section.barriers[k]!;
      curtain(mesh, layout, placed, line.start, line.end, (s) => line.lateralAt(s), [255, 200, 0, 90]);
    });
  }
  return mesh;
}

/**
 * The solid objects' lines: a fixed object's width across the road from its bottom to its top, a movable object's square
 * footprint to its top, a free wall end's thickness (its unlimited height drawn to twice a curtain's).
 */
export function buildObjectLines(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  const red = [255, 40, 40, 255];
  for (const placed of layout.sections)
    for (const object of placed.section.objects) {
      const road = placed.section.height.sample(object.s);
      const bottom = Number.isFinite(object.bottom) ? object.bottom - road : 0,
        top = Number.isFinite(object.top) ? object.top - road : 2 * CURTAIN_METERS;
      const half = object.width / 2;
      const rectangle = (s: number) => {
        const f = stationFrame(layout, placed, s, frame());
        const p: number[] = [];
        for (const [l, h] of [
          [-half, bottom],
          [half, bottom],
          [half, top],
          [-half, top],
          [-half, bottom],
        ] as const)
          framePoint(f, object.l + l, h, p);
        return p;
      };
      if (object.movable) {
        const near = rectangle(object.s - half),
          far = rectangle(object.s + half);
        lines.polyline(near, red);
        lines.polyline(far, red);
        for (let i = 0; i < 4; i++) lines.segment(near.slice(3 * i, 3 * i + 3), far.slice(3 * i, 3 * i + 3), red);
      } else lines.polyline(rectangle(object.s), red);
    }
  return { lines, labels };
}

/** Each Section's ends, across the drawn road, with its ID. */
export function buildSectionEnds(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  for (const placed of layout.sections) {
    const length = placed.section.coordinates.domain.end;
    for (const s of [0, length]) {
      const limits = courseLimits(placed, s, s);
      const p = across(layout, placed, s, limits.left[0]! - 2, limits.right[0]! + 2, 0.05);
      lines.segment(p.slice(0, 3), p.slice(3), [0, 255, 160, 255]);
      if (s === 0) labels.push({ at: p.slice(0, 3), text: placed.section.id, color: '#0fa' });
    }
  }
  return { lines, labels };
}

/** The start, each checkpoint and finish, and each fork's lock and closure, across the road. */
export function buildGates(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  const mark = (placed: PlacedSection, s: number, text: string, color: number[], css: string) => {
    const limits = courseLimits(placed, s, s);
    const p = across(layout, placed, s, limits.left[0]!, limits.right[0]!, 0.06);
    lines.segment(p.slice(0, 3), p.slice(3), color);
    const f = stationFrame(layout, placed, s, frame());
    const post: number[] = [];
    framePoint(f, limits.right[0]!, 0, post);
    framePoint(f, limits.right[0]!, 3, post);
    lines.segment(post.slice(0, 3), post.slice(3), color);
    labels.push({ at: post.slice(3), text, color: css });
  };
  const placedOf = (section: PlacedSection['section']) => layout.sections.find((p) => p.section === section)!;
  mark(placedOf(layout.course.entry), 0, 'START', [0, 255, 0, 255], '#0f0');
  for (const interval of layout.course.gates.intervals) {
    const placed = placedOf(interval.section);
    for (const checkpoint of interval.checkpoints)
      mark(placed, checkpoint.at.s, `CHECKPOINT ${checkpoint.id}`, [0, 200, 255, 255], '#0cf');
    if (interval.finish) mark(placed, interval.finish.at.s, `FINISH ${interval.finish.id}`, WHITE, '#fff');
  }
  for (const placed of layout.sections) {
    const fork = placed.section.fork;
    if (!fork) continue;
    mark(placed, fork.lock.s, 'LOCK', [255, 0, 255, 255], '#f0f');
    mark(placed, fork.closure.s, 'CLOSURE', [255, 0, 255, 255], '#f0f');
  }
  return { lines, labels };
}

/** The grid's slots (and the bike grid's, when it has one): each a car's outline behind its slot, numbered. */
export function buildGrid(layout: CourseLayout): LineLayer {
  const lines = new LineBuilder(),
    labels: Label[] = [];
  const placed = layout.sections.find((p) => p.section === layout.course.entry)!;
  const grids = [
    { slots: layout.course.gates.grid, color: [255, 255, 255, 255], css: '#fff', name: '' },
    ...(layout.course.gates.bikeGrid
      ? [{ slots: layout.course.gates.bikeGrid, color: [255, 200, 0, 255], css: '#fc0', name: 'bike ' }]
      : []),
  ];
  for (const grid of grids)
    grid.slots.forEach((slot, i) => {
      const p: number[] = [];
      for (const [ds, dl] of [
        [0, -0.9],
        [0, 0.9],
        [-4, 0.9],
        [-4, -0.9],
        [0, -0.9],
      ] as const)
        framePoint(stationFrame(layout, placed, slot.at.s + ds, frame()), slot.l + dl, 0.07, p);
      lines.polyline(p, grid.color);
      labels.push({ at: p.slice(0, 3), text: `${grid.name}${i + 1}`, color: grid.css });
    });
  return { lines, labels };
}
