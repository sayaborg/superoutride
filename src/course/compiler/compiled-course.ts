import { compileCourseStrips } from './course-strip-ground.js';
import { validateCourseCarriageways } from './course-carriageways.js';
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
import { compileCourseGeometry, resolveCoursePosition } from '../course-geometry.js';
import { validateMaterialContinuity, compileMaterialCoordinateDomain } from '../course-coordinate-domain.js';
import type { CompiledCarriageway } from '../course-boundaries.js';
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
import { COURSE_APPEARANCE_RECIPE, compileCourseAppearance, createCourseSpriteResources } from './course-appearance.js';
import { compileCourseBoundaries } from './course-lateral.js';
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
  readonly rules: ReturnType<typeof compileCourseRules>;
  readonly identity: {
    readonly sourceSha256: string;
    readonly buildSha256: string;
    readonly compiler: typeof COURSE_COMPILER;
  };
  readonly sections: readonly CompiledSection[];
  readonly entry: CompiledSection;
  readonly links: readonly CompiledLink[];
  readonly assets: readonly CompiledCourseImageSource[];
}

const COURSE_COMPILER = Object.freeze({
  id: 'superoutride.course-compiler',
  version: 32,
  links: COURSE_LINK_RECIPE,
  physical: COURSE_PHYSICAL_RECIPE,
  images: COURSE_IMAGE_SOURCE_RECIPE,
  appearance: COURSE_APPEARANCE_RECIPE,
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
  resources: ReturnType<typeof createCourseSpriteResources>,
  path: string,
) {
  const { segments, length, stations } = compileCourseGeometry(section, path);
  const resolve = (position: Parameters<typeof resolveCoursePosition>[0], at: string) =>
    resolveCoursePosition(position, stations, length, at);
  const boundaries = compileCourseBoundaries(section.boundaries, resolve, `${path}/boundaries`);
  const boundaryTable = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  const carriageways = compileStage(section.carriageways, (source, index): CompiledCarriageway => {
    const at = `${path}/carriageways/${index}`;
    return Object.freeze({
      id: source.id,
      left: reference(boundaryTable, source.left, `${at}/left`),
      right: reference(boundaryTable, source.right, `${at}/right`),
    });
  });
  const strips = compileCourseStrips(section.strips, length, `${path}/strips`, resolve, boundaryTable);
  validateMaterialContinuity(strips.material, `${path}/strips`);
  validateCourseCarriageways(carriageways, strips.material, length, `${path}/carriageways`);
  const physical = compileCoursePhysicalContent(section, length, resolve, path);
  const lateralDomain = compileMaterialCoordinateDomain(section.id, segments, strips.material, path);
  const sectionAssets = section.assetIds.map((id, i) => reference(assets, id, `${path}/assetIds/${i}`));
  requireCourse(
    new Set(sectionAssets).size === sectionAssets.length,
    `${path}/assetIds`,
    'Asset membership must be unique',
    'duplicate_membership',
  );
  const result: SectionDraft = {
    id: section.id,
    segments,
    coordinates: createPlanCoordinateReader(segments, length, lateralDomain.lateralAt),
    boundaries: Object.freeze(boundaries),
    ...physical,
    ...strips,
    carriageways: Object.freeze(carriageways),
    assets: Object.freeze(sectionAssets),
    appearance: compileCourseAppearance(
      section,
      length,
      boundaryTable,
      sectionAssets,
      resources,
      resolve,
      path,
      carriageways,
    ),
    incoming: [],
    outgoing: [],
    fork: null,
  };
  return {
    section: result,
    stations,
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
    requireCourse(document.sections.length > 0, '/sections', 'A course requires a Section', 'empty_course');
    const images = await compileCourseImageSources(document.assets, assetSources);
    if (!images.ok) return images;
    const assets = new Map(images.value.map((asset) => [asset.id, asset]));
    const resources = createCourseSpriteResources();
    const drafts = compileStage(document.sections, (section, index) =>
      compileSection(section, assets, resources, `/sections/${index}`),
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
      const cut = compileCourseCut(from, road, from.coordinates.domain.end, `${path}/from`);
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
    const rules = compileCourseRules(
      document,
      sections,
      entry,
      new Map(drafts.map((draft) => [draft.section, draft.stations])),
    );
    // Close every cycle before freezing/publication. No draft or construction table escapes.
    for (const section of sections) {
      Object.freeze(section.incoming);
      Object.freeze(section.outgoing);
      Object.freeze(section);
    }
    const sourceSha256 = await contentDigest(new TextEncoder().encode(JSON.stringify(document)));
    const buildSha256 = await contentDigest(
      new TextEncoder().encode(JSON.stringify({ sourceSha256, compiler: COURSE_COMPILER })),
    );
    return courseSuccess(
      Object.freeze({
        id: document.id,
        type: document.type,
        rules,
        identity: Object.freeze({
          sourceSha256,
          buildSha256,
          compiler: COURSE_COMPILER,
        }),
        sections: Object.freeze(sections),
        entry,
        links: Object.freeze(links),
        assets: images.value,
      }),
    );
  } catch (error) {
    if (error instanceof CourseStageErrors) return courseFailures(error.errors);
    if (error instanceof CourseInputError) return courseFailure(error);
    throw error;
  }
}
