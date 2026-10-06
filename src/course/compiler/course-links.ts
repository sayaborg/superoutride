import { createPlanCoordinateSample } from '../geometry/plan-coordinate.js';
import { compilePlanarTransform, composePlanarTransforms } from '../../core/planar-transform.js';
import { courseBoundaryAt } from '../course-boundaries.js';
import { courseRoadsAt, type CompiledLane } from '../course-lanes.js';
import { requireCourse } from '../course-diagnostics.js';
import type { CompiledCut, CompiledLink, CompiledSection } from './course-graph.js';

/** Roundoff of plan evaluation and rigid rotation over the admitted 1,000,000 m coordinate domain. */
export const COURSE_LINK_RECIPE = Object.freeze({
  id: 'superoutride.cut-line-link',
  version: 4,
  // Metres: rigid transform/evaluation budget; ~860 ulps at the admitted 10^6 m scale.
  edgeToleranceMeters: 1e-7,
  // Radians: wrapped heading/composition roundoff, below 0.1 mm at a 10^6 m lever arm.
  headingToleranceRadians: 1e-10,
  // Metres: vertical polynomial evaluation budget; ~86 ulps at the admitted 10^6 m scale.
  heightToleranceMeters: 1e-8,
  // Dimensionless dY/ds: 10^-10 absolute seam slope budget (10 nm height per 100 m).
  gradeTolerance: 1e-10,
});

/**
 * The road a lane belongs to at station `s`, and the lane's place in it, counted from the road's left. The lane must be
 * wider than zero there.
 */
function roadOf(section: CompiledSection, lane: CompiledLane, s: number, path: string) {
  const road = courseRoadsAt(section.lanes, s).find((candidate) => candidate.lanes.includes(lane));
  requireCourse(road !== undefined, path, `Lane ${lane.id} must be wider than zero at the cut line`, 'invalid_link');
  return { road, index: road.lanes.indexOf(lane) };
}

/** A cut across a Section at station `s` through lane `lane`'s centre: the frame a Link maps. */
export function compileCourseCut(section: CompiledSection, lane: CompiledLane, s: number): CompiledCut {
  const lateralOrigin = courseBoundaryAt(lane.center, s);
  const { x, z, heading } = section.coordinates.toWorld(s, lateralOrigin, createPlanCoordinateSample());
  return Object.freeze({
    section,
    lane,
    lateralOrigin,
    pose: Object.freeze({ x, z, heading }),
  });
}

/**
 * A Section's entry: its centre lane at s=0. A Link's destination has exactly one road there; the course's entry
 * Section may have any number.
 */
export function entryCut(section: CompiledSection, destination: boolean, path: string): CompiledCut {
  requireCourse(
    !destination || courseRoadsAt(section.lanes, 0).length === 1,
    path,
    "A Link's destination Section begins with exactly one road",
    'invalid_link',
  );
  return compileCourseCut(section, section.lanes.center, 0);
}

/**
 * The Link from `from` to `to`. The named lane continues as the next Section's centre lane, and the lanes either side
 * of it, in order, as the lanes either side of that: the two roads have as many lanes, of the same widths. The
 * transform lays the named lane's centre on the next Section's centreline; height and grade agree at the seam.
 */
export function compileCourseLink(id: string, from: CompiledCut, to: CompiledCut, path: string): CompiledLink {
  requireCourse(from.section !== to.section, path, `Link ${id} cannot return to its own Section`, 'invalid_topology');
  const toFromFrom = compilePlanarTransform(from.pose, to.pose);
  const end = from.section.coordinates.domain.end;
  const a = roadOf(from.section, from.lane, end, `${path}/from/lane`),
    b = roadOf(to.section, to.lane, 0, path);
  requireCourse(
    a.road.lanes.length === b.road.lanes.length &&
      a.index === b.index &&
      a.road.lanes.every(
        (lane, i) =>
          Math.abs(courseBoundaryAt(lane.width, end) - courseBoundaryAt(b.road.lanes[i]!.width, 0)) <=
          COURSE_LINK_RECIPE.edgeToleranceMeters,
      ),
    path,
    `Link ${id} joins roads of different lanes: the named lane continues as the centre lane, its neighbours in order`,
    'seam_edge_mismatch',
  );
  const aHeight = from.section.height.sampleDifferential(end);
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
  return Object.freeze({ id, from, to, toFromFrom });
}

export function compileCourseTopology(entry: CompiledSection, sections: readonly CompiledSection[]) {
  let hasCycle = false;
  const visited = new Set<CompiledSection>(),
    active = new Set<CompiledSection>();
  const visit = (section: CompiledSection): void => {
    if (active.has(section)) {
      hasCycle = true;
      return;
    }
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
  const hasBranches = sections.some((section) => section.outgoing.length >= 2);
  requireCourse(
    !(hasCycle && hasBranches),
    '/links',
    'A course cannot combine cycles and branches',
    'invalid_topology',
  );
  const type = hasCycle ? 'CIRCUIT' : hasBranches ? 'BRANCH' : 'LINEAR';
  for (const [index, section] of sections.entries()) {
    const path = `/sections/${index}`;
    // Each Link leaves by a lane of its own road, and every road at the end has a Link (one at least).
    const end = section.coordinates.domain.end;
    const roads = courseRoadsAt(section.lanes, end);
    const exits = section.outgoing.map((link) => roads.findIndex((road) => road.lanes.includes(link.from.lane)));
    requireCourse(
      new Set(exits).size === exits.length && (exits.length === 0 || exits.length === roads.length),
      path,
      'Each road at the Section end needs a Link of its own',
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
      sections.length >= 2 &&
        sections.every((section) => section.outgoing.length === 1 && section.incoming.length === 1),
      '/links',
      'CIRCUIT requires at least two Sections, each with one incoming and one outgoing Link',
      'invalid_topology',
    );
  } else {
    requireCourse(
      entry.incoming.length === 0,
      '/entry',
      'Entry Section cannot have an incoming Link',
      'invalid_topology',
    );
  }
  if (type === 'CIRCUIT') validateCourseCycle(entry);
  return type;
}

/** Topology admission proves this is the only directed cycle; acyclic merges never enter here. */
function validateCourseCycle(entry: CompiledSection): void {
  let transform = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 });
  let section = entry,
    positionTolerance = 0,
    headingTolerance = 0;
  do {
    const link = section.outgoing[0]!;
    // Rotating the accumulated translation by one uncertain Link heading adds this chord bound.
    positionTolerance +=
      COURSE_LINK_RECIPE.edgeToleranceMeters +
      2 *
        Math.sin(COURSE_LINK_RECIPE.headingToleranceRadians / 2) *
        Math.hypot(transform.translation.x, transform.translation.z);
    headingTolerance += COURSE_LINK_RECIPE.headingToleranceRadians;
    transform = composePlanarTransforms(link.toFromFrom, transform);
    section = link.to.section;
  } while (section !== entry);
  const positionError = Math.hypot(transform.translation.x, transform.translation.z);
  const headingError = Math.abs(Math.atan2(transform.sine, transform.cosine));
  requireCourse(
    positionError <= positionTolerance && headingError <= headingTolerance,
    '/links',
    `Cycle through Section ${entry.id} does not close: position ${positionError} m (limit ${positionTolerance}), heading ${headingError} rad (limit ${headingTolerance})`,
    'cycle_not_closed',
  );
}
