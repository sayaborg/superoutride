import { compileRasterPath, type RasterPath } from './geometry/raster-path.js';
import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS, type CourseAnchor, type SectionDocument } from './course-document.js';
import { compilePlanPath, samplePlanPath, type CompiledPlanPrimitive, type PlanPath } from './geometry/plan-path.js';

export const COURSE_GEOMETRY_RECIPE = Object.freeze({
  id: 'superoutride.plan-raster',
  version: 1,
  raster: Object.freeze({ straightStepMeters: 50, arcStepDegrees: 5 }),
});

export type { CompiledPlanPrimitive } from './geometry/plan-path.js';

export type CompiledCourseAnchor =
  | { readonly kind: 'absolute'; readonly s: number }
  | {
      readonly kind: 'primitive';
      readonly s: number;
      readonly primitive: CompiledPlanPrimitive;
      readonly fraction: number;
    };

function rasterStepCount(primitive: CompiledPlanPrimitive): number {
  return primitive.source.kind === 'straight'
    ? Math.ceil((primitive.sEnd - primitive.sStart) / COURSE_GEOMETRY_RECIPE.raster.straightStepMeters)
    : Math.ceil(Math.abs(primitive.source.turn) / COURSE_GEOMETRY_RECIPE.raster.arcStepDegrees);
}

/** Compile the authored primitive sequence as the plan authority, then derive the rendering Raster on the same s ruler. */
export function compileCourseGeometry(
  section: SectionDocument,
  path: string,
): {
  readonly raster: RasterPath;
  readonly primitives: readonly CompiledPlanPrimitive[];
  readonly length: number;
} {
  if (section.primitives.length === 0)
    throw new CourseInputError('empty_section', `${path}/primitives`, 'A Section requires at least one plan primitive');
  const plan: PlanPath = compilePlanPath({ x: 0, z: 0, heading: 0 }, section.primitives);
  const segmentCount = plan.primitives.reduce((sum, primitive) => sum + rasterStepCount(primitive), 0);
  if (segmentCount > COURSE_DOCUMENT_LIMITS.rasterSegments)
    throw new CourseInputError(
      'resource_limit',
      `${path}/primitives`,
      `Section exceeds ${COURSE_DOCUMENT_LIMITS.rasterSegments} Raster segments`,
    );
  if (plan.length > COURSE_DOCUMENT_LIMITS.lengthMeters)
    throw new CourseInputError('resource_limit', `${path}/primitives`, 'Compiled ruler exceeds 100000 m');

  const sample = { x: 0, z: 0, s: 0, heading: 0, primitiveIndex: -1 };
  const first = samplePlanPath(plan, 0, sample);
  const vertices = [{ x: first.x, z: first.z }];
  const stations = [0];
  for (const primitive of plan.primitives) {
    const steps = rasterStepCount(primitive);
    for (let step = 1; step <= steps; step += 1) {
      const s = primitive.sStart + ((primitive.sEnd - primitive.sStart) * step) / steps;
      const point = samplePlanPath(plan, s, sample);
      vertices.push({ x: point.x, z: point.z });
      stations.push(s);
    }
  }
  let raster: RasterPath;
  try {
    raster = compileRasterPath(vertices, stations);
  } catch (error) {
    if (error instanceof RangeError)
      throw new CourseInputError('invalid_raster_geometry', `${path}/primitives`, error.message);
    throw error;
  }
  return Object.freeze({ raster, primitives: plan.primitives, length: plan.length });
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
