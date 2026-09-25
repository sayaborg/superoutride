import { expandCourseElements, shiftedCoursePosition } from '../course-repeat.js';
import { resolveCourseLateral } from './course-lateral.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CoursePosition, type SectionDocument } from '../course-document.js';
import type { CompiledBoundary, CompiledCarriageway } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { BACKGROUND_HEIGHT, BACKGROUND_PIXELS_PER_RADIAN } from '../../image/tile-background-image.js';
import type { CourseAppearance, CourseSpriteResource } from '../course-appearance.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_APPEARANCE_RECIPE = Object.freeze({ id: 'superoutride.course-appearance', version: 11 });

/** Share one immutable image/palette binding across every Section in a compilation. */
export function createCourseSpriteResources() {
  const images = new Map<CourseSpriteResource['asset']['source'], Map<string, CourseSpriteResource>>();
  return (asset: CourseSpriteResource['asset'], palette: string, path: string): CourseSpriteResource => {
    requireCourse(
      Object.hasOwn(asset.source.palettes, palette),
      path,
      `Unknown sprite palette ${JSON.stringify(palette)}`,
      'unresolved_reference',
    );
    let variants = images.get(asset.source);
    if (!variants) {
      variants = new Map();
      images.set(asset.source, variants);
    }
    let resource = variants.get(palette);
    if (!resource) {
      resource = Object.freeze({ asset, palette });
      variants.set(palette, resource);
    }
    return resource;
  };
}

/** Resolve saved environment and sprites through canonical geometry/assets. */
export function compileCourseAppearance(
  section: SectionDocument,
  length: number,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  assets: readonly CompiledCourseImageSource[],
  resource: ReturnType<typeof createCourseSpriteResources>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
  carriageways: readonly CompiledCarriageway[],
  recordSpritePath: (path: string) => void,
): CourseAppearance | null {
  const source = section.environments;
  if (source.length === 0) {
    requireCourse(section.sprites.length === 0, `${path}/sprites`, 'Sprites require environments', 'invalid_placement');
    return null;
  }
  const assetTable = new Map(assets.map((asset) => [asset.id, asset]));
  const image = (id: string, at: string) => {
    const asset = assetTable.get(id);
    if (!asset) throw new CourseInputError('unresolved_reference', at, 'Image must belong to this Section');
    if (asset.source.format !== 'superoutride.sprite-lod')
      throw new CourseInputError('invalid_image_role', at, 'Sprites require sprite patterns');
    const sprite = asset as typeof asset & {
      readonly source: Extract<typeof asset.source, { format: 'superoutride.sprite-lod' }>;
    };
    return sprite;
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
        asset = assetTable.get(b.assetId);
      if (!asset) throw new CourseInputError('unresolved_reference', `${at}/background/assetId`, 'Unknown background');
      if (asset.source.format !== 'superoutride.tile-background')
        throw new CourseInputError(
          'invalid_image_role',
          `${at}/background/assetId`,
          'Background requires the single tiled plane format',
        );
      const tiled = asset as typeof asset & {
        readonly source: Extract<typeof asset.source, { format: 'superoutride.tile-background' }>;
      };
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
      const unselected =
        placement.unselectedCarriagewayId === null
          ? null
          : carriageways.find((c) => c.id === placement.unselectedCarriagewayId);
      if (unselected === undefined)
        throw new CourseInputError(
          'unresolved_reference',
          `${at}/unselectedCarriagewayId`,
          'Unknown state-selected carriageway',
        );
      const position = shiftedCoursePosition(resolve, offset, length)(placement.at, `${at}/at`);
      recordSpritePath(at);
      sprites.push(
        Object.freeze({
          unselected,
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
  });
}
