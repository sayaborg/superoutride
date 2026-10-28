import { expandCourseElements, expansionWork, shiftedCoursePosition } from '../course-repeat.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CoursePosition, type SectionDocument } from '../course-document.js';
import type { CompiledFork } from './course-graph.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import type {
  CourseAppearance,
  CourseSpriteImage,
  CourseSpriteResource,
  CourseWallAppearance,
} from '../course-appearance.js';
import type { StripGround } from '../strip-ground.js';
import type { CompiledWall } from './course-walls.js';
import type { CourseSpritePlacement } from './course-objects.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

/** A course sky is a tile picture 80 tiles (640 px) high and opaque, so it writes every pixel it covers. */
export const SKY_TILE_ROWS = 80;

export const COURSE_APPEARANCE_RECIPE = Object.freeze({ id: 'superoutride.course-appearance', version: 15 });

/** A visible wall's picture: its color ground and the height range its opaque Strips span. */
function compileWallAppearance(wall: CompiledWall & { readonly color: StripGround }): CourseWallAppearance {
  const { left: bottom, right: top } = wall.color.coverage;
  return Object.freeze({ boundary: wall.boundary, start: wall.start, end: wall.end, bottom, top, color: wall.color });
}

/** Share one immutable image/palette binding across every Section in a compilation. */
export function createCourseSpriteResources() {
  const images = new Map<CourseSpriteImage['image'], Map<string, CourseSpriteResource>>();
  return <Image extends CourseSpriteImage>(
    asset: Image,
    palette: string,
    path: string,
  ): CourseSpriteResource<Image> => {
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
    let resource = variants.get(palette) as CourseSpriteResource<Image> | undefined;
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
  assets: ReadonlyMap<string, CompiledCourseImageSource>,
  resource: ReturnType<typeof createCourseSpriteResources>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
  fork: Readonly<CompiledFork> | null,
  walls: readonly CompiledWall[],
  placements: readonly CourseSpritePlacement[],
): CourseAppearance {
  const source = section.environments;
  const visible = walls.filter((wall): wall is CompiledWall & { readonly color: StripGround } => wall.color !== null);
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
    expansionWork(COURSE_DOCUMENT_LIMITS.environmentKnots * (2 * COURSE_DOCUMENT_LIMITS.repeatDepth + 1)),
    (environment, offset, at) => {
      requireCourse(
        environments.length < COURSE_DOCUMENT_LIMITS.environmentKnots,
        at,
        'Expanded environment knot limit exceeded',
        'resource_limit',
      );
      const b = environment.background,
        asset = assets.get(b.image);
      if (!asset) throw new CourseInputError('unresolved_reference', `${at}/background/image`, 'Unknown course asset');
      if (asset.kind !== 'background')
        throw new CourseInputError(
          'invalid_image_role',
          `${at}/background/image`,
          'Background requires the tile picture format',
        );
      const tiled = asset;
      requireCourse(
        tiled.image.rows === SKY_TILE_ROWS && tiled.image.opaque,
        `${at}/background/image`,
        `A sky is an opaque tile picture ${SKY_TILE_ROWS} tiles high`,
        'invalid_image_role',
      );
      requireCourse(
        Number.isInteger(b.horizonY) && b.horizonY < tiled.image.height,
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
            yawOriginRadians: (b.yawOrigin * Math.PI) / 180,
          }),
          arrival: environment.arrival,
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
  const sprites = placements.map(({ source: placement, path: at, at: position, l, image: asset }) => {
    const instance = resource(asset, placement.palette, `${at}/palette`);
    // A movable placement's knocked pictures share its palette; its standing, flying and landed pictures each cast a
    // shadow, so each has one.
    const movable = placement.body?.movable ?? null;
    const shadowed = <Picture extends CourseSpriteImage>(picture: Picture, pictureAt: string) => {
      requireCourse(
        picture.kind === 'sprite' && picture.image.levels[0]!.shadow !== null,
        pictureAt,
        "A movable object's pictures have shadows",
        'invalid_placement',
      );
      return picture;
    };
    if (movable !== null) shadowed(asset, `${at}/image`);
    // A knocked picture is the solid object's too, so, like its standing one, it does not extend sideways; it flies,
    // so it stands on its bottom edge.
    const knockedPicture = (name: string, pictureAt: string) => {
      const picture = shadowed(image(name, pictureAt), pictureAt);
      requireCourse(
        picture.image.extend === undefined,
        pictureAt,
        'A board extending sideways cannot be solid',
        'invalid_placement',
      );
      requireCourse(
        picture.image.anchorY === picture.image.height - 0.5,
        pictureAt,
        'A picture not anchored at its bottom edge stands at height 0',
        'invalid_placement',
      );
      return resource(picture, placement.palette, `${at}/palette`);
    };
    const knocked =
      movable !== null
        ? Object.freeze({
            airborne: knockedPicture(movable.knocked.airborne, `${at}/body/movable/knocked/airborne`),
            landed: knockedPicture(movable.knocked.landed, `${at}/body/movable/knocked/landed`),
          })
        : null;
    const unselectedLink = placement.unselectedLink;
    if (unselectedLink !== null) {
      requireCourse(fork !== null, at, 'State-selected road signs require a fork', 'invalid_fork');
      if (!fork!.exits.some((exit) => exit.link.id === unselectedLink))
        throw new CourseInputError('unresolved_reference', `${at}/unselectedLink`, 'Not a Link leaving this fork');
      // Between lock and closure, a sign also precedes every exit cut.
      requireCourse(
        position.s >= fork!.lock.s && position.s <= fork!.closure.s,
        at,
        'Road signs lie between lock and closure',
        'invalid_fork',
      );
    }
    return Object.freeze({
      unselectedLink,
      instance,
      at: position,
      l,
      groundOffset: placement.groundOffset,
      knocked,
    });
  });
  return Object.freeze({
    environments: Object.freeze(environments),
    sprites: Object.freeze(sprites),
    walls: Object.freeze(visible.map(compileWallAppearance)),
  });
}
