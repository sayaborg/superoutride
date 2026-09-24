import { createPlanCoordinateSample } from './geometry/plan-coordinate.js';
import { createPlanCoordinateReader } from './geometry/plan-coordinate-reader.js';
import type { CompiledPlanPrimitive } from './geometry/plan-path.js';
import type { CompiledPlanLateralDomain } from './course-region-geometry.js';
import { CourseInputError } from './course-diagnostics.js';
import { normalFromHeading, tangentFromHeading, type Vec2 } from '../core/math.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';

interface Cell {
  readonly start: number;
  readonly end: number;
  readonly index: number;
  readonly hull: readonly Vec2[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly padding: number;
}
const cross = (a: Vec2, b: Vec2) => a.x * b.z - a.z * b.x;
const turn = (a: Vec2, b: Vec2, c: Vec2) => cross({ x: b.x - a.x, z: b.z - a.z }, { x: c.x - a.x, z: c.z - a.z });

function hull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const half = (list: readonly Vec2[]): Vec2[] => {
    const result: Vec2[] = [];
    for (const point of list) {
      while (result.length >= 2 && turn(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    result.pop();
    return result;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

function separated(a: readonly Vec2[], b: readonly Vec2[], padding: number): boolean {
  return a.some((p, i) => {
    const q = a[(i + 1) % a.length]!;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    return b.every((other) => turn(p, q, other) < -(padding + GEOMETRY_SAMPLING_TOLERANCE_METERS) * length);
  });
}

/** Conservative envelopes of exact straight/circular offsets. */
export function validatePlanDomainInjectivity(
  sectionId: string,
  primitives: readonly CompiledPlanPrimitive[],
  domain: CompiledPlanLateralDomain,
  sectionPath: string,
): void {
  const length = primitives.at(-1)!.sEnd;
  const coordinates = createPlanCoordinateReader(primitives, length, domain.lateralAt);
  const a = createPlanCoordinateSample();
  const b = createPlanCoordinateSample();
  const left = { left: 0, right: 0 };
  const right = { left: 0, right: 0 };
  const cells: Cell[] = [];
  for (const primitive of primitives) {
    const stops = [
      primitive.sStart,
      ...domain.stations.filter((s) => s > primitive.sStart && s < primitive.sEnd),
      primitive.sEnd,
    ];
    for (let i = 1; i < stops.length; i += 1) {
      const from = stops[i - 1]!;
      const to = stops[i]!;
      // At most five degrees per arc cell. This is an inspection bound, independent of rendered tessellation.
      const count = Math.max(1, Math.ceil((Math.abs(primitive.curvature) * (to - from)) / (Math.PI / 36)));
      for (let j = 0; j < count; j += 1) {
        const start = from + ((to - from) * j) / count;
        const end = j === count - 1 ? to : from + ((to - from) * (j + 1)) / count;
        domain.lateralAt(start, left);
        domain.lateralAt(end, right);
        const edge = (l0: number, l1: number): Vec2[] => {
          coordinates.toWorld(start, l0, a);
          coordinates.toWorld(end, l1, b);
          const p = { x: a.x, z: a.z };
          const q = { x: b.x, z: b.z };
          if (primitive.curvature === 0) return [p, q];
          const slope = (l1 - l0) / (end - start);
          const derivative = (heading: number, l: number): Vec2 => {
            const tangent = tangentFromHeading(heading);
            const normal = normalFromHeading(heading);
            const metric = 1 - primitive.curvature * l;
            return { x: metric * tangent.x + slope * normal.x, z: metric * tangent.z + slope * normal.z };
          };
          const da = derivative(a.heading, l0);
          const db = derivative(b.heading, l1);
          const denominator = cross(da, db);
          // A nearly straight offset is safely enclosed by the endpoint segment and its tangent intersection.
          if (Math.abs(denominator) < 1e-14) return [p, q];
          const delta = { x: q.x - p.x, z: q.z - p.z };
          const t = cross(delta, db) / denominator;
          return [p, { x: p.x + t * da.x, z: p.z + t * da.z }, q];
        };
        const points = hull([...edge(left.left, right.left), ...edge(left.right, right.right)]);
        // The chord is in the hull. For a twice-differentiable edge, its maximum distance
        // from the chord is <= max|F''| * ds^2 / 8. F'' = -2*k*l'*T + k*(1-k*l)*N.
        const slope = Math.max(Math.abs(right.left - left.left), Math.abs(right.right - left.right)) / (end - start);
        const maxL = Math.max(Math.abs(left.left), Math.abs(left.right), Math.abs(right.left), Math.abs(right.right));
        const k = Math.abs(primitive.curvature);
        const padding = (k * (1 + k * maxL + 2 * slope) * (end - start) ** 2) / 8;
        cells.push({
          start,
          end,
          index: cells.length,
          hull: points,
          minX: Math.min(...points.map((p) => p.x)),
          maxX: Math.max(...points.map((p) => p.x)),
          minZ: Math.min(...points.map((p) => p.z)),
          maxZ: Math.max(...points.map((p) => p.z)),
          padding,
        });
      }
    }
  }
  // X sweep skips distant pairs; the two neighboring cells meet only along their shared s boundary.
  const ordered = [...cells].sort((a, b) => a.minX - b.minX);
  const maxPadding = cells.reduce((max, cell) => Math.max(max, cell.padding), 0);
  for (let i = 0; i < ordered.length; i += 1) {
    const a = ordered[i]!;
    for (let j = i + 1; j < ordered.length; j += 1) {
      const b = ordered[j]!;
      if (b.minX > a.maxX + a.padding + maxPadding + GEOMETRY_SAMPLING_TOLERANCE_METERS) break;
      if (b.minX > a.maxX + a.padding + b.padding + GEOMETRY_SAMPLING_TOLERANCE_METERS) continue;
      if (
        Math.abs(a.index - b.index) <= 1 ||
        b.minZ > a.maxZ + a.padding + b.padding + GEOMETRY_SAMPLING_TOLERANCE_METERS ||
        a.minZ > b.maxZ + a.padding + b.padding + GEOMETRY_SAMPLING_TOLERANCE_METERS
      )
        continue;
      if (separated(a.hull, b.hull, a.padding + b.padding) || separated(b.hull, a.hull, a.padding + b.padding))
        continue;
      const intervals = Object.freeze(
        [a, b].sort((x, y) => x.start - y.start).map((cell) => Object.freeze({ sStart: cell.start, sEnd: cell.end })),
      );
      throw new CourseInputError(
        'plan_coordinate_overlap',
        sectionPath,
        `Section ${JSON.stringify(sectionId)} coordinate domain overlaps at ${JSON.stringify(intervals)}`,
        { section: sectionId, intervals },
      );
    }
  }
}
