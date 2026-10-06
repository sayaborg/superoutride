import { createStripBudget } from '../strip-budget.js';
import { compileCourseStrips } from './course-strip-ground.js';
import { validateCourseCarriageways } from './course-carriageways.js';
import { compileCourseLanes, validateCourseLanes } from './course-lanes.js';
import type { CourseLines } from '../course-lanes.js';
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
import { courseImageNames, type CourseDocument, type CourseRules, type SectionDocument } from '../course-document.js';
import { compileCourseGeometry, resolveCoursePosition } from '../course-geometry.js';
import { compileMaterialCoordinateDomain } from '../course-coordinate-domain.js';
import { validateMaterialContinuity } from '../strip-material.js';
import type { CompiledCarriageway } from '../course-boundaries.js';
import type { CompiledSection, CompiledLink } from './course-graph.js';
import { COURSE_PHYSICAL_RECIPE, compileCoursePhysicalContent } from './course-physical-content.js';
import {
  COURSE_LINK_RECIPE,
  compileCourseCut,
  entryCut,
  compileCourseLink,
  compileCourseTopology,
} from './course-links.js';
import {
  COURSE_IMAGE_SOURCE_RECIPE,
  compileCourseImageSources,
  type CourseImageBytes,
  type CompiledCourseImageSource,
} from './course-image-source.js';
import { COURSE_APPEARANCE_RECIPE, compileCourseAppearance, createCourseSpriteResources } from './course-appearance.js';
import { compileCourseBoundaries } from './course-lateral.js';
import { compileCourseBarriers, compileCourseWalls, compileWallEnds } from './course-walls.js';
import { compileCourseSpriteObjects, compileCourseSpritePlacements } from './course-objects.js';
import { compileCourseGates } from './course-rules.js';
import { compileCourseFork } from './course-fork.js';
import { enumerateCourseRoutes } from './course-routes.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import type { SurfaceMaterialCatalog } from '../surface-material.js';

interface SectionDraft extends Omit<CompiledSection, 'incoming' | 'outgoing' | 'fork' | 'appearance' | 'assets'> {
  readonly incoming: CompiledLink[];
  readonly outgoing: CompiledLink[];
  fork: CompiledSection['fork'];
  appearance: CompiledSection['appearance'];
  assets: CompiledSection['assets'];
}

