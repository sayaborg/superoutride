import { guidePathToWorld } from '../core/guide-curve.js';
import { rasterPathToWorld } from '../core/raster-path.js';
import { wrapAngle, type Vec2 } from '../core/math.js';
import { compilePlanarTransform, transformPlanarPoint } from '../core/planar-transform.js';
import { courseBoundaryAt, type CompiledBoundary, type CompiledCarriageway } from './course-bands.js';
import { CourseInputError } from './course-diagnostics.js';
import type { CompiledCourseAnchor } from './course-geometry.js';
import type { CompiledLink, CompiledPort, CompiledSection } from './course-graph.js';
import type { CourseDocument, SectionDocument } from './course-document.js';
import { COURSE_DOCUMENT_LIMITS } from './course-document.js';

export const COURSE_LINK_RECIPE = Object.freeze({
  id: 'superoutride.carriageway-link',
  version: 1,
  positionToleranceMeters: 1e-7,
  headingToleranceRadians: 1e-10,
  frame: 'forward Guide heading and carriageway center at resolved anchor; upright rigid transform',
  overlap:
    'authored/Guide/Raster straight guards; both rulers/boundaries/activations partitioned; quadratic difference Bernstein hull',
});

function semantic(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new CourseInputError('semantic_compile_failure', path, message);
}

