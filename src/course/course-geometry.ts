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
  return { ...plan, stations };
}

export function resolveCoursePosition(
  at: CoursePosition,
  stations: ReadonlyMap<string, number>,
  length: number,
  path: string,
): CompiledCoursePosition {
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
  return Object.freeze({ s });
}
