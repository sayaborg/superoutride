import { expandCourseElements, shiftedCoursePosition } from '../course-repeat.js';
import { resolveCourseLateral } from './course-lateral.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CoursePosition, type SectionDocument } from '../course-document.js';
import type { CompiledBoundary, CompiledCarriageway } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { BACKGROUND_HEIGHT, BACKGROUND_PIXELS_PER_RADIAN } from '../../image/tile-background-image.js';
import type { CoursePresentation, CourseSceneryInstance } from '../course-presentation.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_PRESENTATION_RECIPE = Object.freeze({ id: 'superoutride.course-presentation', version: 9 });

/** Share one immutable image/palette binding across every Section in a compilation. */
export function createCourseSpriteResources() {
  const images = new Map<CourseSceneryInstance['asset']['source'], Map<string, CourseSceneryInstance>>();
  return (
    asset: CourseSceneryInstance['asset'],
    palette: readonly number[] | null,
    path: string,
  ): CourseSceneryInstance => {
    requireCourse(
      palette === null ||
        [asset.source.levels[0]!.paletteRgb555, ...asset.source.variants].some((choice) =>
          choice.every((value, i) => i === 0 || value === palette[i]),
        ),
      path,
      'Sprite palette must participate in the compiled LOD variant set',
      'appearance_binding',
    );
    let variants = images.get(asset.source);
    if (!variants) {
      variants = new Map();
      images.set(asset.source, variants);
    }
    const key = JSON.stringify(palette);
    let resource = variants.get(key);
    if (!resource) {
      resource = Object.freeze({ asset, paletteRgb555: palette });
      variants.set(key, resource);
    }
    return resource;
  };
}

/** Resolve saved environment and sprites through canonical geometry/assets. */
export function compileCoursePresentation(
  section: SectionDocument,
  length: number,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  assets: readonly CompiledCourseImageSource[],
  resource: ReturnType<typeof createCourseSpriteResources>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
  carriageways: readonly CompiledCarriageway[],
): CoursePresentation | null {
  const source = section.presentation;
  if (source === null) {
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
      'Profile must begin at its declared domain start',
      'invalid_profile',
    );
    for (let i = 0; i < positions.length; i += 1)
      requireCourse(
        positions[i]!.s < end && (i === 0 || positions[i]!.s > positions[i - 1]!.s),
        `${at}/${i}/at`,
        'Profile changes must strictly increase inside the domain',
        'invalid_profile',
      );
  };
  const environments: CoursePresentation['environments'][number][] = [];
  expandCourseElements(
    source.environments,
    `${path}/presentation/environments`,
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
    `${path}/presentation/environments`,
  );
  const sprites: CoursePresentation['sprites'][number][] = [];
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
