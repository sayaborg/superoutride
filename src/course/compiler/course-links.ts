import { createPlanCoordinateSample } from '../geometry/plan-coordinate.js';
import { compilePlanarTransform, transformPlanarPoint } from '../../core/planar-transform.js';
import { courseBoundaryAt, courseCarriagewayExists, type CompiledCarriageway } from '../course-boundaries.js';
import { requireCourse } from '../course-diagnostics.js';
import type { CompiledCut, CompiledLink, CompiledSection } from './course-graph.js';
import type { CourseDocument } from '../course-document.js';

/** Roundoff of plan evaluation and rigid rotation over the admitted 1,000,000 m coordinate domain. */
export const COURSE_LINK_RECIPE = Object.freeze({
  id: 'superoutride.cut-line-link',
  version: 2,
  // Metres: rigid transform/evaluation budget; ~860 ulps at the admitted 10^6 m scale.
  edgeToleranceMeters: 1e-7,
  // Metres: vertical polynomial evaluation budget; ~86 ulps at the admitted 10^6 m scale.
  heightToleranceMeters: 1e-8,
  // Dimensionless dY/ds: 10^-10 absolute seam slope budget (10 nm height per 100 m).
  gradeTolerance: 1e-10,
});

function edges(road: CompiledCarriageway, s: number, path: string): readonly [number, number] {
  requireCourse(
    s >= Math.max(road.left.vertices[0]!.at.s, road.right.vertices[0]!.at.s) &&
      s <= Math.min(road.left.vertices.at(-1)!.at.s, road.right.vertices.at(-1)!.at.s),
    path,
    `Carriageway ${road.id} must reach the cut line`,
    'invalid_carriageway',
  );
  const left = courseBoundaryAt(road.left, s);
  const right = courseBoundaryAt(road.right, s);
  requireCourse(
    right > left,
    path,
    `Carriageway ${road.id} must have positive width at the cut line`,
    'invalid_carriageway',
  );
  return [left, right];
}

export function compileCourseCut(
  section: CompiledSection,
  road: CompiledCarriageway,
  s: number,
  path: string,
): CompiledCut {
  const [left, right] = edges(road, s, path);
  const { x, z, heading } = section.coordinates.toWorld(s, (left + right) / 2, createPlanCoordinateSample());
  return Object.freeze({
    section,
    carriageway: road,
    lateralOrigin: (left + right) / 2,
    pose: Object.freeze({ x, z, heading }),
  });
}

export function entryCut(section: CompiledSection, path: string): CompiledCut {
  const roads = section.carriageways.filter(
    (road) =>
      courseCarriagewayExists(road, 0, section.coordinates.domain.end) &&
      courseBoundaryAt(road.right, 0) > courseBoundaryAt(road.left, 0),
  );
  requireCourse(
    roads.length === 1,
    path,
    'An entry Section must have exactly one Carriageway at s=0',
    'invalid_carriageway',
  );
  return compileCourseCut(section, roads[0]!, 0, path);
}

export function compileCourseLink(id: string, from: CompiledCut, to: CompiledCut, path: string): CompiledLink {
  const destinationFromSource = compilePlanarTransform(from.pose, to.pose);
  const [aLeft, aRight] = edges(from.carriageway, from.section.coordinates.domain.end, path);
  const [bLeft, bRight] = edges(to.carriageway, 0, path);
  for (const [a, b] of [
    [aLeft, bLeft],
    [aRight, bRight],
  ] as const) {
    const source = from.section.coordinates.toWorld(
      from.section.coordinates.domain.end,
      a,
      createPlanCoordinateSample(),
    );
    const target = to.section.coordinates.toWorld(0, b, createPlanCoordinateSample());
    const mapped = transformPlanarPoint(destinationFromSource, source);
    requireCourse(
      Math.hypot(mapped.x - target.x, mapped.z - target.z) <= COURSE_LINK_RECIPE.edgeToleranceMeters,
      path,
      `Connecting Carriageway edges disagree at Link ${id}`,
      'seam_edge_mismatch',
    );
  }
  const aHeight = from.section.height.sampleDifferential(from.section.coordinates.domain.end);
  const bHeight = to.section.height.sampleDifferential(0);
  requireCourse(
    Math.abs(aHeight.y - bHeight.y) <= COURSE_LINK_RECIPE.heightToleranceMeters,
    path,
    `Height disagrees at Link ${id}`,
    'seam_height_mismatch',
  );
  requireCourse(
    Math.abs(aHeight.dYdS - bHeight.dYdS) <= COURSE_LINK_RECIPE.gradeTolerance,
    path,
    `Grade disagrees at Link ${id}`,
    'seam_grade_mismatch',
  );
  return Object.freeze({ id, from, to, destinationFromSource });
}

export function validateCourseTopology(
  type: CourseDocument['type'],
  entry: CompiledSection,
  sections: readonly CompiledSection[],
  links: readonly CompiledLink[],
): void {
  for (const [index, section] of sections.entries()) {
    const path = `/sections/${index}`;
    const exits = section.outgoing.map((link) => link.from.carriageway);
    requireCourse(
      new Set(exits).size === exits.length,
      path,
      'A Section cannot have two exits on one Carriageway',
      'invalid_topology',
    );
    requireCourse(
      section.outgoing.length <= (type === 'BRANCH' ? 3 : 1),
      path,
      'Too many outgoing Links',
      'invalid_topology',
    );
    if (type === 'LINEAR') requireCourse(section.incoming.length <= 1, path, 'LINEAR cannot merge', 'invalid_topology');
  }
  if (type === 'CIRCUIT') {
    requireCourse(
      sections.length === 1 && links.length === 1 && links[0]!.from.section === entry && links[0]!.to.section === entry,
      '/links',
      'CIRCUIT requires one Section and one end-to-start loop Link',
      'invalid_topology',
    );
    return;
  }
  requireCourse(
    entry.incoming.length === 0,
    '/entrySectionId',
    'Entry Section cannot have an incoming Link',
    'invalid_topology',
  );
  const visited = new Set<CompiledSection>(),
    active = new Set<CompiledSection>();
  const visit = (section: CompiledSection): void => {
    requireCourse(!active.has(section), '/links', 'LINEAR/BRANCH topology must be acyclic', 'invalid_topology');
    if (visited.has(section)) return;
    active.add(section);
    for (const link of section.outgoing) visit(link.to.section);
    active.delete(section);
    visited.add(section);
  };
  visit(entry);
  requireCourse(
    visited.size === sections.length,
    '/sections',
    'Every Section must be reachable from the entry Section',
    'invalid_topology',
  );
}
