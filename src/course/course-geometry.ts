import { CourseInputError, requireCourse } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { type CoursePosition, type SectionDocument } from './course-document.js';
import { compilePlanPath, PLAN_POSITION_TOLERANCE_METERS, type PlanSegmentGeometry } from './geometry/plan-path.js';

export type { CompiledPlanSegment } from './geometry/plan-path.js';
export interface CompiledCoursePosition {
  readonly s: number;
}

/** Compile PIs once; temporary station lookup is discarded before course publication. */
export function compileCourseGeometry(section: SectionDocument, path: string) {
  const pis = section.pis;
  const check = (condition: boolean, index: number, message: string) =>
    requireCourse(condition, `${path}/pis/${index}`, message, 'invalid_plan');
  check(pis.length >= 2, 0, 'A Section requires at least two PIs');
  const edges = pis.slice(1).map((p, i) => {
    const dx = p.x - pis[i]!.x,
      dz = p.z - pis[i]!.z;
    const length = Math.hypot(dx, dz);
    check(length > 0, i + 1, 'Consecutive PIs must have distinct coordinates');
    return { length, x: dx / length, z: dz / length };
  });
  const turns = pis.map((p, i) => {
    if (i === 0 || i === pis.length - 1) {
      check(p.radius === 0, i, 'Endpoint PI radius must be zero');
      return { turn: 0, tangent: 0 };
    }
    check(p.radius > 0, i, 'Interior PI radius must be positive');
    const a = edges[i - 1]!,
      b = edges[i]!;
    const turn = Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
    check(
      Math.abs(turn) > 0 && Math.abs(turn) < Math.PI,
      i,
      'PI deflection must be greater than zero and less than 180 degrees',
    );
    return { turn, tangent: p.radius * Math.tan(Math.abs(turn) / 2) };
  });
  const geometry: PlanSegmentGeometry[] = [];
  const stations = new Map<string, number>([[pis[0]!.id, 0]]);
  let s = 0;
  for (let i = 0; i < edges.length; i++) {
    const remaining = edges[i]!.length - turns[i]!.tangent - turns[i + 1]!.tangent;
    // The plan's metre budget absorbs coordinate/trig roundoff for touching arcs.
    check(remaining >= -PLAN_POSITION_TOLERANCE_METERS, i + 1, 'Adjacent arc tangent lengths must not overlap');
    const hasArc = turns[i]!.tangent > 0 || turns[i + 1]!.tangent > 0;
    const straight = hasArc && remaining <= PLAN_POSITION_TOLERANCE_METERS ? 0 : remaining;
    if (straight > 0) {
      geometry.push({ kind: 'straight', length: straight });
      s += straight;
    }
    const pi = pis[i + 1]!,
      turn = turns[i + 1]!.turn;
    if (pi.radius > 0) {
      const degrees = turn * (180 / Math.PI);
      // Use the same conversion as the internal circular evaluator.
      const length = pi.radius * Math.abs(degrees * (Math.PI / 180));
      stations.set(pi.id, s + length / 2);
      geometry.push({ kind: 'arc', radius: pi.radius, turn: degrees });
      s += length;
    } else stations.set(pi.id, s);
  }
  const plan = compilePlanPath({ x: pis[0]!.x, z: pis[0]!.z, heading: Math.atan2(edges[0]!.x, edges[0]!.z) }, geometry);
  requireCourse(
    plan.segments.every((segment) => segment.sEnd > segment.sStart && Number.isFinite(segment.curvature)),
    `${path}/pis`,
    'Plan segments must have positive representable length and finite curvature',
    'invalid_plan',
  );
  if (plan.length > COURSE_DOCUMENT_LIMITS.lengthMeters)
    throw new CourseInputError(
      'resource_limit',
      `${path}/pis`,
      `Compiled ruler exceeds ${COURSE_DOCUMENT_LIMITS.lengthMeters} m`,
    );
  return { ...plan, stations };
}

export function resolveCoursePosition(
  at: CoursePosition,
  stations: ReadonlyMap<string, number>,
  length: number,
  path: string,
): CompiledCoursePosition {
  const station = stations.get(at.pi);
  if (station === undefined)
    throw new CourseInputError(
      'unresolved_reference',
      `${path}/pi`,
      `Unknown PI ${JSON.stringify(at.pi)} in this Section`,
    );
  const s = station + at.offset;
  if (s < 0 || s > length)
    throw new CourseInputError('invalid_position', path, `Position ${s} is outside [0, ${length}]`);
  return Object.freeze({ s });
}
