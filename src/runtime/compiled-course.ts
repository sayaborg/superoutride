import { contentDigest } from '../core/content-digest.js';
import { compileGuidePath, type GuidePath } from '../core/guide-curve.js';
import type { RasterPath } from '../core/raster-path.js';
import { CourseInputError, courseFailure, courseSuccess, type CourseResult } from '../course/course-diagnostics.js';
import { readCourseDocument, type CourseAssetReference, type SectionDocument } from '../course/course-document.js';
import {
  COURSE_GEOMETRY_RECIPE,
  compileCourseGeometry,
  resolveCourseAnchor,
  type CompiledPlanPrimitive,
} from '../course/course-geometry.js';
import { compileCourseBandGeometry } from '../course/course-band-geometry.js';
import type {
  CompiledBoundary,
  CompiledBand,
  CompiledBandPartition,
  CompiledCarriageway,
} from '../course/course-bands.js';

interface CompiledSection {
  readonly id: string;
  readonly primitives: readonly CompiledPlanPrimitive[];
  readonly raster: RasterPath;
  readonly guide: GuidePath;
  readonly boundaries: readonly CompiledBoundary[];
  readonly bandPartition: CompiledBandPartition;
  readonly carriageways: readonly CompiledCarriageway[];
  readonly assets: readonly CourseAssetReference[];
}

/** Upper-level immutable product. Consumers receive its ordinary reader/data facets, never this root. */
export interface CompiledCourse {
  readonly id: string;
  readonly type: 'LINEAR';
  readonly identity: {
    readonly sourceSha256: string;
    readonly buildSha256: string;
    readonly compiler: typeof COURSE_COMPILER;
    readonly geometryRecipe: typeof COURSE_GEOMETRY_RECIPE;
  };
  readonly sections: readonly CompiledSection[];
  readonly assets: readonly CourseAssetReference[];
}

const COURSE_COMPILER = Object.freeze({ id: 'superoutride.course-compiler', version: 3 });

function reference<T>(table: ReadonlyMap<string, T>, id: string, path: string): T {
  const value = table.get(id);
  if (value === undefined)
    throw new CourseInputError('unresolved_reference', path, `Unknown reference ${JSON.stringify(id)} in this scope`);
  return value;
}

function semantic(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new CourseInputError('semantic_compile_failure', path, message);
}

