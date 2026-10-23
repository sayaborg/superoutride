import { stripEdgeAt, stripSlabAt } from '../strip-slabs.js';
import type { StripMaterial } from '../strip-material.js';
import { courseBoundaryAt, type CompiledBoundary } from '../course-boundaries.js';
import type { CourseLateralLine, CourseWidth, CoursePosition, SectionDocument } from '../course-document.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import type { CompiledLane, CompiledLanes } from '../course-lanes.js';

type Knot = { s: number; value: number };

/**
 * A width's or a lateral's knots: one value at the Section's ends, or the authored values, from its start to its end.
 */
function lineKnots(
  line: number | readonly { readonly at: CoursePosition; readonly value: number }[],
  name: 'width' | 'lateral',
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  length: number,
  path: string,
): Knot[] {
  if (typeof line === 'number')
    return [
      { s: 0, value: line },
      { s: length, value: line },
    ];
  const knots = line.map((knot, i) => ({ s: resolve(knot.at, `${path}/${i}/at`).s, value: knot.value }));
  requireCourse(
    knots[0]!.s === 0 && knots.at(-1)!.s === length,
    path,
    `A ${name}'s values run from the Section's start to its end`,
    'invalid_lane',
  );
  const stations = name === 'width' ? 'Width stations' : 'Lateral stations';
  for (let i = 1; i < knots.length; i++)
    requireCourse(knots[i]!.s > knots[i - 1]!.s, `${path}/${i}/at`, `${stations} strictly increase`, 'invalid_lane');
  return knots;
}

const widthLine = (width: CourseWidth) =>
  typeof width === 'number' ? width : width.map(({ at, width: value }) => ({ at, value }));
const lateralLine = (lateral: CourseLateralLine) =>
  typeof lateral === 'number' ? lateral : lateral.map(({ at, lateral: value }) => ({ at, value }));

function valueAt(knots: readonly Knot[], s: number): number {
  let i = 1;
  while (i < knots.length - 1 && knots[i]!.s < s) i++;
  const a = knots[i - 1]!,
    b = knots[i]!;
  if (s === a.s) return a.value;
  if (s === b.s) return b.value;
  return a.value + (b.value - a.value) * ((s - a.s) / (b.s - a.s));
}

const line = (id: string, stations: readonly number[], values: readonly number[]): CompiledBoundary =>
  Object.freeze({
    id,
    vertices: Object.freeze(stations.map((s, i) => Object.freeze({ at: Object.freeze({ s }), l: values[i]! }))),
  });

/**
 * Lay a Section's lanes and medians out from its centre lane, whose centre lies `centerLateral` right of the
 * centreline: each lane's edges and centre, and each median's width, as lines with a vertex wherever a width or that
 * lateral changes slope. The centre lane must be wider than zero along the whole Section.
 */
