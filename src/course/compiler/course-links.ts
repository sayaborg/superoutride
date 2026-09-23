import { createPlanCoordinateSample } from '../geometry/plan-coordinate.js';
import { createPlanarCoordinateSample } from '../../core/planar-sample.js';
import { rasterPathToWorld } from '../geometry/raster-path.js';
import { wrapAngle, type Vec2 } from '../../core/math.js';
import { compilePlanarTransform, transformPlanarPoint } from '../../core/planar-transform.js';
import { courseBoundaryAt, type CompiledBoundary, type CompiledCarriageway } from '../course-regions.js';
import { requireCourse } from '../course-diagnostics.js';
import type { CompiledCourseAnchor } from '../course-geometry.js';
import type { CompiledLink, CompiledPort, CompiledSection } from './course-graph.js';
import type { CourseDocument, SectionDocument } from '../course-document.js';
import { compileCourseOverlapStations } from '../course-overlap-stations.js';

export const COURSE_LINK_RECIPE = Object.freeze({
  id: 'superoutride.carriageway-link',
  version: 1,
  positionToleranceMeters: 1e-7,
  headingToleranceRadians: 1e-10,
});

function edges(
  carriageway: CompiledCarriageway,
  start: number,
  end: number,
  path: string,
): readonly [CompiledBoundary, CompiledBoundary] {
  const regions = carriageway.regions
    .filter((b) => b.start.s <= start && b.end.s >= end && (end > start || start < b.end.s))
    .sort(
      (a, b) =>
        courseBoundaryAt(a.left, start) +
        courseBoundaryAt(a.left, end) -
        (courseBoundaryAt(b.left, start) + courseBoundaryAt(b.left, end)),
    );
  requireCourse(
    regions.length > 0,
    path,
    `Carriageway ${JSON.stringify(carriageway.id)} does not cover [${start}, ${end}]`,
    'invalid_carriageway',
  );
  const left = regions[0]!.left,
    right = regions.at(-1)!.right;
  for (const s of [start, end])
    requireCourse(
      courseBoundaryAt(right, s) > courseBoundaryAt(left, s),
      path,
      `Carriageway ${JSON.stringify(carriageway.id)} needs positive width at s=${s}`,
      'invalid_carriageway',
    );
  return [left, right];
}

function carriagewayCenter(carriageway: CompiledCarriageway, s: number, path: string): number {
  const [left, right] = edges(carriageway, s, s, path);
  return (courseBoundaryAt(left, s) + courseBoundaryAt(right, s)) / 2;
}

/** Derive the canonical source lateral anchor without projecting world coordinates back to the chart. */
export function coursePortLateral(port: CompiledPort): number {
  return carriagewayCenter(port.carriageway, port.anchor.s, '');
}

/** Graph construction phase; the owning course compiler closes and freezes Section back-references. */
export function compileCoursePort(
  source: SectionDocument['ports'][number],
  section: CompiledSection,
  anchor: CompiledCourseAnchor,
  carriageway: CompiledCarriageway,
  path: string,
): CompiledPort {
  requireCourse(
    anchor.s > 0 && anchor.s < section.coordinates.domain.end,
    `${path}/anchor`,
    'Port must lie inside the finite Section domain',
    'invalid_port',
  );
  const l = carriagewayCenter(carriageway, anchor.s, path);
  const { x, z, heading } = section.coordinates.toWorld(anchor.s, l, createPlanCoordinateSample());
  return Object.freeze({
    id: source.id,
    kind: source.kind,
    section,
    anchor,
    carriageway,
    pose: Object.freeze({ x, z, heading }),
  });
}

/** Shared authored-straight and mapped-heading prerequisite for guards and parallel lock zones. */
export function requireCourseStraightSpan(
  section: CompiledSection,
  start: number,
  end: number,
  heading: number,
  path: string,
): void {
  for (const primitive of section.primitives)
    if (primitive.sStart < end && primitive.sEnd > start)
      requireCourse(
        primitive.source.kind === 'straight',
        path,
        'Overlap must lie in authored straight primitives',
        'nonstraight_overlap',
      );
  for (const segment of section.raster.segments)
    if (segment.sStart < end && segment.sStart + segment.length > start)
      requireCourse(
        Math.abs(wrapAngle(segment.heading - heading)) <= COURSE_LINK_RECIPE.headingToleranceRadians,
        path,
        'Overlap Raster headings must agree with the port forward direction',
        'nonstraight_overlap',
      );
}

function guard(port: CompiledPort, behind: number, ahead: number, path: string): number[] {
  const section = port.section,
    seam = port.anchor.s,
    start = seam - behind,
    end = seam + ahead;
  requireCourse(
    start >= 0 && start < seam && end > seam && end <= section.coordinates.domain.end,
    path,
    `Overlap [${start}, ${end}] must fit Section ${JSON.stringify(section.id)} with representable extent on both sides`,
    'invalid_overlap',
  );
  requireCourseStraightSpan(section, start, end, port.pose.heading, path);
  return [
    ...section.raster.vertexS,
    ...port.carriageway.regions.flatMap((b) => [
      b.start.s,
      b.end.s,
      ...[b.left, b.right].flatMap((v) => v.knots.map((k) => k.anchor.s)),
    ]),
  ].filter((s) => s > start && s < end);
}