function compileSection(
  section: SectionDocument,
  assets: ReadonlyMap<string, CourseAssetReference>,
  path: string,
): CompiledSection {
  const { raster, primitives } = compileCourseGeometry(section, path);
  const primitiveTable = new Map(primitives.map((primitive) => [primitive.source.id, primitive]));
  const resolve = (anchor: Parameters<typeof resolveCourseAnchor>[0], at: string) =>
    resolveCourseAnchor(anchor, primitiveTable, raster.length, at);
  const boundaries = section.boundaries.map((source, index): CompiledBoundary => {
    const at = `${path}/boundaries/${index}`;
    semantic(source.knots.length >= 2, `${at}/knots`, 'Boundary needs at least two knots');
    const knots = source.knots.map((knot, i) =>
      Object.freeze({ anchor: resolve(knot.anchor, `${at}/knots/${i}/anchor`), l: knot.l }),
    );
    for (let i = 1; i < knots.length; i += 1)
      semantic(
        knots[i]!.anchor.s > knots[i - 1]!.anchor.s,
        `${at}/knots/${i}`,
        'Resolved knots must be strictly increasing',
      );
    return Object.freeze({ id: source.id, knots: Object.freeze(knots) });
  });
  const boundaryTable = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  semantic(section.bands.length > 0, `${path}/bands`, 'A Section requires bands');
  const bands = section.bands.map((source, index): CompiledBand => {
    const at = `${path}/bands/${index}`;
    const start = resolve(source.start, `${at}/start`);
    const end = resolve(source.end, `${at}/end`);
    semantic(end.s > start.s, at, 'Band interval must have positive length');
    const left = reference(boundaryTable, source.leftBoundaryId, `${at}/leftBoundaryId`);
    const right = reference(boundaryTable, source.rightBoundaryId, `${at}/rightBoundaryId`);
    for (const [key, boundary] of [
      ['leftBoundaryId', left],
      ['rightBoundaryId', right],
    ] as const)
      semantic(
        boundary.knots[0]!.anchor.s <= start.s && boundary.knots.at(-1)!.anchor.s >= end.s,
        `${at}/${key}`,
        `Boundary ${JSON.stringify(boundary.id)} must cover Band's closed interval [${start.s}, ${end.s}]`,
      );
    return Object.freeze({ id: source.id, start, end, left, right, role: source.role });
  });
  const bandTable = new Map(bands.map((band) => [band.id, band]));
  const assigned = new Set<CompiledBand>();
  const carriageways = section.carriageways.map((source, index): CompiledCarriageway => {
    const at = `${path}/carriageways/${index}`;
    semantic(source.bandIds.length > 0, `${at}/bandIds`, 'Carriageway needs at least one pavement Band');
    const members = source.bandIds.map((id, i) => {
      const band = reference(bandTable, id, `${at}/bandIds/${i}`);
      semantic(band.role === 'pavement', `${at}/bandIds/${i}`, 'Carriageways group pavement Bands');
      semantic(!assigned.has(band), `${at}/bandIds/${i}`, 'Pavement Band must belong to exactly one Carriageway');
      assigned.add(band);
      return band;
    });
    return Object.freeze({ id: source.id, bands: Object.freeze(members) });
  });
  semantic(
    assigned.size > 0 && bands.every((band) => band.role !== 'pavement' || assigned.has(band)),
    `${path}/carriageways`,
    'Every pavement Band needs one Carriageway',
  );
  const { partition, envelope } = compileCourseBandGeometry(raster, bands, carriageways, section.guide.margin, path);
  let guide: GuidePath;
  try {
    guide = compileGuidePath(raster, {
      envelope,
      mMin: section.guide.mMin,
    });
  } catch (error) {
    if (error instanceof RangeError)
      throw new CourseInputError('semantic_compile_failure', `${path}/guide`, error.message);
    throw error;
  }
  const sectionAssets = section.assetIds.map((id, i) => reference(assets, id, `${path}/assetIds/${i}`));
  semantic(new Set(sectionAssets).size === sectionAssets.length, `${path}/assetIds`, 'Asset membership must be unique');
  return Object.freeze({
    id: section.id,
    primitives,
    raster,
    guide,
    boundaries: Object.freeze(boundaries),
    bandPartition: partition,
    carriageways: Object.freeze(carriageways),
    assets: Object.freeze(sectionAssets),
  });
}

/** Own input before the first await; publish only a fully validated graph, never the construction tables. */
export async function compileCourseDocument(input: unknown): Promise<CourseResult<CompiledCourse>> {
  const admitted = readCourseDocument(input);
  if (!admitted.ok) return admitted;
  const document = admitted.value;
  try {
    if (
      document.geometryRecipe.id !== COURSE_GEOMETRY_RECIPE.id ||
      document.geometryRecipe.version !== COURSE_GEOMETRY_RECIPE.version
    ) {
      throw new CourseInputError(
        'unsupported_version',
        '/geometryRecipe',
        `Supported geometry recipe is ${COURSE_GEOMETRY_RECIPE.id} v${COURSE_GEOMETRY_RECIPE.version}`,
      );
    }
    if (document.sections.length !== 1)
      throw new CourseInputError(
        'unsupported_feature',
        '/sections',
        'The current compiler accepts exactly one LINEAR Section; Links are not implemented',
      );
    const assets = new Map(document.assets.map((asset) => [asset.id, asset]));
    const sections = Object.freeze(
      document.sections.map((section, index) => compileSection(section, assets, `/sections/${index}`)),
    );
    const sourceSha256 = await contentDigest(new TextEncoder().encode(JSON.stringify(document)));
    const buildSha256 = await contentDigest(
      new TextEncoder().encode(
        JSON.stringify({ sourceSha256, compiler: COURSE_COMPILER, geometryRecipe: COURSE_GEOMETRY_RECIPE }),
      ),
    );
    return courseSuccess(
      Object.freeze({
        id: document.id,
        type: document.type,
        identity: Object.freeze({
          sourceSha256,
          buildSha256,
          compiler: COURSE_COMPILER,
          geometryRecipe: COURSE_GEOMETRY_RECIPE,
        }),
        sections,
        assets: document.assets,
      }),
    );
  } catch (error) {
    if (error instanceof CourseInputError) return courseFailure(error);
    throw error;
  }
}
