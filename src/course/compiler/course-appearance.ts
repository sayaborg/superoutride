import { expandCourseElements, shiftedCoursePosition } from '../course-repeat.js';
import { resolveCourseLateral } from './course-lateral.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CoursePosition, type SectionDocument } from '../course-document.js';
import type { CompiledBoundary, CompiledCarriageway } from '../course-boundaries.js';
import type { CompiledFork } from './course-graph.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { BACKGROUND_HEIGHT, BACKGROUND_PIXELS_PER_RADIAN } from '../../image/tile-background-image.js';
import type {
  CourseAppearance,
  CourseSpriteResource,
  CourseWallAppearance,
  CourseWallBand,
} from '../course-appearance.js';
import type { CompiledWall } from './course-walls.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_APPEARANCE_RECIPE = Object.freeze({ id: 'superoutride.course-appearance', version: 12 });

// The RGB555 channel of a color, and a color from three channels.
const channel = (color: number, shift: number) => (color >> shift) & 31;
const rgb555 = (r: number, g: number, b: number) => (Math.round(r) << 10) | (Math.round(g) << 5) | Math.round(b);

/**
 * A visible wall's picture. Its far bands blend the whole period at every height: transparent where transparent entries
 * cover at least half of it, else the length-weighted average of the opaque colors there.
 */
function compileWallAppearance(wall: CompiledWall): CourseWallAppearance {
  const { top, bottom, pattern } = wall.source;
  let from = 0;
  const entries = pattern.map((entry) => {
    const placed = Object.freeze({ from, to: from + entry.length, bands: entry.bands });
    from += entry.length;
    return placed;
  });
  const period = from;
  const heights = [...new Set(pattern.flatMap((entry) => entry.bands.map((band) => band.to)))].sort((a, b) => a - b);
  const far: CourseWallBand[] = heights.map((to) => {
    let clear = 0,
      r = 0,
      g = 0,
      b = 0,
      opaque = 0;
    for (const entry of pattern) {
      const color = entry.bands.find((band) => band.to >= to)!.color;
      if (color === null) clear += entry.length;
      else {
        opaque += entry.length;
        r += channel(color, 10) * entry.length;
        g += channel(color, 5) * entry.length;
        b += channel(color, 0) * entry.length;
      }
    }
    return Object.freeze({ to, color: clear >= period / 2 ? null : rgb555(r / opaque, g / opaque, b / opaque) });
  });
  return Object.freeze({
    boundary: wall.boundary,
    start: wall.start,
    end: wall.end,
    top,
    bottom,
    period,
    entries: Object.freeze(entries),
    shortestEntry: Math.min(...pattern.map((entry) => entry.length)),
    far: Object.freeze(far),
  });
}

/** Share one immutable image/palette binding across every Section in a compilation. */
export function createCourseSpriteResources() {
  const images = new Map<CourseSpriteResource['asset']['image'], Map<string, CourseSpriteResource>>();
  return (asset: CourseSpriteResource['asset'], palette: string, path: string): CourseSpriteResource => {
    requireCourse(
      Object.hasOwn(asset.image.palettes, palette),
      path,
      `Unknown sprite palette ${JSON.stringify(palette)}`,
      'unresolved_reference',
    );
    let variants = images.get(asset.image);
    if (!variants) {
      variants = new Map();
      images.set(asset.image, variants);
    }
    let resource = variants.get(palette);
    if (!resource) {
      resource = Object.freeze({ asset, palette });
      variants.set(palette, resource);
    }
    return resource;
  };
}

/**
 * Resolve saved environment and sprites through canonical geometry/assets. It reads the Section's compiled
 * fork, when there is one, to check its own state-selected signs at their document positions.
 */
