import { CourseInputError, requireCourse } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { SECTION_END_JOINT, type CoursePosition, type SectionDocument } from './course-document.js';
import { compilePlanPath, type PlanSegmentGeometry } from './geometry/plan-path.js';

export type { CompiledPlanSegment } from './geometry/plan-path.js';
export interface CompiledCoursePosition {
  readonly s: number;
}

/**
 * Compile a Section's plan once, from its origin facing +Z: each element's start is a joint, and so is the Section's
 * end. The temporary joint lookup is discarded before course publication.
 */
export function compileCourseGeometry(section: SectionDocument, path: string) {
  const elements = section.plan;
  const check = (condition: boolean, index: number, message: string) =>
    requireCourse(condition, `${path}/plan/${index}`, message, 'invalid_plan');
  check(elements.length >= 1, 0, 'A Section requires at least one plan element');
  const geometry: PlanSegmentGeometry[] = [];
  elements.forEach((element, i) => {
    const before = elements[i - 1];
    if (before?.kind === 'straight') check(element.kind !== 'straight', i, 'A straight cannot follow a straight');
    if (before?.kind === 'arc' && element.kind === 'arc')
      check(
        element.radius !== before.radius || element.turn !== before.turn,
        i,
        'An arc cannot follow an arc of the same radius and turn',
      );
    geometry.push(
      element.kind === 'straight'
        ? { kind: 'straight', length: element.length }
        : {
            kind: 'arc',
            radius: element.radius,
            turn: ((element.turn === 'right' ? 1 : -1) * element.length) / element.radius,
          },
    );
  });
  const plan = compilePlanPath({ x: 0, z: 0, heading: 0 }, geometry);
  const order = [...elements.map((element) => element.id), SECTION_END_JOINT];
  const stations = new Map<string, number>(elements.map((element, i) => [element.id, plan.segments[i]!.sStart]));
  stations.set(SECTION_END_JOINT, plan.length);
  requireCourse(
    plan.segments.every((segment) => segment.sEnd > segment.sStart && Number.isFinite(segment.curvature)),
    `${path}/plan`,
    'Plan segments must have positive representable length and finite curvature',
    'invalid_plan',
  );
  if (plan.length > COURSE_DOCUMENT_LIMITS.lengthMeters)
    throw new CourseInputError(
      'resource_limit',
      `${path}/plan`,
      `Compiled ruler exceeds ${COURSE_DOCUMENT_LIMITS.lengthMeters} m`,
    );
  const joints: CourseJoints = Object.freeze({ length: plan.length, stations, order: Object.freeze(order) });
  return { ...plan, joints };
}

/** A Section's joints: each plan element's start and its end, `"end"`, with their stations. */
export interface CourseJoints {
  /** The Section's length, the station of `"end"`. */
  readonly length: number;
  readonly stations: ReadonlyMap<string, number>;
  /** The joints in plan order, their stations increasing. */
  readonly order: readonly string[];
}

/** The joint nearest station `s`; of two as near, the earlier. */
export function nearestCourseJoint(joints: CourseJoints, s: number): string {
  const { order, stations } = joints;
  // The first joint after s, then the nearer of it and the one before.
  let lo = 0,
    hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stations.get(order[mid]!)! <= s) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return order[0]!;
  if (lo === order.length) return order.at(-1)!;
  const before = order[lo - 1]!,
    after = order[lo]!;
  return stations.get(after)! - s < s - stations.get(before)! ? after : before;
}

/**
 * A Position's station: its joint's plus its offset. The Position must be measured from the joint nearest its station
 * (of two as near, the earlier) and lie within the Section.
 */
export function resolveCoursePosition(at: CoursePosition, joints: CourseJoints, path: string): CompiledCoursePosition {
  const { stations, length } = joints;
  const station = stations.get(at.joint);
  if (station === undefined)
    throw new CourseInputError(
      'unresolved_reference',
      `${path}/joint`,
      `Unknown joint ${JSON.stringify(at.joint)} in this Section`,
    );
  const s = station + at.offset;
  if (s < 0 || s > length)
    throw new CourseInputError('invalid_position', path, `Position ${s} is outside [0, ${length}]`);
  const nearest = nearestCourseJoint(joints, s);
  if (nearest !== at.joint)
    throw new CourseInputError(
      'invalid_position',
      `${path}/joint`,
      `Position ${s} must be measured from its nearest joint, ${JSON.stringify(nearest)}`,
    );
  return Object.freeze({ s });
}
