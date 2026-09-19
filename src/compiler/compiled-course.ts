import { contentDigest } from '../core/content-digest.js';
import { compileGuidePath, type GuidePath } from '../core/guide-curve.js';
import {
  CourseInputError,
  courseFailure,
  courseFailures,
  courseSuccess,
  requireCourse,
  type CourseResult,
} from '../course/course-diagnostics.js';
import { readCourseDocument, type CourseDocument, type SectionDocument } from '../course/course-document.js';
import { COURSE_GEOMETRY_RECIPE, compileCourseGeometry, resolveCourseAnchor } from '../course/course-geometry.js';
import { compileCourseBandGeometry } from '../course/course-band-geometry.js';
import type { CompiledBoundary, CompiledBand, CompiledCarriageway } from '../course/course-bands.js';
import type { CompiledSection, CompiledPort, CompiledLink } from './course-graph.js';
import { COURSE_PHYSICAL_RECIPE, compileCoursePhysicalContent } from './course-physical-content.js';
import { COURSE_LINK_RECIPE, compileCoursePort, compileCourseLink, validateCourseTopology } from './course-links.js';
import {
  COURSE_IMAGE_SOURCE_RECIPE,
  compileCourseImageSources,
  type CourseAssetBytes,
  type CompiledCourseImageSource,
} from './course-image-source.js';
import { COURSE_PRESENTATION_RECIPE, compileCoursePresentation } from './course-presentation.js';
import type { CourseSceneryInstance } from '../visual/course-presentation.js';
import { compileCourseFork } from './course-fork.js';

interface SectionDraft extends Omit<CompiledSection, 'ports' | 'incoming' | 'outgoing' | 'fork'> {
  readonly ports: CompiledPort[];
  readonly incoming: CompiledLink[];
  readonly outgoing: CompiledLink[];
  fork: CompiledSection['fork'];
}