export function compileCourseAppearance(
  section: SectionDocument,
  length: number,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  assets: ReadonlyMap<string, CompiledCourseImageSource>,
  resource: ReturnType<typeof createCourseSpriteResources>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
  carriageways: readonly CompiledCarriageway[],
  fork: Readonly<CompiledFork> | null,
  walls: readonly CompiledWall[],
): CourseAppearance | null {
  const source = section.environments;
  const visible = walls.filter((wall) => wall.source.pattern.length > 0);
  if (source.length === 0) {
    requireCourse(section.sprites.length === 0, `${path}/sprites`, 'Sprites require environments', 'invalid_placement');
    requireCourse(visible.length === 0, `${path}/walls`, 'Visible walls require environments', 'invalid_placement');
    return null;
  }
  const image = (id: string, at: string) => {
    const asset = assets.get(id);
    if (!asset) throw new CourseInputError('unresolved_reference', at, 'Unknown course asset');
    if (asset.kind !== 'sprite')
      throw new CourseInputError('invalid_image_role', at, 'Sprites require sprite patterns');
    return asset;
  };
  const ordered = (positions: readonly CompiledCoursePosition[], start: number, end: number, at: string) => {
    requireCourse(
      positions.length > 0 && positions[0]!.s === start,
      at,
      'Environment knots must begin at their declared domain start',
      'invalid_appearance',
    );
    for (let i = 0; i < positions.length; i += 1)
      requireCourse(
        positions[i]!.s < end && (i === 0 || positions[i]!.s > positions[i - 1]!.s),
        `${at}/${i}/at`,
        'Environment knots must strictly increase inside the domain',
        'invalid_appearance',
      );
  };
  const environments: CourseAppearance['environments'][number][] = [];
  expandCourseElements(
    source,
    `${path}/environments`,
    COURSE_DOCUMENT_LIMITS.environmentKnots * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1),
    (environment, offset, at) => {
      requireCourse(
        environments.length < COURSE_DOCUMENT_LIMITS.environmentKnots,
        at,
        'Expanded environment knot limit exceeded',
        'resource_limit',
      );
      const b = environment.background,
        asset = assets.get(b.assetId);
      if (!asset)
        throw new CourseInputError('unresolved_reference', `${at}/background/assetId`, 'Unknown course asset');
      if (asset.kind !== 'background')
        throw new CourseInputError(
          'invalid_image_role',
          `${at}/background/assetId`,
          'Background requires the single tiled plane format',
        );
      const tiled = asset;
      requireCourse(
        Number.isInteger(b.horizonY) && b.horizonY < BACKGROUND_HEIGHT,
        `${at}/background/horizonY`,
        'Background horizon must be an image row',
        'invalid_image_role',
      );
      environments.push(
        Object.freeze({
          at: shiftedCoursePosition(resolve, offset, length)(environment.at, `${at}/at`),
          name: environment.name,
          background: Object.freeze({
            asset: tiled,
            horizonY: b.horizonY,
            pixelsPerRadian: BACKGROUND_PIXELS_PER_RADIAN,
            yawOriginRadians: (b.yawOrigin * Math.PI) / 180,
          }),
        }),
      );
    },
  );
  ordered(
    environments.map((e) => e.at),
    0,
    length,
    `${path}/environments`,
  );
  const sprites: CourseAppearance['sprites'][number][] = [];
  expandCourseElements(
    section.sprites,
    `${path}/sprites`,
    COURSE_DOCUMENT_LIMITS.spritePlacements * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1),
    (placement, offset, at) => {
      requireCourse(
        sprites.length < COURSE_DOCUMENT_LIMITS.spritePlacements,
        at,
        'Expanded sprite placement limit exceeded',
        'resource_limit',
      );
      const instance = resource(image(placement.image, `${at}/image`), placement.palette, `${at}/palette`);
      const unselectedCarriagewayId = placement.unselectedCarriagewayId;
      const unselected =
        unselectedCarriagewayId === null ? null : carriageways.find((c) => c.id === unselectedCarriagewayId);
      if (unselected === undefined)
        throw new CourseInputError(
          'unresolved_reference',
          `${at}/unselectedCarriagewayId`,
          'Unknown state-selected carriageway',
        );
      const position = shiftedCoursePosition(resolve, offset, length)(placement.at, `${at}/at`);
      if (unselected !== null) {
        requireCourse(fork !== null, at, 'State-selected road signs require a fork', 'invalid_fork');
        requireCourse(
          fork!.exits.some((exit) => exit.link.from.carriageway === unselected),
          at,
          'Road sign state must name a canonical exit carriageway',
          'invalid_fork',
        );
        // Between lock and closure, a sign also precedes every exit cut.
        requireCourse(
          position.s >= fork!.lock.s && position.s <= fork!.closure.s,
          at,
          'Road signs lie between lock and closure',
          'invalid_fork',
        );
      }
      sprites.push(
        Object.freeze({
          unselectedCarriagewayId,
          instance,
          at: position,
          l: resolveCourseLateral(placement.lateral, position.s, boundaries, `${at}/lateral`),
          groundOffset: placement.groundOffset,
        }),
      );
    },
  );
  return Object.freeze({
    environments: Object.freeze(environments),
    sprites: Object.freeze(sprites),
    walls: Object.freeze(visible.map(compileWallAppearance)),
  });
}
