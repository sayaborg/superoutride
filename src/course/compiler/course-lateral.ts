import type { StripEdgeLine } from '../strip-ground.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type Lateral, type CoursePosition, type SectionDocument } from '../course-document.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { courseBoundaryAt, type CompiledBoundary } from '../course-boundaries.js';
import { requireCourse } from '../course-diagnostics.js';

type BoundaryLookup = (id: string, path: string) => CompiledBoundary | undefined;

/** References must cover the whole interval in which their expression is evaluated. */
function lateralBoundary(lateral: Lateral, start: number, end: number, lookup: BoundaryLookup, path: string) {
  if (typeof lateral === 'number') return null;
  const boundary = lookup(lateral.boundary, `${path}/boundary`);
  requireCourse(boundary !== undefined, `${path}/boundary`, 'Unknown Section Boundary', 'unresolved_reference');
  requireCourse(
    boundary.vertices[0]!.at.s <= start && boundary.vertices.at(-1)!.at.s >= end,
    `${path}/boundary`,
    `Boundary must cover the referenced interval [${start}, ${end}]`,
    'invalid_boundary',
  );
  return boundary;
}

function lateralAt(lateral: Lateral, boundary: CompiledBoundary | null, s: number): number {
  return typeof lateral === 'number' ? lateral : courseBoundaryAt(boundary!, s) + lateral.offset;
}

function checkedLateral(l: number, path: string): number {
  requireCourse(
    Number.isFinite(l) && Math.abs(l) <= COURSE_DOCUMENT_LIMITS.lateralMeters,
    path,
    `Resolved lateral position must be within +/-${COURSE_DOCUMENT_LIMITS.lateralMeters} m`,
    'invalid_numeric_domain',
  );
  return l;
}

/** Scenery, each expanded row instance and grid slots publish only their resolved l. */
export function resolveCourseLateral(
  lateral: Lateral,
  s: number,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  path: string,
): number {
  const boundary = lateralBoundary(lateral, s, s, (id) => boundaries.get(id), path);
  return checkedLateral(lateralAt(lateral, boundary, s), path);
}

/** Shared Boundary/Strip knot rule; references are sampled before the authored endpoint blend. */
export function resolveLateralInterval(
  a: Lateral,
  b: Lateral,
  start: number,
  end: number,
  lookup: BoundaryLookup,
  path: string,
) {
  const left = lateralBoundary(a, start, end, lookup, path);
  const right = lateralBoundary(b, start, end, lookup, path);
  const stops = new Set([start, end]);
  for (const boundary of [left, right])
    for (const vertex of boundary?.vertices ?? []) if (vertex.at.s > start && vertex.at.s < end) stops.add(vertex.at.s);
  const vertices = [...stops]
    .sort((a, b) => a - b)
    .map((s) => {
      const av = lateralAt(a, left, s),
        bv = lateralAt(b, right, s);
      return Object.freeze({
        at: Object.freeze({ s }),
        l: checkedLateral(s === start ? av : s === end ? bv : av + (bv - av) * ((s - start) / (end - start)), path),
      });
    });
  const lines = vertices.slice(0, -1).map((vertex, i): StripEdgeLine => {
    if (typeof a !== 'number' && typeof b !== 'number' && a.boundary === b.boundary && a.offset === b.offset) {
      const index = left!.vertices.findIndex((point) => point.at.s > vertex.at.s) - 1;
      const from = left!.vertices[index]!,
        to = left!.vertices[index + 1]!;
      return Object.freeze({
        start: from.at.s,
        end: to.at.s,
        from: from.l,
        to: to.l,
        anchored: true,
        offset: a.offset,
      });
    }
    return Object.freeze({ start: vertex.at.s, end: vertices[i + 1]!.at.s, from: vertex.l, to: vertices[i + 1]!.l });
  });
  return { vertices, lines };
}

/** Resolve the acyclic Section graph before material or rendering compilation. */
export function compileCourseBoundaries(
  sources: SectionDocument['boundaries'],
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
): readonly CompiledBoundary[] {
  const table = new Map(sources.map((source, i) => [source.id, { source, path: `${path}/${i}` }]));
  const compiled = new Map<string, CompiledBoundary>();
  const visiting = new Set<string>();
  let vertexCount = 0;
  const compile: BoundaryLookup = (id, referencePath) => {
    const ready = compiled.get(id);
    if (ready) return ready;
    const entry = table.get(id);
    if (!entry) return undefined;
    requireCourse(!visiting.has(id), referencePath, 'Boundary references must be acyclic', 'invalid_boundary');
    visiting.add(id);
    const at = `${entry.path}/knots`;
    const authored = entry.source.knots.map((knot, i) => ({
      at: resolve(knot.at, `${at}/${i}/at`),
      lateral: knot.lateral,
    }));
    requireCourse(authored.length >= 2, at, 'Boundary needs at least two knots', 'invalid_boundary');
    for (let i = 1; i < authored.length; i++)
      requireCourse(
        authored[i]!.at.s > authored[i - 1]!.at.s,
        `${at}/${i}`,
        'Resolved knots must be strictly increasing',
        'invalid_boundary',
      );
    const vertices: CompiledBoundary['vertices'][number][] = [];
    for (let i = 1; i < authored.length; i++) {
      const a = authored[i - 1]!,
        b = authored[i]!;
      const resolved = resolveLateralInterval(a.lateral, b.lateral, a.at.s, b.at.s, compile, `${at}/${i}/lateral`);
      const added = resolved.vertices.length - (i === 1 ? 0 : 1);
      requireCourse(
        vertexCount + added <= COURSE_DOCUMENT_LIMITS.boundaryVertices,
        at,
        'Resolved Boundary vertices exceed the Section limit',
        'resource_limit',
      );
      vertexCount += added;
      vertices.push(...resolved.vertices.slice(i === 1 ? 0 : 1));
    }
    const boundary = Object.freeze({ id, vertices: Object.freeze(vertices) });
    compiled.set(id, boundary);
    visiting.delete(id);
    return boundary;
  };
  return Object.freeze(sources.map((source, i) => compile(source.id, `${path}/${i}`)!));
}