export function compileCourseLanes(
  section: SectionDocument,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  length: number,
  path: string,
): CompiledLanes {
  const elements = section.lanes.map((element, i) => ({
    element,
    knots: lineKnots(widthLine(element.width), 'width', resolve, length, `${path}/${i}/width`),
  }));
  const lateral = lineKnots(
    lateralLine(section.centerLateral),
    'lateral',
    resolve,
    length,
    `${path.replace(/\/lanes$/, '')}/centerLateral`,
  );
  const center = elements.findIndex(({ element }) => element.kind === 'lane' && element.id === section.centerLane);
  if (center < 0)
    throw new CourseInputError('unresolved_reference', `${path.replace(/\/lanes$/, '')}/centerLane`, 'Unknown lane');
  requireCourse(
    elements[center]!.knots.every((knot) => knot.value > 0),
    `${path}/${center}/width`,
    'The centre lane is wider than zero along the whole Section',
    'invalid_lane',
  );
  const stations = [
    ...new Set([...elements.flatMap(({ knots }) => knots.map((knot) => knot.s)), ...lateral.map((knot) => knot.s)]),
  ].sort((a, b) => a - b);
  requireCourse(
    stations.length * elements.length * 4 <= COURSE_DOCUMENT_LIMITS.boundaryVertices,
    path,
    'Resolved lane vertices exceed the Section limit',
    'resource_limit',
  );
  // Each element's width, left edge and right edge at each station, laid outward from the centre lane.
  const widths = elements.map(({ knots }) => stations.map((s) => valueAt(knots, s)));
  const lefts = elements.map(() => new Array<number>(stations.length));
  const rights = elements.map(() => new Array<number>(stations.length));
  stations.forEach((s, k) => {
    const centre = valueAt(lateral, s);
    lefts[center]![k] = centre - widths[center]![k]! / 2;
    rights[center]![k] = centre + widths[center]![k]! / 2;
    for (let i = center + 1; i < elements.length; i++) {
      lefts[i]![k] = rights[i - 1]![k]!;
      rights[i]![k] = lefts[i]![k]! + widths[i]![k]!;
    }
    for (let i = center - 1; i >= 0; i--) {
      rights[i]![k] = lefts[i + 1]![k]!;
      lefts[i]![k] = rights[i]![k]! - widths[i]![k]!;
    }
  });
  const compiled = elements.map(({ element }, i) => {
    const width = line(`width ${i}`, stations, widths[i]!);
    if (element.kind === 'median') return Object.freeze({ kind: 'median' as const, width });
    const lane: CompiledLane = Object.freeze({
      id: element.id,
      left: line(`${element.id} left`, stations, lefts[i]!),
      center: line(
        `${element.id} center`,
        stations,
        lefts[i]!.map((l, k) => (l + rights[i]![k]!) / 2),
      ),
      right: line(`${element.id} right`, stations, rights[i]!),
      width,
    });
    return Object.freeze({ kind: 'lane' as const, lane });
  });
  return Object.freeze({
    elements: Object.freeze(compiled),
    center: (compiled[center] as { lane: CompiledLane }).lane,
  });
}

/**
 * Every lane wider than zero lies on supported material, one continuous supported span covering it through each cell
 * where every edge is affine, so no unsupported gap can sweep across a lane between the stations checked.
 */
export function validateCourseLanes(lanes: CompiledLanes, material: StripMaterial, length: number, path: string) {
  const all = lanes.elements.flatMap((element) => (element.kind === 'lane' ? [element.lane] : []));
  const stations = [
    ...new Set([
      0,
      length,
      ...lanes.center.left.vertices.map((vertex) => vertex.at.s),
      ...material.slabs.flatMap((slab) => [slab.start, slab.end]),
    ]),
  ].sort((a, b) => a - b);
  for (let i = 0; i + 1 < stations.length; i++) {
    const s = stations[i]!,
      end = stations[i + 1]!,
      middle = s + (end - s) / 2;
    const slab = material.slabs[stripSlabAt(material.slabs, middle)]!;
    const support: { left: (typeof slab.spans)[number]; right: (typeof slab.spans)[number] }[] = [];
    let continuing = false;
    for (const span of slab.spans) {
      if (span.value === null) {
        continuing = false;
        continue;
      }
      if (continuing) support.at(-1)!.right = span;
      else support.push({ left: span, right: span });
      continuing = true;
    }
    for (const lane of all) {
      if (!(courseBoundaryAt(lane.width, middle) > 0)) continue;
      const covers = (range: (typeof support)[number], at: number) =>
        stripEdgeAt(range.left, 'left', at) <= courseBoundaryAt(lane.left, at) &&
        stripEdgeAt(range.right, 'right', at) >= courseBoundaryAt(lane.right, at);
      requireCourse(
        support.some((range) => [s, middle, end].every((at) => covers(range, at))),
        path,
        `Lane ${lane.id} requires continuous supported material throughout [${s}, ${end}]`,
        'invalid_lane',
      );
    }
  }
}
