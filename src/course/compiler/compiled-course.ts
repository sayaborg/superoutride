import { createPlanCoordinateReader } from '../geometry/plan-coordinate-reader.js';
import { contentDigest } from '../../core/content-digest.js';
import {
  CourseInputError,
  courseFailure,
  courseFailures,
  courseSuccess,
  requireCourse,
  type CourseResult,
} from '../course-diagnostics.js';
import { readCourseDocument, type CourseDocument, type SectionDocument } from '../course-document.js';
import { COURSE_GEOMETRY_RECIPE, compileCourseGeometry, resolveCourseAnchor } from '../course-geometry.js';
import { compileCourseRegionGeometry } from '../course-region-geometry.js';
import type { CompiledBoundary, CompiledRegion, CompiledCarriageway } from '../course-regions.js';
import type { CompiledSection, CompiledLink } from './course-graph.js';
import { COURSE_PHYSICAL_RECIPE, compileCoursePhysicalContent } from './course-physical-content.js';
import {
  COURSE_LINK_RECIPE,
  compileCourseCut,
  entryCut,
  compileCourseLink,
  validateCourseTopology,
} from './course-links.js';
import {
  COURSE_IMAGE_SOURCE_RECIPE,
  compileCourseImageSources,
  type CourseAssetBytes,
  type CompiledCourseImageSource,
} from './course-image-source.js';
import { COURSE_PRESENTATION_RECIPE, compileCoursePresentation } from './course-presentation.js';
import type { CourseSceneryInstance } from '../course-presentation.js';
import { compileCourseRules } from './course-rules.js';
import { compileCourseFork } from './course-fork.js';

interface SectionDraft extends Omit<CompiledSection, 'incoming' | 'outgoing' | 'fork'> {
  readonly incoming: CompiledLink[];
  readonly outgoing: CompiledLink[];
  fork: CompiledSection['fork'];
}

/** Upper-level immutable product. Consumers receive its ordinary reader/data facets, never this root. */
export interface CompiledCourse {
  readonly id: string;
  readonly type: CourseDocument['type'];
  readonly reference: CourseDocument['reference'];
  readonly rules: ReturnType<typeof compileCourseRules>;
  readonly identity: {
    readonly sourceSha256: string;
    readonly buildSha256: string;
    readonly compiler: typeof COURSE_COMPILER;
    readonly geometryRecipe: typeof COURSE_GEOMETRY_RECIPE;
  };
  readonly sections: readonly CompiledSection[];
  readonly entry: CompiledSection;
  readonly links: readonly CompiledLink[];
  readonly assets: readonly CompiledCourseImageSource[];
  readonly sceneryInstances: readonly CourseSceneryInstance[];
}

// v21 is an already published content identity. Its historical descriptor stays stable while
// the unused runtime qualifier is removed, so identical courses keep their generated artifacts.
const COURSE_BUILD_IDENTITY_LINK_V21 = Object.freeze({
  id: COURSE_LINK_RECIPE.id,
  version: COURSE_LINK_RECIPE.version,
  edgeToleranceMeters: COURSE_LINK_RECIPE.edgeToleranceMeters,
  positionToleranceMeters: 1e-7,
  headingToleranceRadians: 1e-10,
  heightToleranceMeters: COURSE_LINK_RECIPE.heightToleranceMeters,
  gradeTolerance: COURSE_LINK_RECIPE.gradeTolerance,
});
const COURSE_BUILD_IDENTITY_PHYSICAL_V21 = Object.freeze({
  ...COURSE_PHYSICAL_RECIPE,
  overlap: Object.freeze({ id: 'superoutride.physical-overlap', version: 2 }),
});

const COURSE_COMPILER = Object.freeze({
  id: 'superoutride.course-compiler',
  version: 21,
  links: COURSE_BUILD_IDENTITY_LINK_V21,
  physical: COURSE_BUILD_IDENTITY_PHYSICAL_V21,
  images: COURSE_IMAGE_SOURCE_RECIPE,
  presentation: COURSE_PRESENTATION_RECIPE,
});

function reference<T>(table: ReadonlyMap<string, T>, id: string, path: string): T {
  const value = table.get(id);
  if (value === undefined)
    throw new CourseInputError('unresolved_reference', path, `Unknown reference ${JSON.stringify(id)} in this scope`);
  return value;
}

/** Expected failures in an independent construction phase; no incomplete values escape it. */
class CourseStageErrors extends Error {
  constructor(readonly errors: readonly CourseInputError[]) {
    super('Independent authoring inputs failed');
  }
}

function compileStage<T, U>(values: readonly T[], build: (value: T, index: number) => U): U[] {
  const result: U[] = [],
    errors: CourseInputError[] = [];
  values.forEach((value, index) => {
    try {
      result.push(build(value, index));
    } catch (error) {
      if (error instanceof CourseInputError) errors.push(error);
      else if (error instanceof CourseStageErrors) errors.push(...error.errors);
      else throw error;
    }
  });
  if (errors.length) throw new CourseStageErrors(Object.freeze(errors));
  return result;
}

