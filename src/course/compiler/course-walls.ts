import type { StripBudget } from '../strip-budget.js';
import type {
  CoursePosition,
  OpenLimitDocument,
  StripElementDocument,
  WallDocument,
  WallStripElementDocument,
} from '../course-document.js';
import { courseBoundaryAt, courseBoundarySlopeAt, type CompiledBoundary } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import type { CourseBarrierLine } from '../course-barriers.js';
import type { CourseObject } from '../course-objects.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { materialOuterEdges } from '../course-coordinate-domain.js';
import type { StripMaterial } from '../strip-material.js';
import type { StripGround } from '../strip-ground.js';
import type { SurfaceMaterialCatalog } from '../surface-material.js';
import { compileCourseStrips } from './course-strip-ground.js';

/**
 * Metres: how close a solid wall's end must lie to a course limit or another solid wall to join it. It absorbs only the
 * arithmetic of reading one line through two compiled readers; authors join lines by referring to the same Boundary.
 */
export const JOIN_TOLERANCE_METERS = 1e-6;

/**
 * A wall resolved on its Section: its Boundary and station interval with the authored record, and its picture as a color
 * Strip ground over the wall (station `s - start`, height as lateral); null for an invisible wall.
 */
export interface CompiledWall {
  readonly source: WallDocument;
  readonly boundary: CompiledBoundary;
  readonly start: number;
  readonly end: number;
  readonly color: StripGround | null;
}

/** A wall's Strips as road Strips: each knot's bottom and top are the left and right edges. */
function roadStrips(elements: readonly WallStripElementDocument[]): StripElementDocument[] {
  return elements.map((element) =>
    element.kind === 'repeat'
      ? { ...element, elements: roadStrips(element.elements) }
      : {
          kind: 'strip',
          color: element.color,
          material: null,
          knots: element.knots.map((knot) => ({ at: knot.at, left: knot.bottom, right: knot.top })),
        },
  );
}

/**
 * Resolve each wall's Boundary and interval (`from < to`, both in the Section, the Boundary covering them) and compile its
 * Strips with the road's Strip compiler over the wall's own interval, so every Strip lies within `[from, to]`.
 */
export function compileCourseWalls(
  walls: readonly WallDocument[],
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  materials: SurfaceMaterialCatalog,
  budget: StripBudget,
  path: string,
): readonly CompiledWall[] {
  return Object.freeze(
    walls.map((source, index) => {
      const at = `${path}/${index}`;
      const boundary = boundaries.get(source.boundary);
      if (!boundary)
        throw new CourseInputError(
          'unresolved_reference',
          `${at}/boundary`,
          `Unknown reference ${JSON.stringify(source.boundary)} in this scope`,
        );
      const start = resolve(source.start, `${at}/start`).s,
        end = resolve(source.end, `${at}/end`).s;
      requireCourse(start < end, `${at}/end`, 'A wall needs start < end', 'invalid_wall');
      requireCourse(
        boundary.vertices[0]!.at.s <= start && boundary.vertices.at(-1)!.at.s >= end,
        `${at}/boundary`,
        'The Boundary must cover the whole wall',
        'invalid_wall',
      );
      const color =
        source.strips.length === 0
          ? null
          : compileCourseStrips(
              roadStrips(source.strips),
              end - start,
              `${at}/strips`,
              (position, positionPath) => {
                const s = resolve(position, positionPath).s;
                requireCourse(
                  s >= start && s <= end,
                  positionPath,
                  'A wall Strip must lie within the wall',
                  'invalid_wall',
                );
                return { s: s - start };
              },
              new Map(),
              materials,
              budget,
            ).color;
      return Object.freeze({ source, boundary, start, end, color });
    }),
  );
}

/**
 * The ends of the solid walls. An end joins a barrier line — a course limit or another solid wall, from its start
 * through its end — when it lies on it within `JOIN_TOLERANCE_METERS`; an end declared free becomes a fixed object of its
 * thickness and unlimited height. Every end is one or the other: an undeclared end that joins nothing, or a declared
 * free end that joins a line, is `invalid_wall`. `lines` are the barriers, the solid walls first in order.
 */
export function compileWallEnds(
  walls: readonly CompiledWall[],
  lines: readonly CourseBarrierLine[],
  path: string,
): CourseObject[] {
  const ends: CourseObject[] = [];
  let own = 0;
  walls.forEach((wall, index) => {
    const solid = wall.source.solid;
    if (!solid) return;
    const line = own++;
    for (const [s, free, field] of [
      [wall.start, solid.freeStart, 'freeStart'],
      [wall.end, solid.freeEnd, 'freeEnd'],
    ] as const) {
      const l = courseBoundaryAt(wall.boundary, s);
      const joined = lines.some(
        (other, at) =>
          at !== line &&
          s >= other.start &&
          s <= other.end &&
          Math.abs(other.lateralAt(s) - l) <= JOIN_TOLERANCE_METERS,
      );
      requireCourse(
        joined !== (free !== null),
        `${path}/${index}/solid/${field}`,
        free === null
          ? 'A solid wall end must join a course limit or another solid wall, or be declared free'
          : 'A free wall end must not lie on a course limit or another solid wall',
        'invalid_wall',
      );
      if (free !== null)
        ends.push(Object.freeze({ s, l, width: free, bottom: -Infinity, top: Infinity, sprite: null, movable: null }));
    }
  });
  return ends;
}

/**
 * A Section's barrier lines: every solid wall, then each side's course limit along the outer edge of the covered material,
 * except over the Section's declared open limits.
 */
export function compileCourseBarriers(
  walls: readonly CompiledWall[],
  openLimits: readonly OpenLimitDocument[],
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  material: StripMaterial,
  length: number,
  path: string,
): readonly CourseBarrierLine[] {
  const edges = materialOuterEdges(material, `${path}/strips`);
  const lines: CourseBarrierLine[] = [];
  for (const wall of walls)
    if (wall.source.solid)
      lines.push(
        Object.freeze({
          start: wall.start,
          end: wall.end,
          keep: 0 as const,
          sound: wall.source.solid.sound,
          lateralAt: (s: number) => courseBoundaryAt(wall.boundary, s),
          slopeAt: (s: number) => courseBoundarySlopeAt(wall.boundary, s),
        }),
      );
  const open = { left: [] as [number, number][], right: [] as [number, number][] };
  openLimits.forEach((declared, index) => {
    const at = `${path}/openLimits/${index}`;
    const start = resolve(declared.start, `${at}/start`).s,
      end = resolve(declared.end, `${at}/end`).s;
    requireCourse(start < end, `${at}/end`, 'An open limit needs start < end', 'invalid_value');
    open[declared.side].push([start, end]);
  });
  for (const side of ['left', 'right'] as const) {
    const intervals = open[side].sort((a, b) => a[0] - b[0]);
    let s = 0;
    const read = { left: 0, right: 0 };
    const limit = (start: number, end: number) =>
      lines.push(
        Object.freeze({
          start,
          end,
          keep: side === 'left' ? (1 as const) : (-1 as const),
          sound: null,
          lateralAt: (at: number) => edges.at(at, read)[side],
          slopeAt: (at: number) => edges.slopeAt(at, side),
        }),
      );
    for (const [a, b] of intervals) {
      if (a > s) limit(s, a);
      s = Math.max(s, b);
    }
    if (s < length) limit(s, length);
  }
  return Object.freeze(lines);
}
