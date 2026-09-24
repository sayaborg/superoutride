import type { BandEdgeLine } from '../band-ground.js';
import { COURSE_DOCUMENT_LIMITS, type Lateral, type CoursePosition, type SectionDocument } from '../course-document.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { courseBoundaryAt, type CompiledBoundary } from '../course-regions.js';
import { requireCourse } from '../course-diagnostics.js';

type BoundaryLookup = (id: string, path: string) => CompiledBoundary | undefined;

/** References must cover the whole interval in which their expression is evaluated. */
function lateralBoundary(lateral: Lateral, start: number, end: number, lookup: BoundaryLookup, path: string) {
  if (typeof lateral === 'number') return null;
  const boundary = lookup(lateral.boundary, `${path}/boundary`);
  requireCourse(boundary !== undefined, `${path}/boundary`, 'Unknown Section Boundary', 'unresolved_reference');
  requireCourse(
    boundary.knots[0]!.at.s <= start && boundary.knots.at(-1)!.at.s >= end,
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
    'Resolved lateral position must be within +/-1000 m',
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
    for (const knot of boundary?.knots ?? []) if (knot.at.s > start && knot.at.s < end) stops.add(knot.at.s);
  const knots = [...stops]
    .sort((a, b) => a - b)
    .map((s) => {
      const av = lateralAt(a, left, s),
        bv = lateralAt(b, right, s);
      return Object.freeze({
        at: Object.freeze({ s }),
        l: checkedLateral(s === start ? av : s === end ? bv : av + (bv - av) * ((s - start) / (end - start)), path),
      });
    });
  const lines = knots.slice(0, -1).map((knot, i): BandEdgeLine => {
    if (typeof a !== 'number' && typeof b !== 'number' && a.boundary === b.boundary && a.offset === b.offset) {
      const index = left!.knots.findIndex((point) => point.at.s > knot.at.s) - 1;
      const from = left!.knots[index]!,
        to = left!.knots[index + 1]!;
      return Object.freeze({
        start: from.at.s,
        end: to.at.s,
        from: from.l,
        to: to.l,
        anchored: true,
        offset: a.offset,
      });
    }
    return Object.freeze({ start: knot.at.s, end: knots[i + 1]!.at.s, from: knot.l, to: knots[i + 1]!.l });
  });
  return { knots, lines };
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
  let pointCount = 0;
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
    const knots: CompiledBoundary['knots'][number][] = [];
    for (let i = 1; i < authored.length; i++) {
      const a = authored[i - 1]!,
        b = authored[i]!;
      const resolved = resolveLateralInterval(a.lateral, b.lateral, a.at.s, b.at.s, compile, `${at}/${i}/lateral`);
      const added = resolved.knots.length - (i === 1 ? 0 : 1);
      requireCourse(
        pointCount + added <= COURSE_DOCUMENT_LIMITS.boundaryPoints,
        at,
        'Resolved Boundary points exceed the Section limit',
        'resource_limit',
      );
      pointCount += added;
      knots.push(...resolved.knots.slice(i === 1 ? 0 : 1));
    }
    const boundary = Object.freeze({ id, knots: Object.freeze(knots) });
    compiled.set(id, boundary);
    visiting.delete(id);
    return boundary;
  };
  return Object.freeze(sources.map((source, i) => compile(source.id, `${path}/${i}`)!));
}
