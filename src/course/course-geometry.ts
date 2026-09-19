import { compileRasterPath, type RasterPath } from '../core/raster-path.js';
import { CourseInputError } from './course-diagnostics.js';
import {
  COURSE_DOCUMENT_LIMITS,
  type CourseAnchor,
  type PlanPrimitive,
  type SectionDocument,
} from './course-document.js';
import { RASTER_TURTLE_RECIPE, RasterTurtle } from './raster-turtle.js';

export const COURSE_GEOMETRY_RECIPE = Object.freeze({
  id: 'superoutride.raster-guide',
  version: 1,
  turtle: RASTER_TURTLE_RECIPE,
  authoredAngles: 'degrees; heading*(PI/180); appendArcDegrees',
  ruler: 'RasterPath.vertexS; sequential Math.hypot of emitted endpoint differences',
  anchors: 'absolute-s-or-primitive-start+fraction*(end-start); exact-fraction-endpoints',
  guide: 'existing circular provenance fillets; scalar max-abs-boundary+authored-margin',
});

export interface CompiledPlanPrimitive {
  readonly source: PlanPrimitive;
  readonly sStart: number;
  readonly sEnd: number;
}

export type CompiledCourseAnchor =
  | { readonly kind: 'absolute'; readonly s: number }
  | {
      readonly kind: 'primitive';
      readonly s: number;
      readonly primitive: CompiledPlanPrimitive;
      readonly fraction: number;
    };

/** RangeError is a known Core authoring-domain rejection; invariant/Error and platform failures propagate. */
export function compileCourseGeometry(
  section: SectionDocument,
  path: string,
): {
  readonly raster: RasterPath;
  readonly primitives: readonly CompiledPlanPrimitive[];
} {
  if (section.primitives.length === 0)
    throw new CourseInputError(
      'semantic_compile_failure',
      `${path}/primitives`,
      'A Section requires at least one plan primitive',
    );
  let segmentCount = 0;
  for (const primitive of section.primitives) {
    segmentCount +=
      primitive.kind === 'straight'
        ? Math.ceil(primitive.length / RASTER_TURTLE_RECIPE.straightStepMeters)
        : Math.ceil(Math.abs(primitive.turn) / RASTER_TURTLE_RECIPE.arcStepDegrees);
  }
  if (segmentCount > COURSE_DOCUMENT_LIMITS.rasterSegments)
    throw new CourseInputError('resource_limit', `${path}/primitives`, 'Section exceeds 2048 Raster segments');
  const turtle = new RasterTurtle({ x: section.start.x, z: section.start.z }, section.start.heading * (Math.PI / 180));
  const intervals = section.primitives.map((primitive) => {
    const start = turtle.vertices.length - 1;
    if (primitive.kind === 'straight') turtle.appendStraight(primitive.length);
    else turtle.appendArcDegrees(primitive.radius, primitive.turn);
    return { start, end: turtle.vertices.length - 1 };
  });
  let raster: RasterPath;
  try {
    raster = compileRasterPath(turtle.vertices);
  } catch (error) {
    if (error instanceof RangeError)
      throw new CourseInputError('semantic_compile_failure', `${path}/primitives`, error.message);
    throw error;
  }
  if (raster.length > COURSE_DOCUMENT_LIMITS.lengthMeters)
    throw new CourseInputError('resource_limit', `${path}/primitives`, 'Compiled ruler exceeds 100000 m');
  return Object.freeze({
    raster,
    primitives: Object.freeze(
      section.primitives.map((source, index) => {
        const interval = intervals[index]!;
        return Object.freeze({ source, sStart: raster.vertexS[interval.start]!, sEnd: raster.vertexS[interval.end]! });
      }),
    ),
  });
}

export function resolveCourseAnchor(
  anchor: CourseAnchor,
  primitives: ReadonlyMap<string, CompiledPlanPrimitive>,
  length: number,
  path: string,
): CompiledCourseAnchor {
  if (anchor.kind === 'absolute') {
    if (anchor.s > length)
      throw new CourseInputError(
        'semantic_compile_failure',
        `${path}/s`,
        `Anchor ${anchor.s} is outside [0, ${length}]`,
      );
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
