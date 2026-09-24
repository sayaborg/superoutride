import { resolveCourseLateral } from './course-lateral.js';
import { COURSE_DOCUMENT_LIMITS } from '../course-limits.js';
import { type CoursePosition, type PresentationDocument } from '../course-document.js';
import type { CompiledBoundary, CompiledCarriageway } from '../course-boundaries.js';
import type { CompiledCoursePosition } from '../course-geometry.js';
import { CourseInputError, requireCourse } from '../course-diagnostics.js';
import { BACKGROUND_HEIGHT, BACKGROUND_PIXELS_PER_RADIAN } from '../../image/tile-background-image.js';
import type { CoursePresentation, CourseSceneryInstance } from '../course-presentation.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_PRESENTATION_RECIPE = Object.freeze({ id: 'superoutride.course-presentation', version: 8 });

/** Resolve saved environment and scenery through canonical geometry/assets. */
export function compileCoursePresentation(
  source: PresentationDocument | null,
  length: number,
  boundaries: ReadonlyMap<string, CompiledBoundary>,
  assets: readonly CompiledCourseImageSource[],
  instances: ReadonlyMap<string, CourseSceneryInstance>,
  resolve: (at: CoursePosition, path: string) => CompiledCoursePosition,
  path: string,
  sectionId: string,
  carriageways: readonly CompiledCarriageway[],
): CoursePresentation | null {
  if (source === null) return null;
  const assetTable = new Map(assets.map((asset) => [asset.id, asset]));
  const image = (id: string, at: string) => {
    const asset = assetTable.get(id);
    if (!asset) throw new CourseInputError('unresolved_reference', at, 'Image must belong to this Section');
    if (asset.source.format !== 'superoutride.sprite-lod')
      throw new CourseInputError('invalid_image_role', at, 'Scenery requires sprite patterns');
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
  const environments = source.environments.map((environment, i) => {
    const at = `${path}/environments/${i}`,
      b = environment.background,
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
    return Object.freeze({
      at: resolve(environment.at, `${at}/at`),
      name: environment.name,
      background: Object.freeze({
        asset: tiled,
        horizonY: b.horizonY,
        pixelsPerRadian: BACKGROUND_PIXELS_PER_RADIAN,
        yawOriginRadians: (b.yawOrigin * Math.PI) / 180,
      }),
    });
  });
  ordered(
    environments.map((e) => e.at),
    0,
    length,
    `${path}/environments`,
  );
  const scenery = source.scenery.map((placement, i) => {
    const at = `${path}/scenery/${i}`,
      instance = instances.get(placement.instanceId);
    if (!instance) throw new CourseInputError('unresolved_reference', `${at}/instanceId`, 'Unknown scenery instance');
    requireCourse(
      assets.some((asset) => asset === instance.asset),
      `${at}/instanceId`,
      'Scenery asset must belong to this Section',
      'unresolved_reference',
    );
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
    const position = resolve(placement.at, `${at}/at`);
    return Object.freeze({
      unselected,
      id: placement.id,
      instance,
      at: position,
      l: resolveCourseLateral(placement.lateral, position.s, boundaries, `${at}/lateral`),
      groundOffset: placement.groundOffset,
    });
  });
  for (const [rowIndex, row] of source.sceneryRows.entries()) {
    const at = `${path}/sceneryRows/${rowIndex}`;
    const start = resolve(row.start, `${at}/start`),
      end = resolve(row.end, `${at}/end`);
    requireCourse(end.s > start.s, at, 'Row interval must be positive', 'invalid_placement');
    const count = Math.ceil((end.s - start.s) / row.spacing);
    requireCourse(
      Number.isSafeInteger(count) && count + scenery.length <= COURSE_DOCUMENT_LIMITS.placements,
      at,
      'Expanded scenery exceeds the Section placement limit',
      'resource_limit',
    );
    const asset = image(row.assetId, `${at}/assetId`);
    for (let index = 0; index < count; index += 1) {
      const s = start.s + index * row.spacing;
      if (s >= end.s) break;
      const id = JSON.stringify([sectionId, row.id, index]);
      scenery.push(
        Object.freeze({
          id,
          instance: Object.freeze({ id, asset, paletteRgb555: null }),
          unselected: null,
          at: Object.freeze({ s }),
          l: resolveCourseLateral(row.lateral, s, boundaries, `${at}/lateral`),
          groundOffset: row.groundOffset,
        }),
      );
    }
  }
  return Object.freeze({
    environments: Object.freeze(environments),
    scenery: Object.freeze(scenery),
  });
}
