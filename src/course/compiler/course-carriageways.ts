import { requireCourse } from '../course-diagnostics.js';
import {
  courseBoundaryAt,
  courseCarriagewayExists,
  type CompiledCarriageway,
  type CompiledRegion,
} from '../course-regions.js';

function intervals(roads: readonly CompiledCarriageway[], s: number): [number, number][] {
  return roads
    .map((road): [number, number] => [courseBoundaryAt(road.left, s), courseBoundaryAt(road.right, s)])
    .filter(([left, right]) => right > left)
    .sort((a, b) => a[0] - b[0]);
}

function union(ranges: readonly [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  for (const [left, right] of ranges) {
    const previous = result.at(-1);
    if (previous && left <= previous[1]) previous[1] = Math.max(previous[1], right);
    else result.push([left, right]);
  }
  return result;
}

/** Affine cells prove widths, disjoint interiors and temporary pavement equality for every station. */
export function validateCourseCarriageways(
  roads: readonly CompiledCarriageway[],
  regions: readonly CompiledRegion[],
  length: number,
  path: string,
): void {
  const check = (condition: boolean, message: string) => requireCourse(condition, path, message, 'invalid_carriageway');
  for (const road of roads) {
    check(
      Math.max(road.left.knots[0]!.at.s, road.right.knots[0]!.at.s) <
        Math.min(road.left.knots.at(-1)!.at.s, road.right.knots.at(-1)!.at.s),
      `Carriageway ${road.id} requires a positive common Boundary domain`,
    );
  }
  const pavement = regions.filter((region) => region.role === 'pavement');
  const stations = [
    ...new Set([
      0,
      length,
      ...[...roads, ...pavement].flatMap((road) =>
        [road.left, road.right].flatMap((boundary) => boundary.knots.map((knot) => knot.at.s)),
      ),
      ...pavement.flatMap((region) => [region.start.s, region.end.s]),
    ]),
  ].sort((a, b) => a - b);
  const verify = (active: readonly CompiledCarriageway[], paved: readonly CompiledRegion[], s: number) => {
    for (const road of active)
      check(
        courseBoundaryAt(road.left, s) <= courseBoundaryAt(road.right, s),
        `Carriageway ${road.id} has reversed edges at s=${s}`,
      );
    const ranges = intervals(active, s);
    check(
      ranges.every((range, i) => i === 0 || ranges[i - 1]![1] <= range[0]),
      `Carriageway interiors overlap at s=${s}`,
    );
    const actual = union(ranges);
    const expected = union(intervals(paved, s));
    check(
      actual.length === expected.length &&
        actual.every((range, i) => range[0] === expected[i]![0] && range[1] === expected[i]![1]),
      `Carriageway and pavement unions disagree at s=${s}`,
    );
  };
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]!;
    verify(
      roads.filter((road) => courseCarriagewayExists(road, s, length)),
      pavement.filter((region) => region.start.s <= s && (s < region.end.s || (s === length && s === region.end.s))),
      s,
    );
    const end = stations[i + 1];
    if (end === undefined) continue;
    const middle = s + (end - s) / 2;
    const active = roads.filter((road) => courseCarriagewayExists(road, middle, length));
    const paved = pavement.filter((region) => region.start.s <= middle && middle < region.end.s);
    for (const road of active)
      check(
        courseBoundaryAt(road.right, middle) > courseBoundaryAt(road.left, middle),
        `Carriageway ${road.id} has nonpositive width throughout [${s}, ${end}]`,
      );
    const ordered = [...active].sort((a, b) => courseBoundaryAt(a.left, middle) - courseBoundaryAt(b.left, middle));
    for (let j = 1; j < ordered.length; j++)
      check(
        [s, end].every((at) => courseBoundaryAt(ordered[j - 1]!.right, at) <= courseBoundaryAt(ordered[j]!.left, at)),
        `Carriageway interiors overlap within [${s}, ${end}]`,
      );
    // All edges are affine in this cell; prove each side limit as well as the interior union.
    for (const at of [s, middle, end]) verify(active, paved, at);
  }
}
