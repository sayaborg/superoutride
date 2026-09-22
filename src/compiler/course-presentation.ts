import { compileCourseBandGround } from './course-band-ground.js';
import { COURSE_DOCUMENT_LIMITS, type CourseAnchor, type PresentationDocument } from '../course/course-document.js';
import { courseBoundaryAt, type CompiledRegionPartition, type CompiledCarriageway } from '../course/course-regions.js';
import type { CompiledCourseAnchor } from '../course/course-geometry.js';
import { CourseInputError, requireCourse } from '../course/course-diagnostics.js';
import { BACKGROUND_HEIGHT, BACKGROUND_PIXELS_PER_RADIAN } from '../graphics/tile-background-image.js';
import type { CoursePresentation, CourseSceneryInstance } from '../visual/course-presentation.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_PRESENTATION_RECIPE = Object.freeze({ id: 'superoutride.course-presentation', version: 6 });

/** Resolve saved Bands, environment and scenery through canonical geometry/assets. */
export function compileCoursePresentation(
  source: PresentationDocument | null,
  partition: CompiledRegionPartition,
  assets: readonly CompiledCourseImageSource[],
  instances: ReadonlyMap<string, CourseSceneryInstance>,
  resolve: (anchor: CourseAnchor, path: string) => CompiledCourseAnchor,
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
  const ordered = (anchors: readonly CompiledCourseAnchor[], start: number, end: number, at: string) => {
    requireCourse(
      anchors.length > 0 && anchors[0]!.s === start,
      at,
      'Profile must begin at its declared domain start',
      'invalid_profile',
    );
    for (let i = 0; i < anchors.length; i += 1)
      requireCourse(
        anchors[i]!.s < end && (i === 0 || anchors[i]!.s > anchors[i - 1]!.s),
        `${at}/${i}/anchor`,
        'Profile changes must strictly increase inside the domain',
        'invalid_profile',
      );
  };
  const ground = compileCourseBandGround(source.ground.bands, partition.length, `${path}/ground/bands`);
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
      anchor: resolve(environment.anchor, `${at}/anchor`),
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
    environments.map((e) => e.anchor),
    0,
    partition.length,
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
    return Object.freeze({
      unselected,
      id: placement.id,
      instance,
      anchor: resolve(placement.anchor, `${at}/anchor`),
      l: placement.l,
      groundOffset: placement.groundOffset,
    });
  });
  const boundaries = new Map(
    partition.regions.flatMap((region) => [region.left, region.right]).map((edge) => [edge.id, edge]),
  );
  for (const [rowIndex, row] of source.sceneryRows.entries()) {
    const at = `${path}/sceneryRows/${rowIndex}`;
    const start = resolve(row.start, `${at}/start`),
      end = resolve(row.end, `${at}/end`);
    const boundary = boundaries.get(row.boundaryId);
    if (!boundary) throw new CourseInputError('unresolved_reference', `${at}/boundaryId`, 'Unknown row Boundary');
    requireCourse(
      end.s > start.s && start.s >= boundary.knots[0]!.anchor.s && end.s <= boundary.knots.at(-1)!.anchor.s,
      at,
      'Row interval must be positive and covered by its Boundary',
      'invalid_placement',
    );
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
          anchor: Object.freeze({ kind: 'absolute' as const, s }),
          l: courseBoundaryAt(boundary, s) + (row.side === 'left' ? -row.offset : row.offset),
          groundOffset: row.groundOffset,
        }),
      );
    }
  }
  return Object.freeze({
    ground,
    environments: Object.freeze(environments),
    scenery: Object.freeze(scenery),
  });
}
