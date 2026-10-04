import type {
  CoursePosition,
  StripElementDocument,
  WallDocument,
  WallStripElementDocument,
} from '../course-document.js';
import { courseBoundaryAt, courseBoundarySlopeAt, type CompiledBoundary } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import type { CourseBarrierLine } from '../course-barriers.js';
import type { CourseFixedObject } from '../course-objects.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { materialOuterEdges } from '../course-coordinate-domain.js';
import type { StripMaterial } from '../strip-material.js';
import type { StripGround } from '../strip-ground.js';
import type { SurfaceMaterialCatalog } from '../surface-material.js';
import { compileCourseStrips } from './course-strip-ground.js';

/**
 * Metres: how close a wall that is not solid must run to the outer edge of the covered material for that edge to be open
 * (no course limit there). It absorbs only the arithmetic of reading one line through two compiled readers.
 */
export const OPEN_EDGE_TOLERANCE_METERS = 1e-6;

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

/** A wall's Strips as road Strips: each knot's bottom and top are the left and right edges, a null color transparent. */
function roadStrips(elements: readonly WallStripElementDocument[]): StripElementDocument[] {
  return elements.map((element) =>
    element.kind === 'repeat'
      ? { ...element, elements: roadStrips(element.elements) }
      : {
          kind: 'strip',
          color: element.color ?? 'transparent',
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
      const start = resolve(source.from, `${at}/from`).s,
        end = resolve(source.to, `${at}/to`).s;
      requireCourse(start < end, `${at}/to`, 'A wall needs from < to', 'invalid_wall');
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
            ).color;
      return Object.freeze({ source, boundary, start, end, color });
    }),
  );
}

/**
 * The free ends of the solid walls as fixed objects: at each solid wall's start and end, its thickness wide and of
 * unlimited height, except where that end lies on another barrier line — a course limit or another solid wall, from its
 * start through its end — within `OPEN_EDGE_TOLERANCE_METERS`. `lines` are the barriers, the solid walls first in order.
 */
export function compileWallEnds(
  walls: readonly CompiledWall[],
  lines: readonly CourseBarrierLine[],
): CourseFixedObject[] {
  const ends: CourseFixedObject[] = [];
  walls
    .filter((wall) => wall.source.solid)
    .forEach((wall, own) => {
      for (const s of [wall.start, wall.end]) {
        const l = courseBoundaryAt(wall.boundary, s);
        const joined = lines.some(
          (line, index) =>
            index !== own &&
            s >= line.start &&
            s <= line.end &&
            Math.abs(line.lateralAt(s) - l) <= OPEN_EDGE_TOLERANCE_METERS,
        );
        if (!joined) ends.push(Object.freeze({ s, l, width: wall.source.thickness, bottom: -Infinity, top: Infinity }));
      }
    });
  return ends;
}

/**
 * A Section's barrier lines: every solid wall, then each side's course limit along the outer edge of the covered material,
 * except where a wall that is not solid runs along that edge (an open edge).
 */
export function compileCourseBarriers(
  walls: readonly CompiledWall[],
  material: StripMaterial,
  length: number,
  path: string,
): readonly CourseBarrierLine[] {
  const edges = materialOuterEdges(material, path);
  const edge = { left: 0, right: 0 };
  const lines: CourseBarrierLine[] = [];
  for (const wall of walls)
    if (wall.source.solid)
      lines.push(
        Object.freeze({
          start: wall.start,
          end: wall.end,
          keep: 0 as const,
          lateralAt: (s: number) => courseBoundaryAt(wall.boundary, s),
          slopeAt: (s: number) => courseBoundarySlopeAt(wall.boundary, s),
        }),
      );
  // Open intervals per side: pieces between every Boundary vertex and material station where a non-solid wall runs along
  // that side's edge at both ends (both are affine there, so along the whole piece).
  const open = { left: [] as [number, number][], right: [] as [number, number][] };
  for (const wall of walls) {
    if (wall.source.solid) continue;
    const stations = [
      ...new Set([
        wall.start,
        wall.end,
        ...wall.boundary.vertices.map((v) => v.at.s).filter((s) => s > wall.start && s < wall.end),
        ...edges.stations.filter((s) => s > wall.start && s < wall.end),
      ]),
    ].sort((a, b) => a - b);
    const along = (s: number, side: 'left' | 'right') => {
      edges.at(s, edge);
      return Math.abs(courseBoundaryAt(wall.boundary, s) - edge[side]) <= OPEN_EDGE_TOLERANCE_METERS;
    };
    for (let i = 0; i + 1 < stations.length; i++)
      for (const side of ['left', 'right'] as const)
        if (along(stations[i]!, side) && along(stations[i + 1]!, side))
          open[side].push([stations[i]!, stations[i + 1]!]);
  }
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
