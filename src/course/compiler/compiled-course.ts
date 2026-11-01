import { compileCourseGround } from '../course-ground.js';
import { createStripBudget } from '../strip-budget.js';
import { compileCourseStrips } from './course-strip-ground.js';
import { compileCourseLanes, validateCourseLanes } from './course-lanes.js';
import { courseLane, type CourseLines } from '../course-lanes.js';
import { createPlanCoordinateReader } from '../geometry/plan-coordinate-reader.js';
import { contentDigest } from '../../core/content-digest.js';
import { UNSLICED, type WorkSlices } from '../../core/work-slices.js';
import {
  CourseInputError,
  courseFailure,
  courseFailures,
  courseSuccess,
  requireCourse,
  type CourseResult,
} from '../course-diagnostics.js';
import {
  courseImageNames,
  courseSolidImageNames,
  type CourseDocument,
  type CourseRules,
  type SectionDocument,
} from '../course-document.js';
import { compileCourseGeometry, resolveCoursePosition } from '../course-geometry.js';
import { compileMaterialCoordinateDomain } from '../course-coordinate-domain.js';
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
import type { CurvatureBounds } from '../geometry/profile-bound.js';

/** A Section compiled but not yet closed: its links, fork and appearance come when every Section is compiled. */
interface OpenSection extends Omit<CompiledSection, 'incoming' | 'outgoing' | 'fork' | 'appearance'> {
  readonly incoming: CompiledLink[];
  readonly outgoing: CompiledLink[];
  fork: CompiledSection['fork'];
  appearance: CompiledSection['appearance'];
}

/** Upper-level immutable product. Consumers receive its ordinary reader/data facets, never this root. */
export interface CompiledCourse {
  readonly id: string;
  /** The display name. */
  readonly name: string;
  readonly type: ReturnType<typeof compileCourseTopology>;
  readonly rules: CourseRules;
  /** The entry Section's road direction at its origin, degrees clockwise from north: the course map's north. */
  readonly bearing: number;
  readonly gates: ReturnType<typeof compileCourseGates>;
  readonly identity: {
    readonly sourceSha256: string;
    readonly materialsSha256: string;
    /** The master width and height, in texels, of each solid sprite's image by name. */
    readonly solidImages: Readonly<Record<string, Readonly<{ width: number; height: number }>>>;
    readonly buildSha256: string;
    readonly compiler: typeof COURSE_COMPILER;
  };
  readonly sections: readonly CompiledSection[];
  readonly entry: CompiledSection;
  readonly links: readonly CompiledLink[];
}

const COURSE_COMPILER = Object.freeze({
  id: 'superoutride.course-compiler',
  version: 52,
  links: COURSE_LINK_RECIPE,
  physical: COURSE_PHYSICAL_RECIPE,
  images: COURSE_IMAGE_SOURCE_RECIPE,
  appearance: COURSE_APPEARANCE_RECIPE,
});