/** Upper-level immutable product. Consumers receive its ordinary reader/data facets, never this root. */
export interface CompiledCourse {
  readonly id: string;
  readonly type: CourseDocument['type'];
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

const COURSE_COMPILER = Object.freeze({
  id: 'superoutride.course-compiler',
  version: 14,
  links: COURSE_LINK_RECIPE,
  physical: COURSE_PHYSICAL_RECIPE,
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
  const { raster, primitives } = compileCourseGeometry(section, path);
  const primitiveTable = new Map(primitives.map((primitive) => [primitive.source.id, primitive]));
  const resolve = (anchor: Parameters<typeof resolveCourseAnchor>[0], at: string) =>
    resolveCourseAnchor(anchor, primitiveTable, raster.length, at);
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
  requireCourse(section.bands.length > 0, `${path}/bands`, 'A Section requires bands', 'invalid_band_domain');
  const bands = compileStage(section.bands, (source, index): CompiledBand => {
    const at = `${path}/bands/${index}`;
    const start = resolve(source.start, `${at}/start`);
    const end = resolve(source.end, `${at}/end`);
    requireCourse(end.s > start.s, at, 'Band interval must have positive length', 'invalid_band_domain');
    const left = reference(boundaryTable, source.leftBoundaryId, `${at}/leftBoundaryId`);
    const right = reference(boundaryTable, source.rightBoundaryId, `${at}/rightBoundaryId`);
    for (const [key, boundary] of [
      ['leftBoundaryId', left],
      ['rightBoundaryId', right],
    ] as const)
      requireCourse(
        boundary.knots[0]!.anchor.s <= start.s && boundary.knots.at(-1)!.anchor.s >= end.s,
        `${at}/${key}`,
        `Boundary ${JSON.stringify(boundary.id)} must cover Band's closed interval [${start.s}, ${end.s}]`,
        'invalid_boundary',
      );
    return Object.freeze({ id: source.id, start, end, left, right, role: source.role });
  });
  const bandTable = new Map(bands.map((band) => [band.id, band]));
  const assigned = new Set<CompiledBand>();
  const carriageways = compileStage(section.carriageways, (source, index): CompiledCarriageway => {
    const at = `${path}/carriageways/${index}`;
    requireCourse(
      source.bandIds.length > 0,
      `${at}/bandIds`,
      'Carriageway needs at least one pavement Band',
      'invalid_carriageway',
    );
    const members = compileStage(source.bandIds, (id, i) => {
      const band = reference(bandTable, id, `${at}/bandIds/${i}`);
      requireCourse(
        band.role === 'pavement',
        `${at}/bandIds/${i}`,
        'Carriageways group pavement Bands',
        'invalid_carriageway',
      );
      requireCourse(
        !assigned.has(band),
        `${at}/bandIds/${i}`,
        'Pavement Band must belong to exactly one Carriageway',
        'invalid_carriageway',
      );
      return band;
    });
    if (new Set(members).size !== members.length)
      throw new CourseInputError('invalid_carriageway', `${at}/bandIds`, 'Carriageway membership must be unique');
    members.forEach((band) => assigned.add(band));
    return Object.freeze({ id: source.id, bands: Object.freeze(members) });
  });
  requireCourse(
    assigned.size > 0 && bands.every((band) => band.role !== 'pavement' || assigned.has(band)),
    `${path}/carriageways`,
    'Every pavement Band needs one Carriageway',
    'invalid_carriageway',
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
      throw new CourseInputError('invalid_guide_geometry', `${path}/guide`, error.message);
    throw error;
  }
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
    guide,
    boundaries: Object.freeze(boundaries),
    bandPartition: partition,
    ...compileCoursePhysicalContent(section, raster.length, bands, resolve, path),
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
    ports: [],
    incoming: [],
    outgoing: [],
    fork: null,
  };
  const carriagewayTable = new Map(carriageways.map((road) => [road.id, road]));
  result.ports.push(
    ...compileStage(section.ports, (port, index) => {
      const at = `${path}/ports/${index}`;
      return compileCoursePort(
        port,
        result,
        resolve(port.anchor, `${at}/anchor`),
        reference(carriagewayTable, port.carriagewayId, `${at}/carriagewayId`),
        at,
      );
    }),
  );
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
      compileStage(document.sceneryInstances, (instance, index) =>
        Object.freeze({
          id: instance.id,
          asset: reference(assets, instance.assetId, `/sceneryInstances/${index}/assetId`),
        }),
      ),
    );
    const instances = new Map(sceneryInstances.map((instance) => [instance.id, instance]));
    const drafts = compileStage(document.sections, (section, index) =>
      compileSection(section, assets, instances, `/sections/${index}`),
    );
    const sections = drafts.map((draft) => draft.section);
    const sectionTable = new Map(sections.map((section) => [section.id, section]));
    const portTables = new Map(
      sections.map((section) => [section, new Map(section.ports.map((port) => [port.id, port]))]),
    );
    const entry = reference(sectionTable, document.entrySectionId, '/entrySectionId');
    const resolvePort = (endpoint: CourseDocument['links'][number]['source'], path: string) => {
      const section = reference(sectionTable, endpoint.sectionId, `${path}/sectionId`);
      return { section, port: reference(portTables.get(section)!, endpoint.portId, `${path}/portId`) };
    };
    const links = compileStage(document.links, (source, index) => {
      const path = `/links/${index}`;
      const from = resolvePort(source.source, `${path}/source`),
        to = resolvePort(source.destination, `${path}/destination`);
      const link = compileCourseLink(source.id, from.port, to.port, source.overlap, path);
      from.section.outgoing.push(link);
      to.section.incoming.push(link);
      return link;
    });
    validateCourseTopology(document.type, entry, sections, links);
    const forks = compileStage(drafts, (draft, index) =>
      compileCourseFork(draft.section, draft.fork, `/sections/${index}/fork`),
    );
    drafts.forEach((draft, index) => {
      draft.section.fork = forks[index]!;
    });
    // Close every cycle before freezing/publication. No draft or construction table escapes.
    for (const section of sections) {
      Object.freeze(section.ports);
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
