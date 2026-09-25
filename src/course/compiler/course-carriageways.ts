import { stripEdgeAt, stripSlabAt } from '../strip-ground.js';
import { stripSupportedIntervals, type StripMaterial } from '../strip-material.js';
import { requireCourse } from '../course-diagnostics.js';
import { courseBoundaryAt, courseCarriagewayExists, type CompiledCarriageway } from '../course-boundaries.js';

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

/** Affine cells prove widths, disjoint interiors and material support and continuity for every station. */
export function validateCourseCarriageways(
  roads: readonly CompiledCarriageway[],
  material: StripMaterial,
  length: number,
  path: string,
): void {
  const check = (condition: boolean, message: string) => requireCourse(condition, path, message, 'invalid_carriageway');
  for (const road of roads) {
    check(
      Math.max(road.left.vertices[0]!.at.s, road.right.vertices[0]!.at.s) <
        Math.min(road.left.vertices.at(-1)!.at.s, road.right.vertices.at(-1)!.at.s),
      `Carriageway ${road.id} requires a positive common Boundary domain`,
    );
  }
  const stations = [
    ...new Set([
      0,
      length,
      ...roads.flatMap((road) =>
        [road.left, road.right].flatMap((boundary) => boundary.vertices.map((vertex) => vertex.at.s)),
      ),
      ...material.slabs.flatMap((slab) => [slab.start, slab.end]),
    ]),
  ].sort((a, b) => a - b);
  const verify = (active: readonly CompiledCarriageway[], slab: StripMaterial['slabs'][number], s: number) => {
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
    const supported = stripSupportedIntervals(slab, s);
    check(
      ranges.every(([left, right]) => supported.some((span) => span[0] <= left && span[1] >= right)),
      `Carriageway interiors require supported material at s=${s}`,
    );
  };
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i]!;
    verify(
      roads.filter((road) => courseCarriagewayExists(road, s, length)),
      material.slabs[stripSlabAt(material.slabs, s)]!,
      s,
    );
    const end = stations[i + 1];
    if (end === undefined) continue;
    const middle = s + (end - s) / 2;
    const active = roads.filter((road) => courseCarriagewayExists(road, middle, length));
    const slab = material.slabs[stripSlabAt(material.slabs, middle)]!;
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
    // Keep one connected support component for the whole affine cell. Independent point
    // containment could miss a narrow unsupported gap sweeping across a road between probes.
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
    for (const road of active) {
      const component = support.find(
        (range) =>
          stripEdgeAt(range.left, 'left', middle) <= courseBoundaryAt(road.left, middle) &&
          stripEdgeAt(range.right, 'right', middle) >= courseBoundaryAt(road.right, middle),
      );
      check(
        component !== undefined &&
          [s, end].every(
            (at) =>
              stripEdgeAt(component.left, 'left', at) <= courseBoundaryAt(road.left, at) &&
              stripEdgeAt(component.right, 'right', at) >= courseBoundaryAt(road.right, at),
          ),
        `Carriageway ${road.id} requires continuous supported material throughout [${s}, ${end}]`,
      );
    }
    if (i > 0) {
      const prior = (stations[i - 1]! + s) / 2;
      const before = union(
        intervals(
          roads.filter((road) => courseCarriagewayExists(road, prior, length)),
          s,
        ),
      );
      const after = union(intervals(active, s));
      requireCourse(
        before.length === after.length &&
          before.every((range, j) => range[0] === after[j]![0] && range[1] === after[j]![1]),
        path,
        `Carriageway union must be continuous at s=${s}`,
        'carriageway_transition_discontinuity',
      );
    }
    // All edges are affine in this cell; prove each side limit as well as the interior union.
    for (const at of [s, middle, end]) verify(active, slab, at);
  }
}