function reference<T>(lookup: (id: string) => T | undefined, id: string, path: string): T {
  const value = lookup(id);
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

/**
 * How a compilation runs: the work slices it pauses in (none: it runs through), and what hears its progress, the share of
 * the course's Sections compiled.
 */
export interface CourseCompileWork {
  readonly slices?: WorkSlices;
  readonly compiled?: (fraction: number) => void;
}

/** The stage's values built in order, pausing between them when `slices` is due. */
async function compileStage<T, U>(
  values: readonly T[],
  slices: WorkSlices,
  build: (value: T, index: number) => U | Promise<U>,
): Promise<U[]> {
  const result: U[] = [],
    errors: CourseInputError[] = [];
  for (const [index, value] of values.entries()) {
    if (slices.due()) await slices.pause();
    try {
      result.push(await build(value, index));
    } catch (error) {
      if (error instanceof CourseInputError) errors.push(error);
      else if (error instanceof CourseStageErrors) errors.push(...error.errors);
      else throw error;
    }
  }
  if (errors.length) throw new CourseStageErrors(Object.freeze(errors));
  return result;
}

async function compileSection(
  section: SectionDocument,
  assets: ReadonlyMap<string, CompiledCourseImageSource>,
  resources: ReturnType<typeof createCourseSpriteResources>,
  materials: SurfaceMaterialCatalog,
  path: string,
  slices: WorkSlices,
  bounds: CurvatureBounds | null,
) {
  const { segments, length, joints } = compileCourseGeometry(section, path);
  const resolve = (position: Parameters<typeof resolveCoursePosition>[0], at: string) =>
    resolveCoursePosition(position, joints, at);
  const lanes = compileCourseLanes(section, resolve, length, `${path}/lanes`);
  const boundaries = compileCourseBoundaries(section.boundaries, lanes, resolve, `${path}/boundaries`);
  const boundaryTable = new Map(boundaries.map((boundary) => [boundary.id, boundary]));
  const lines: CourseLines = Object.freeze({ boundaries: boundaryTable, lanes });
  // The road's and the walls' Strips spend from one Section budget.
  const stripBudget = createStripBudget();
  const { pairs, ...strips } = await compileCourseStrips(
    section.strips,
    { segments, length },
    `${path}/strips`,
    resolve,
    lines,
    materials,
    stripBudget,
    slices,
  );
  validateCourseLanes(lanes, strips.material, length, `${path}/lanes`);
  const walls = await compileCourseWalls(
    section.walls,
    lines,
    resolve,
    materials,
    stripBudget,
    `${path}/walls`,
    slices,
  );
  const barriers = compileCourseBarriers(walls, section.openLimits, resolve, strips.material, length, path);
  const physical = compileCoursePhysicalContent(section, length, resolve, path, bounds);
  // The Section's sprites expanded once: the placements, and their identities, objects and appearance share.
  const placements = compileCourseSpritePlacements(section, length, lines, assets, resolve, path);
  const objects = Object.freeze(
    [
      ...compileCourseSpriteObjects(placements, physical.height),
      ...compileWallEnds(walls, barriers, `${path}/walls`),
    ].sort((a, b) => a.s - b.s),
  );
  const lateralDomain = compileMaterialCoordinateDomain(strips.material, path);
  const result: OpenSection = {
    id: section.id,
    segments,
    coordinates: createPlanCoordinateReader(segments, length, lateralDomain.lateralAt),
    boundaries: Object.freeze(boundaries),
    lanes,
    ...physical,
    ...strips,
    barriers,
    ground: compileCourseGround(strips.material, barriers, `${path}/strips`),
    objects,
    // Set by `compileAppearance`, after the fork structure and before anything reads it.
    appearance: null as unknown as OpenSection['appearance'],
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
      pairs,
    );
    result.appearance = appearance;
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
 * of its delivered document. The work pauses between its units (an image, a Section's stage, an expanded Strip, a
 * Strip slab or preblend cell) when its slice is due, and reports each compiled Section. With `bounds`, each Section's
 * profile is laid within them (the crests and dips rule, `boundProfile`).
 */
export async function compileCourseDocument(
  document: CourseDocument,
  id: string,
  sha256: string,
  assetSources: readonly CourseImageBytes[],
  materials: SurfaceMaterialCatalog,
  documentPath = '',
  work: CourseCompileWork = {},
  bounds: CurvatureBounds | null = null,
): Promise<CourseResult<CompiledCourse>> {
  const slices = work.slices ?? UNSLICED;
  try {
    requireCourse(document.sections.length > 0, '/sections', 'A course requires a Section', 'empty_course');
    const images = await compileCourseImageSources(courseImageNames(document), assetSources, slices);
    if (!images.ok) return images;
    const assets = new Map(images.value.map((asset) => [asset.id, asset]));
    const resources = createCourseSpriteResources();
    const opened = await compileStage(document.sections, slices, async (section, index) => {
      const open = await compileSection(section, assets, resources, materials, `/sections/${index}`, slices, bounds);
      work.compiled?.((index + 1) / document.sections.length);
      return open;
    });
    const sections = opened.map((open) => open.section);
    const sectionTable = new Map(sections.map((section) => [section.id, section]));
    const sectionOf = (id: string) => sectionTable.get(id);
    const entry = reference(sectionOf, document.entry, '/entry');
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
    const links = await compileStage(document.links, slices, (source, index) => {
      const path = `/links/${index}`;
      const from = reference(sectionOf, source.from.section, `${path}/from/section`);
      const to = reference(sectionOf, source.to, `${path}/to`);
      const lane = reference((id) => courseLane(from.lanes, id), source.from.lane, `${path}/from/lane`);
      const cut = compileCourseCut(from, lane, from.coordinates.domain.end);
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
    const forks = await compileStage(opened, slices, (open, index) =>
      compileCourseFork(open.section, open.controls, `/sections/${index}`),
    );
    opened.forEach((open, index) => {
      open.section.fork = forks[index]!;
    });
    await compileStage(opened, slices, (open) => open.compileAppearance());
    const gates = compileCourseGates(
      document,
      type,
      sections,
      entry,
      new Map(opened.map((open) => [open.section, open.joints])),
    );
    // Close every cycle before freezing/publication. No open Section or construction table escapes.
    for (const section of sections) {
      Object.freeze(section.incoming);
      Object.freeze(section.outgoing);
      Object.freeze(section);
    }
    const sourceSha256 = sha256,
      materialsSha256 = materials.sha256;
    // The master dimensions of the solid sprites' images, in texels, by name: they size the roadside objects. Their
    // pixels and colors change no driving and stay out of the identity. A solid sprite's image is a course image: the
    // objects' compilation refused any other.
    const solidImages = Object.freeze(
      Object.fromEntries(
        courseSolidImageNames(document).map((name) => {
          const asset = assets.get(name)!;
          if (asset.kind !== 'sprite') throw new Error(`Solid image ${name} is not a course image`);
          const { image } = asset;
          return [name, Object.freeze({ width: image.width, height: image.height })];
        }),
      ),
    );
    const buildSha256 = await contentDigest(
      new TextEncoder().encode(
        JSON.stringify({ sourceSha256, materialsSha256, solidImages, compiler: COURSE_COMPILER }),
      ),
    );
    return courseSuccess(
      Object.freeze({
        id,
        name: document.name,
        type,
        rules: Object.freeze({ maxLaps: document.maxLaps }),
        bearing: document.bearing,
        gates,
        identity: Object.freeze({
          sourceSha256,
          materialsSha256,
          solidImages,
          buildSha256,
          compiler: COURSE_COMPILER,
        }),
        sections: Object.freeze(sections),
        entry,
        links: Object.freeze(links),
      }),
    );
  } catch (error) {
    if (error instanceof CourseStageErrors) return courseFailures(error.errors, documentPath);
    if (error instanceof CourseInputError) return courseFailure(error, documentPath);
    throw error;
  }
}
