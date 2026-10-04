import type { CoursePosition, WallDocument } from '../course-document.js';
import { courseBoundaryAt, courseBoundarySlopeAt, type CompiledBoundary } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import type { CourseBarrierLine } from '../course-barriers.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { materialOuterEdges } from '../course-coordinate-domain.js';
import type { StripMaterial } from '../strip-material.js';

/**
 * Metres: how close a wall that is not solid must run to the outer edge of the covered material for that edge to be open
 * (no course limit there). It absorbs only the arithmetic of reading one line through two compiled readers.
 */
export const OPEN_EDGE_TOLERANCE_METERS = 1e-6;

/** A wall resolved on its Section: its Boundary and station interval with the authored record. */
export interface CompiledWall {
  readonly source: WallDocument;
  readonly boundary: CompiledBoundary;
  readonly start: number;
  readonly end: number;
}

/** Resolve each wall's Boundary and interval: `from < to`, both in the Section, the Boundary covering them. */
export function compileCourseWalls(
  walls: readonly WallDocument[],
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
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
      return Object.freeze({ source, boundary, start, end });
    }),
  );
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
