import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS, type CourseAnchor, type SectionDocument } from './course-document.js';
import { compilePlanPath, type CompiledPlanPrimitive, type PlanPath } from './geometry/plan-path.js';

export type { CompiledPlanPrimitive } from './geometry/plan-path.js';

export type CompiledCourseAnchor =
  | { readonly kind: 'absolute'; readonly s: number }
  | {
      readonly kind: 'primitive';
      readonly s: number;
      readonly primitive: CompiledPlanPrimitive;
      readonly fraction: number;
    };

/** Compile the authored straight and circular plan authority. */
export function compileCourseGeometry(section: SectionDocument, path: string): PlanPath {
  if (section.primitives.length === 0)
    throw new CourseInputError('empty_section', `${path}/primitives`, 'A Section requires at least one plan primitive');
  const plan: PlanPath = compilePlanPath({ x: 0, z: 0, heading: 0 }, section.primitives);
  if (plan.length > COURSE_DOCUMENT_LIMITS.lengthMeters)
    throw new CourseInputError('resource_limit', `${path}/primitives`, 'Compiled ruler exceeds 100000 m');

  return plan;
}

export function resolveCourseAnchor(
  anchor: CourseAnchor,
  primitives: ReadonlyMap<string, CompiledPlanPrimitive>,
  length: number,
  path: string,
): CompiledCourseAnchor {
  if (anchor.kind === 'absolute') {
    if (anchor.s > length)
      throw new CourseInputError('invalid_anchor', `${path}/s`, `Anchor ${anchor.s} is outside [0, ${length}]`);
    return Object.freeze({ kind: 'absolute', s: anchor.s });
  }
  const primitive = primitives.get(anchor.primitiveId);
  if (!primitive)
    throw new CourseInputError(
      'unresolved_reference',
      `${path}/primitiveId`,
      `Unknown primitive ${JSON.stringify(anchor.primitiveId)} in this Section`,
    );
  const s =
    anchor.fraction === 0
      ? primitive.sStart
      : anchor.fraction === 1
        ? primitive.sEnd
        : primitive.sStart + anchor.fraction * (primitive.sEnd - primitive.sStart);
  return Object.freeze({ kind: 'primitive', s, primitive, fraction: anchor.fraction });
}