/** Entire matched pavement envelope, for both rendering Raster and authoritative plan. */
export function compileCourseLink(
  id: string,
  source: CompiledPort,
  destination: CompiledPort,
  overlap: { readonly behind: number; readonly ahead: number },
  path: string,
): CompiledLink {
  requireCourse(
    source.kind === 'exit' && destination.kind === 'entry',
    path,
    'Link must connect an exit Port to an entry Port',
    'invalid_link',
  );
  const ruler = (port: CompiledPort, key: string) => ({
    seam: port.anchor.s,
    stations: guard(port, overlap.behind, overlap.ahead, `${path}/${key}`),
  });
  const stations = compileCourseOverlapStations(
    ruler(source, 'source'),
    ruler(destination, 'destination'),
    overlap,
    path,
  );
  const destinationFromSource = compilePlanarTransform(source.pose, destination.pose);
  let previous: (readonly [CompiledBoundary, CompiledBoundary])[] | undefined;
  for (let i = 0; i < stations.length - 1; i += 1) {
    const start = stations[i]!,
      end = stations[i + 1]!;
    const bounds = [
      edges(source.carriageway, start.source, end.source, path),
      edges(destination.carriageway, start.destination, end.destination, path),
    ];
    if (previous)
      [source, destination].forEach((p, index) => {
        for (const side of [0, 1] as const) {
          const s = index === 0 ? start.source : start.destination;
          requireCourse(
            Math.abs(courseBoundaryAt(previous![index]![side], s) - courseBoundaryAt(bounds[index]![side], s)) <=
              COURSE_LINK_RECIPE.positionToleranceMeters,
            path,
            `Carriageway geometry is discontinuous in ${JSON.stringify(p.section.id)} at s=${s}`,
            'overlap_geometry_mismatch',
          );
        }
      });
    for (const side of [0, 1] as const) {
      for (const reader of ['raster', 'plan'] as const) {
        const point = (p: CompiledPort, b: CompiledBoundary, s: number): Vec2 => {
          const l = courseBoundaryAt(b, s);
          return reader === 'raster'
            ? rasterPathToWorld(p.section.raster, s, l, createPlanarCoordinateSample())
            : p.section.coordinates.toWorld(s, l, createPlanCoordinateSample());
        };
        const difference = (sourceS: number, destinationS: number): Vec2 => {
          const a = transformPlanarPoint(destinationFromSource, point(source, bounds[0]![side], sourceS));
          const b = point(destination, bounds[1]![side], destinationS);
          return { x: a.x - b.x, z: a.z - b.z };
        };
        const a = difference(start.source, start.destination),
          b = difference(end.source, end.destination),
          mid = difference(
            start.source + (end.source - start.source) / 2,
            start.destination + (end.destination - start.destination) / 2,
          );
        const control = { x: 2 * mid.x - (a.x + b.x) / 2, z: 2 * mid.z - (a.z + b.z) / 2 };
        // A quadratic lies inside its Bernstein control hull; this bounds the full cell error.
        requireCourse(
          [a, control, b].every((v) => Math.hypot(v.x, v.z) <= COURSE_LINK_RECIPE.positionToleranceMeters),
          path,
          `${reader} carriageway edge ${side} disagrees over overlap delta [${start.delta}, ${end.delta}]`,
          'overlap_geometry_mismatch',
        );
      }
    }
    previous = bounds;
  }
  return Object.freeze({ id, source, destination, destinationFromSource, overlap: Object.freeze({ ...overlap }) });
}

/** Validate topology over references; only the authored course type restricts cycles. */
export function validateCourseTopology(
  type: CourseDocument['type'],
  entry: CompiledSection,
  sections: readonly CompiledSection[],
  links: readonly CompiledLink[],
): void {
  for (const [index, section] of sections.entries()) {
    const path = `/sections/${index}/ports`,
      entries = section.ports.filter((p) => p.kind === 'entry');
    requireCourse(
      entries.length <= 1,
      path,
      'A Section has at most one entry Port; merges share it',
      'invalid_topology',
    );
    const exits = section.ports.filter((p) => p.kind === 'exit');
    for (const port of exits) {
      requireCourse(
        section.outgoing.filter((link) => link.source === port).length === 1,
        path,
        `Exit Port ${JSON.stringify(port.id)} needs exactly one Link`,
        'invalid_topology',
      );
      if (entries[0])
        requireCourse(
          port.anchor.s > entries[0].anchor.s,
          path,
          'Exit chainage must follow entry chainage with positive span',
          'invalid_topology',
        );
    }
    requireCourse(
      new Set(exits.map((p) => p.carriageway)).size === exits.length,
      path,
      'Fork exits must name distinct Carriageways',
      'invalid_topology',
    );
    requireCourse(
      section.outgoing.length <= (type === 'BRANCH' ? 3 : 1),
      path,
      'Too many outgoing Links for the course type',
      'invalid_topology',
    );
    if (type === 'LINEAR') requireCourse(section.incoming.length <= 1, path, 'LINEAR cannot merge', 'invalid_topology');
  }
  if (type === 'CIRCUIT') {
    requireCourse(
      sections.length === 1 &&
        links.length === 1 &&
        links[0]!.source.section === entry &&
        links[0]!.destination.section === entry,
      '/links',
      'CIRCUIT requires one Section and one exit-to-entry loop Link',
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
    for (const link of section.outgoing) visit(link.destination.section);
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