function edges(
  carriageway: CompiledCarriageway,
  start: number,
  end: number,
  path: string,
): readonly [CompiledBoundary, CompiledBoundary] {
  const bands = carriageway.bands
    .filter((b) => b.start.s <= start && b.end.s >= end && (end > start || start < b.end.s))
    .sort(
      (a, b) =>
        courseBoundaryAt(a.left, start) +
        courseBoundaryAt(a.left, end) -
        (courseBoundaryAt(b.left, start) + courseBoundaryAt(b.left, end)),
    );
  semantic(bands.length > 0, path, `Carriageway ${JSON.stringify(carriageway.id)} does not cover [${start}, ${end}]`);
  const left = bands[0]!.left,
    right = bands.at(-1)!.right;
  for (const s of [start, end])
    semantic(
      courseBoundaryAt(right, s) > courseBoundaryAt(left, s),
      path,
      `Carriageway ${JSON.stringify(carriageway.id)} needs positive width at s=${s}`,
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
  semantic(
    anchor.s > 0 && anchor.s < section.raster.length,
    `${path}/anchor`,
    'Port must lie inside the finite Section domain',
  );
  const l = carriagewayCenter(carriageway, anchor.s, path);
  const { x, z, heading } = guidePathToWorld(section.guide, anchor.s, l);
  return Object.freeze({
    id: source.id,
    kind: source.kind,
    section,
    anchor,
    carriageway,
    pose: Object.freeze({ x, z, heading }),
  });
}

function guard(port: CompiledPort, behind: number, ahead: number, path: string): number[] {
  const section = port.section,
    seam = port.anchor.s,
    start = seam - behind,
    end = seam + ahead;
  semantic(
    start >= 0 && start < seam && end > seam && end <= section.raster.length,
    path,
    `Overlap [${start}, ${end}] must fit Section ${JSON.stringify(section.id)} with representable extent on both sides`,
  );
  for (const primitive of section.primitives)
    if (primitive.sStart < end && primitive.sEnd > start)
      semantic(primitive.source.kind === 'straight', path, 'Overlap must lie in authored straight primitives');
  for (const segment of section.guide.segments)
    if (segment.sStart < end && segment.sEnd > start)
      semantic(segment.kind === 'straight', path, 'Overlap intersects a Guide fillet');
  for (const segment of section.raster.segments)
    if (segment.sStart < end && segment.sStart + segment.length > start)
      semantic(
        Math.abs(wrapAngle(segment.heading - port.pose.heading)) <= COURSE_LINK_RECIPE.headingToleranceRadians,
        path,
        'Overlap Raster headings must agree with the port forward direction',
      );
  return [
    ...section.raster.vertexS,
    ...section.guide.segments.flatMap((s) => [s.sStart, s.sEnd]),
    ...port.carriageway.bands.flatMap((b) => [
      b.start.s,
      b.end.s,
      ...[b.left, b.right].flatMap((v) => v.knots.map((k) => k.anchor.s)),
    ]),
  ].filter((s) => s > start && s < end);
}

/** Entire matched pavement envelope, for both Raster and Guide, not just seam-center agreement. */
export function compileCourseLink(
  id: string,
  source: CompiledPort,
  destination: CompiledPort,
  overlap: { readonly behind: number; readonly ahead: number },
  path: string,
): CompiledLink {
  semantic(
    source.kind === 'exit' && destination.kind === 'entry',
    path,
    'Link must connect an exit Port to an entry Port',
  );
  // Retain each ruler's exact authored/compiled station. Subtracting and adding a port
  // offset can lose the endpoint of a partial Band even when the geometry is continuous.
  const table = new Map<number, { delta: number; source: number; destination: number }>();
  const station = (delta: number) => {
    let value = table.get(delta);
    if (!value) {
      value = { delta, source: source.anchor.s + delta, destination: destination.anchor.s + delta };
      table.set(delta, value);
    }
    return value;
  };
  const extent = [-overlap.behind, 0, overlap.ahead];
  for (const delta of extent) station(delta);
  for (const [key, port] of [
    ['source', source],
    ['destination', destination],
  ] as const) {
    const offsets = new Map(extent.map((delta) => [delta, port.anchor.s + delta]));
    for (const s of guard(port, overlap.behind, overlap.ahead, `${path}/${key}`)) {
      const delta = s - port.anchor.s;
      semantic(
        !offsets.has(delta) || offsets.get(delta) === s,
        `${path}/${key}`,
        'Distinct ruler stations must remain distinguishable in overlap coordinates',
      );
      offsets.set(delta, s);
      station(delta)[key] = s;
    }
  }
  const stations = [...table.values()].sort((a, b) => a.delta - b.delta);
  if (stations.length - 1 > COURSE_DOCUMENT_LIMITS.linkCells)
    throw new CourseInputError(
      'resource_limit',
      path,
      `Link overlap exceeds ${COURSE_DOCUMENT_LIMITS.linkCells} cells`,
    );
  const destinationFromSource = compilePlanarTransform(source.pose, destination.pose);
  let previous: (readonly [CompiledBoundary, CompiledBoundary])[] | undefined;
  for (let i = 0; i < stations.length - 1; i += 1) {
    const start = stations[i]!,
      end = stations[i + 1]!;
    semantic(
      end.source >= start.source && end.destination >= start.destination,
      path,
      'Overlap partition must preserve ruler order',
    );
    const bounds = [
      edges(source.carriageway, start.source, end.source, path),
      edges(destination.carriageway, start.destination, end.destination, path),
    ];
    if (previous)
      [source, destination].forEach((p, index) => {
        for (const side of [0, 1] as const) {
          const s = index === 0 ? start.source : start.destination;
          semantic(
            Math.abs(courseBoundaryAt(previous![index]![side], s) - courseBoundaryAt(bounds[index]![side], s)) <=
              COURSE_LINK_RECIPE.positionToleranceMeters,
            path,
            `Carriageway geometry is discontinuous in ${JSON.stringify(p.section.id)} at s=${s}`,
          );
        }
      });
    for (const side of [0, 1] as const) {
      for (const reader of ['raster', 'guide'] as const) {
        const point = (p: CompiledPort, b: CompiledBoundary, s: number): Vec2 => {
          const l = courseBoundaryAt(b, s);
          return reader === 'raster'
            ? rasterPathToWorld(p.section.raster, s, l)
            : guidePathToWorld(p.section.guide, s, l);
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
        semantic(
          [a, control, b].every((v) => Math.hypot(v.x, v.z) <= COURSE_LINK_RECIPE.positionToleranceMeters),
          path,
          `${reader} carriageway edge ${side} disagrees over overlap delta [${start.delta}, ${end.delta}]`,
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
    semantic(entries.length <= 1, path, 'A Section has at most one entry Port; merges share it');
    const exits = section.ports.filter((p) => p.kind === 'exit');
    for (const port of exits) {
      semantic(
        section.outgoing.filter((link) => link.source === port).length === 1,
        path,
        `Exit Port ${JSON.stringify(port.id)} needs exactly one Link`,
      );
      if (entries[0])
        semantic(
          port.anchor.s > entries[0].anchor.s,
          path,
          'Exit chainage must follow entry chainage with positive span',
        );
    }
    semantic(
      new Set(exits.map((p) => p.carriageway)).size === exits.length,
      path,
      'Fork exits must name distinct Carriageways',
    );
    semantic(
      section.outgoing.length <= (type === 'BRANCH' ? 3 : 1),
      path,
      'Too many outgoing Links for the course type',
    );
    if (type === 'LINEAR') semantic(section.incoming.length <= 1, path, 'LINEAR cannot merge');
  }
  if (type === 'CIRCUIT') {
    semantic(
      sections.length === 1 &&
        links.length === 1 &&
        links[0]!.source.section === entry &&
        links[0]!.destination.section === entry,
      '/links',
      'CIRCUIT requires one Section and one exit-to-entry loop Link',
    );
    return;
  }
  semantic(entry.incoming.length === 0, '/entrySectionId', 'Entry Section cannot have an incoming Link');
  const visited = new Set<CompiledSection>(),
    active = new Set<CompiledSection>();
  const visit = (section: CompiledSection): void => {
    semantic(!active.has(section), '/links', 'LINEAR/BRANCH topology must be acyclic');
    if (visited.has(section)) return;
    active.add(section);
    for (const link of section.outgoing) visit(link.destination.section);
    active.delete(section);
    visited.add(section);
  };
  visit(entry);
  semantic(visited.size === sections.length, '/sections', 'Every Section must be reachable from the entry Section');
}