/** Upper-level immutable product. Consumers receive its ordinary reader/data facets, never this root. */
export interface CompiledCourse {
  readonly id: string;
  /** The display name. */
  readonly name: string;
  readonly type: ReturnType<typeof compileCourseTopology>;
  readonly rules: CourseRules;
  readonly gates: ReturnType<typeof compileCourseGates>;
  readonly identity: {
    readonly sourceSha256: string;
    readonly materialsSha256: string;
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
  version: 46,
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
  materials: SurfaceMaterialCatalog,
  path: string,
) {
  const { segments, length, joints } = compileCourseGeometry(section, path);
  const resolve = (position: Parameters<typeof resolveCoursePosition>[0], at: string) =>
    resolveCoursePosition(position, joints, at);
  const lanes = compileCourseLanes(section, resolve, length, `${path}/lanes`);
  const boundaries = compileCourseBoundaries(section.boundaries, lanes, resolve, `${path}/boundaries`);
  const boundaryTable = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  const lines: CourseLines = Object.freeze({ boundaries: boundaryTable, lanes });
  const carriageways = compileStage(section.carriageways, (source, index): CompiledCarriageway => {
    const at = `${path}/carriageways/${index}`;
    return Object.freeze({
      id: source.id,
      left: reference(boundaryTable, source.left, `${at}/left`),
      right: reference(boundaryTable, source.right, `${at}/right`),
      lanes: source.lanes,
    });
  });
  // The road's and the walls' Strips spend from one Section budget.
  const stripBudget = createStripBudget();
  const strips = compileCourseStrips(section.strips, length, `${path}/strips`, resolve, lines, materials, stripBudget);
  validateMaterialContinuity(strips.material, `${path}/strips`);
  validateCourseCarriageways(carriageways, strips.material, length, `${path}/carriageways`);
  validateCourseLanes(lanes, strips.material, length, `${path}/lanes`);
  const walls = compileCourseWalls(section.walls, lines, resolve, materials, stripBudget, `${path}/walls`);
  const barriers = compileCourseBarriers(walls, section.openLimits, resolve, strips.material, length, path);
  const physical = compileCoursePhysicalContent(section, length, resolve, path);
  // The Section's sprites expanded once: the placements, and their identities, objects and appearance share.
  const placements = compileCourseSpritePlacements(section, length, lines, assets, resolve, path);
  const objects = Object.freeze(
    [
      ...compileCourseSpriteObjects(placements, physical.height),
      ...compileWallEnds(walls, barriers, `${path}/walls`),
    ].sort((a, b) => a.s - b.s),
  );
  const lateralDomain = compileMaterialCoordinateDomain(section.id, segments, strips.material, path);
  const result: SectionDraft = {
    id: section.id,
    segments,
    coordinates: createPlanCoordinateReader(segments, length, lateralDomain.lateralAt),
    boundaries: Object.freeze(boundaries),
    lanes,
    ...physical,
    ...strips,
    barriers,
    objects,
    carriageways: Object.freeze(carriageways),
    assets: Object.freeze([]),
    // Set by `compileAppearance`, after the fork structure and before anything reads it.
    appearance: null as unknown as SectionDraft['appearance'],
    incoming: [],
    outgoing: [],
    fork: null,
  };
  /** Appearance compiles after the fork structure, which it reads to check its own signs. */
  const compileAppearance = () => {
    const appearance = compileCourseAppearance(
      section,
      length,
      assets,
      resources,
      resolve,
      path,
      result.fork,
      walls,
      placements,
    );
    // A Section's images are exactly those its backgrounds and sprites reference, in course asset order.
    const used = new Set<object>([
      ...appearance.environments.map((environment) => environment.background.asset),
      ...appearance.sprites.map((sprite) => sprite.instance.asset),
    ]);
    result.appearance = appearance;
    result.assets = Object.freeze([...assets.values()].filter((asset) => used.has(asset)));
  };
  return {
    section: result,
    joints,
    compileAppearance,
    controls: section.gates.flatMap((gate, index) =>
      gate.kind === 'lock' || gate.kind === 'closure'
        ? [
            {
              kind: gate.kind,
              path: `${path}/gates/${index}`,
              at: resolve(gate.at, `${path}/gates/${index}/at`),
            },
          ]
        : [],
    ),
  };
}

/**
 * Compile an admitted course document. `readCourseDocument` is the only admission; its deeply frozen
 * value cannot change across awaits. Publish only a fully validated graph, never the construction tables.
 * The catalog supplies the course's identifier (its file name stem and manifest ID) and the SHA-256
 * of its delivered document.
 */
export async function compileCourseDocument(
  document: CourseDocument,
  id: string,
  sha256: string,
  assetSources: readonly CourseImageBytes[],
  materials: SurfaceMaterialCatalog,
  documentPath = '',
): Promise<CourseResult<CompiledCourse>> {
  try {
    requireCourse(document.sections.length > 0, '/sections', 'A course requires a Section', 'empty_course');
    const images = await compileCourseImageSources(courseImageNames(document), assetSources);
    if (!images.ok) return images;
    const assets = new Map(images.value.map((asset) => [asset.id, asset]));
    const resources = createCourseSpriteResources();
    const drafts = compileStage(document.sections, (section, index) =>
      compileSection(section, assets, resources, materials, `/sections/${index}`),
    );
    const sections = drafts.map((draft) => draft.section);
    const sectionTable = new Map(sections.map((section) => [section.id, section]));
    const entry = reference(sectionTable, document.entry, '/entry');
    // Every destination and the course entrance has one unambiguous entry cross-section.
    const entrances = new Map(
      sections
        .filter((s) => s === entry || document.links.some((l) => l.to === s.id))
        .map((s) => [
          s,
          entryCut(
            s,
            document.links.some((l) => l.to === s.id),
            `/sections/${document.sections.findIndex((item) => item.id === s.id)}/lanes`,
          ),
        ]),
    );
    const links = compileStage(document.links, (source, index) => {
      const path = `/links/${index}`;
      const from = reference(sectionTable, source.from.section, `${path}/from/section`);
      const to = reference(sectionTable, source.to, `${path}/to`);
      const lane = reference(from.lanes.byId, source.from.lane, `${path}/from/lane`);
      const cut = compileCourseCut(from, lane, from.coordinates.domain.end, `${path}/from`);
      const link = compileCourseLink(source.id, cut, entrances.get(to)!, path);
      from.outgoing.push(link);
      to.incoming.push(link);
      return link;
    });
    const type = compileCourseTopology(entry, sections);
    const routes = enumerateCourseRoutes(entry, type);
    if (routes.length > COURSE_DOCUMENT_LIMITS.routes) {
      // The first route over the limit leaves the last admitted one at a fork Section.
      const over = routes.at(-1)!,
        last = routes.at(-2)!;
      const fork = over.find((link, index) => link !== last[index])!.from.section;
      requireCourse(
        false,
        `/sections/${sections.findIndex((section) => section === fork)}`,
        `A course allows at most ${COURSE_DOCUMENT_LIMITS.routes} routes`,
        'resource_limit',
      );
    }
    const forks = compileStage(drafts, (draft, index) =>
      compileCourseFork(draft.section, draft.controls, `/sections/${index}`),
    );
    drafts.forEach((draft, index) => {
      draft.section.fork = forks[index]!;
    });
    compileStage(drafts, (draft) => draft.compileAppearance());
    const gates = compileCourseGates(
      document,
      type,
      sections,
      entry,
      new Map(drafts.map((draft) => [draft.section, draft.joints])),
    );
    // Close every cycle before freezing/publication. No draft or construction table escapes.
    for (const section of sections) {
      Object.freeze(section.incoming);
      Object.freeze(section.outgoing);
      Object.freeze(section);
    }
    const sourceSha256 = sha256,
      materialsSha256 = materials.sha256;
    const buildSha256 = await contentDigest(
      new TextEncoder().encode(JSON.stringify({ sourceSha256, materialsSha256, compiler: COURSE_COMPILER })),
    );
    return courseSuccess(
      Object.freeze({
        id,
        name: document.name,
        type,
        rules: Object.freeze({ maxLaps: document.maxLaps }),
        gates,
        identity: Object.freeze({
          sourceSha256,
          materialsSha256,
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
    if (error instanceof CourseStageErrors) return courseFailures(error.errors, documentPath);
    if (error instanceof CourseInputError) return courseFailure(error, documentPath);
    throw error;
  }
}