function compileSection(
  section: SectionDocument,
  assets: ReadonlyMap<string, CompiledCourseImageSource>,
  instances: ReadonlyMap<string, CourseSceneryInstance>,
  path: string,
) {
  const { raster, primitives, length } = compileCourseGeometry(section, path);
  const primitiveTable = new Map(primitives.map((primitive) => [primitive.source.id, primitive]));
  const resolve = (anchor: Parameters<typeof resolveCourseAnchor>[0], at: string) =>
    resolveCourseAnchor(anchor, primitiveTable, length, at);
  const boundaries = compileStage(section.boundaries, (source, index): CompiledBoundary => {
    const at = `${path}/boundaries/${index}`;
    requireCourse(source.knots.length >= 2, `${at}/knots`, 'Boundary needs at least two knots', 'invalid_boundary');
    const knots = compileStage(source.knots, (knot, i) =>
      Object.freeze({ anchor: resolve(knot.anchor, `${at}/knots/${i}/anchor`), l: knot.l }),
    );
    for (let i = 1; i < knots.length; i += 1)
      requireCourse(
        knots[i]!.anchor.s > knots[i - 1]!.anchor.s,
        `${at}/knots/${i}`,
        'Resolved knots must be strictly increasing',
        'invalid_boundary',
      );
    return Object.freeze({ id: source.id, knots: Object.freeze(knots) });
  });
  const boundaryTable = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  requireCourse(section.regions.length > 0, `${path}/regions`, 'A Section requires regions', 'invalid_region_domain');
  const regions = compileStage(section.regions, (source, index): CompiledRegion => {
    const at = `${path}/regions/${index}`;
    const start = resolve(source.start, `${at}/start`);
    const end = resolve(source.end, `${at}/end`);
    requireCourse(end.s > start.s, at, 'Region interval must have positive length', 'invalid_region_domain');
    const left = reference(boundaryTable, source.leftBoundaryId, `${at}/leftBoundaryId`);
    const right = reference(boundaryTable, source.rightBoundaryId, `${at}/rightBoundaryId`);
    for (const [key, boundary] of [
      ['leftBoundaryId', left],
      ['rightBoundaryId', right],
    ] as const)
      requireCourse(
        boundary.knots[0]!.anchor.s <= start.s && boundary.knots.at(-1)!.anchor.s >= end.s,
        `${at}/${key}`,
        `Boundary ${JSON.stringify(boundary.id)} must cover Region's closed interval [${start.s}, ${end.s}]`,
        'invalid_boundary',
      );
    return Object.freeze({ id: source.id, start, end, left, right, role: source.role });
  });
  const regionTable = new Map(regions.map((region) => [region.id, region]));
  const assigned = new Set<CompiledRegion>();
  const carriageways = compileStage(section.carriageways, (source, index): CompiledCarriageway => {
    const at = `${path}/carriageways/${index}`;
    requireCourse(
      source.regionIds.length > 0,
      `${at}/regionIds`,
      'Carriageway needs at least one pavement Region',
      'invalid_carriageway',
    );
    const members = compileStage(source.regionIds, (id, i) => {
      const region = reference(regionTable, id, `${at}/regionIds/${i}`);
      requireCourse(
        region.role === 'pavement',
        `${at}/regionIds/${i}`,
        'Carriageways group pavement Regions',
        'invalid_carriageway',
      );
      requireCourse(
        !assigned.has(region),
        `${at}/regionIds/${i}`,
        'Pavement Region must belong to exactly one Carriageway',
        'invalid_carriageway',
      );
      return region;
    });
    if (new Set(members).size !== members.length)
      throw new CourseInputError('invalid_carriageway', `${at}/regionIds`, 'Carriageway membership must be unique');
    members.forEach((region) => assigned.add(region));
    return Object.freeze({ id: source.id, regions: Object.freeze(members) });
  });
  requireCourse(
    assigned.size > 0 && regions.every((region) => region.role !== 'pavement' || assigned.has(region)),
    `${path}/carriageways`,
    'Every pavement Region needs one Carriageway',
    'invalid_carriageway',
  );
  const { partition, lateralDomain } = compileCourseRegionGeometry(
    section.id,
    raster,
    primitives,
    regions,
    carriageways,
    path,
  );
  const sectionAssets = section.assetIds.map((id, i) => reference(assets, id, `${path}/assetIds/${i}`));
  requireCourse(
    new Set(sectionAssets).size === sectionAssets.length,
    `${path}/assetIds`,
    'Asset membership must be unique',
    'duplicate_membership',
  );
  const result: SectionDraft = {
    id: section.id,
    primitives,
    raster,
    coordinates: createPlanCoordinateReader(primitives, length, lateralDomain.lateralAt),
    boundaries: Object.freeze(boundaries),
    regionPartition: partition,
    ...compileCoursePhysicalContent(section, length, regions, resolve, path),
    carriageways: Object.freeze(carriageways),
    assets: Object.freeze(sectionAssets),
    presentation: compileCoursePresentation(
      section.presentation,
      partition,
      sectionAssets,
      instances,
      resolve,
      `${path}/presentation`,
      section.id,
      carriageways,
    ),
    incoming: [],
    outgoing: [],
    fork: null,
  };
  return {
    section: result,
    fork:
      section.fork === null
        ? null
        : Object.freeze({
            lock: resolve(section.fork.lock, `${path}/fork/lock`),
            closure: resolve(section.fork.closure, `${path}/fork/closure`),
          }),
  };
}

/** Own input before the first await; publish only a fully validated graph, never the construction tables. */
export async function compileCourseDocument(
  input: unknown,
  assetSources: readonly CourseAssetBytes[] = [],
): Promise<CourseResult<CompiledCourse>> {
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
    requireCourse(document.sections.length > 0, '/sections', 'A course requires a Section', 'empty_course');
    const images = await compileCourseImageSources(document.assets, assetSources);
    if (!images.ok) return images;
    const assets = new Map(images.value.map((asset) => [asset.id, asset]));
    const sceneryInstances = Object.freeze(
      compileStage(document.sceneryInstances, (instance, index) => {
        const path = `/sceneryInstances/${index}/assetId`;
        const asset = reference(assets, instance.assetId, path);
        if (asset.source.format !== 'superoutride.sprite-lod')
          throw new CourseInputError('invalid_image_role', path, 'Scenery requires a sprite image');
        const sprite = asset as typeof asset & {
          readonly source: Extract<typeof asset.source, { format: 'superoutride.sprite-lod' }>;
        };
        const palette = instance.paletteRgb555;
        requireCourse(
          palette === null ||
            [sprite.source.levels[0]!.paletteRgb555, ...sprite.source.variants].some((choice) =>
              choice.every((value, i) => i === 0 || value === palette[i]),
            ),
          path,
          'Instance palette must participate in the compiled LOD variant set',
          'appearance_binding',
        );
        return Object.freeze({ id: instance.id, asset: sprite, paletteRgb555: palette });
      }),
    );
    const instances = new Map(sceneryInstances.map((instance) => [instance.id, instance]));
    const drafts = compileStage(document.sections, (section, index) =>
      compileSection(section, assets, instances, `/sections/${index}`),
    );
    const sections = drafts.map((draft) => draft.section);
    const sectionTable = new Map(sections.map((section) => [section.id, section]));
    const entry = reference(sectionTable, document.entrySectionId, '/entrySectionId');
    // Every destination and the course entrance has one unambiguous entry cross-section.
    const entrances = new Map(
      sections
        .filter((s) => s === entry || document.links.some((l) => l.to.sectionId === s.id))
        .map((s) => [
          s,
          entryCut(s, `/sections/${document.sections.findIndex((item) => item.id === s.id)}/carriageways`),
        ]),
    );
    const links = compileStage(document.links, (source, index) => {
      const path = `/links/${index}`;
      const from = reference(sectionTable, source.from.sectionId, `${path}/from/sectionId`);
      const to = reference(sectionTable, source.to.sectionId, `${path}/to/sectionId`);
      const road = reference(
        new Map(from.carriageways.map((r) => [r.id, r])),
        source.from.carriagewayId,
        `${path}/from/carriagewayId`,
      );
      const cut = compileCourseCut(from, road, from.raster.length, `${path}/from`);
      const link = compileCourseLink(source.id, cut, entrances.get(to)!, path);
      from.outgoing.push(link);
      to.incoming.push(link);
      return link;
    });
    validateCourseTopology(document.type, entry, sections, links);
    const forks = compileStage(drafts, (draft, index) =>
      compileCourseFork(draft.section, draft.fork, `/sections/${index}/fork`),
    );
    drafts.forEach((draft, index) => {
      draft.section.fork = forks[index]!;
    });
    const rules = compileCourseRules(document, sections, entry);
    // Close every cycle before freezing/publication. No draft or construction table escapes.
    for (const section of sections) {
      Object.freeze(section.incoming);
      Object.freeze(section.outgoing);
      Object.freeze(section);
    }
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
        reference: document.reference,
        rules,
        identity: Object.freeze({
          sourceSha256,
          buildSha256,
          compiler: COURSE_COMPILER,
          geometryRecipe: COURSE_GEOMETRY_RECIPE,
        }),
        sections: Object.freeze(sections),
        entry,
        links: Object.freeze(links),
        assets: images.value,
        sceneryInstances: Object.freeze([
          ...new Set([
            ...sceneryInstances,
            ...sections.flatMap(
              (section) => section.presentation?.scenery.map((placement) => placement.instance) ?? [],
            ),
          ]),
        ]),
      }),
    );
  } catch (error) {
    if (error instanceof CourseStageErrors) return courseFailures(error.errors);
    if (error instanceof CourseInputError) return courseFailure(error);
    throw error;
  }
}
