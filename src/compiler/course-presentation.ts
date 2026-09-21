import { COURSE_DOCUMENT_LIMITS, type CourseAnchor, type PresentationDocument } from '../course/course-document.js';
import { courseBoundaryAt, type CompiledBandPartition, type CompiledCarriageway } from '../course/course-bands.js';
import type { CompiledCourseAnchor } from '../course/course-geometry.js';
import { CourseInputError, requireCourse } from '../course/course-diagnostics.js';
import { BACKGROUND_HEIGHT, BACKGROUND_PIXELS_PER_RADIAN } from '../graphics/tile-background-image.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../graphics/sprite.js';
import type { CoursePresentation, CourseSceneryInstance, CoursePaint } from '../visual/course-presentation.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_PRESENTATION_RECIPE = Object.freeze({ id: 'superoutride.course-presentation', version: 4 });

/** Resolve saved presentation through canonical geometry/assets; no inferred role-derived paint. */
export function compileCoursePresentation(
  source: PresentationDocument | null,
  partition: CompiledBandPartition,
  assets: readonly CompiledCourseImageSource[],
  instances: ReadonlyMap<string, CourseSceneryInstance>,
  resolve: (anchor: CourseAnchor, path: string) => CompiledCourseAnchor,
  path: string,
  sectionId: string,
  carriageways: readonly CompiledCarriageway[],
): CoursePresentation | null {
  if (source === null) return null;
  const assetTable = new Map(assets.map((asset) => [asset.id, asset]));
  const image = (id: string, at: string, master = false) => {
    const asset = assetTable.get(id);
    if (!asset) throw new CourseInputError('unresolved_reference', at, 'Image must belong to this Section');
    if (asset.source.format !== 'superoutride.sprite-lod')
      throw new CourseInputError('invalid_image_role', at, 'Ground and scenery require sprite patterns');
    const sprite = asset as typeof asset & {
      readonly source: Extract<typeof asset.source, { format: 'superoutride.sprite-lod' }>;
    };
    requireCourse(
      !master || asset.source.levels.length === 1,
      at,
      'Ground requires a normalized master, not a sprite LOD pyramid',
      'invalid_image_role',
    );
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
  const bandTable = new Map(partition.bands.map((band) => [band.id, band])),
    assigned = new Set();
  const bands = source.ground.bands.map((binding, i) => {
    const at = `${path}/ground/bands/${i}`,
      band = bandTable.get(binding.bandId);
    if (!band) throw new CourseInputError('unresolved_reference', `${at}/bandId`, 'Unknown appearance Band');
    requireCourse(
      !assigned.has(band),
      `${at}/bandId`,
      'Each Band has one explicit appearance binding',
      'appearance_binding',
    );
    assigned.add(band);
    const sections = binding.sections.map((section, j) => {
      const atSection = `${at}/sections/${j}`,
        anchor = resolve(section.anchor, `${atSection}/anchor`);
      let paint: CoursePaint | null = null;
      if (section.paint !== null) {
        const p = section.paint,
          asset = image(p.assetId, `${atSection}/paint/assetId`, true);
        if (p.alternate) {
          requireCourse(
            p.alternate.paletteRgb555.length === asset.source.levels[0]!.paletteRgb555.length,
            `${atSection}/paint/alternate/paletteRgb555`,
            'A/B mapping needs one explicit color for each opaque source slot',
            'appearance_binding',
          );
          for (const coordinate of [0, partition.length])
            requireCourse(
              Number.isSafeInteger(Math.floor((coordinate - p.phaseS) / p.alternate.spanS)),
              `${atSection}/paint/alternate/spanS`,
              'A/B chainage phase must retain integer cell identity',
              'invalid_numeric_domain',
            );
          for (const coordinate of [-source.ground.left, source.ground.right])
            requireCourse(
              Number.isSafeInteger(Math.floor((coordinate - p.phaseL) / p.alternate.spanL)),
              `${atSection}/paint/alternate/spanL`,
              'A/B lateral phase must retain integer cell identity',
              'invalid_numeric_domain',
            );
        }
        paint = Object.freeze({ asset, phaseS: p.phaseS, phaseL: p.phaseL, alternate: p.alternate });
      }
      return Object.freeze({ anchor, paint });
    });
    ordered(
      sections.map((s) => s.anchor),
      band.start.s,
      band.end.s,
      `${at}/sections`,
    );
    return Object.freeze({ band, sections: Object.freeze(sections) });
  });
  requireCourse(
    assigned.size === partition.bands.length,
    `${path}/ground/bands`,
    'Every Band needs an appearance binding; explicit null paint reveals the base',
    'appearance_binding',
  );
  const stamps = source.ground.stamps.map((stamp, i) => {
    const at = `${path}/ground/stamps/${i}`,
      asset = image(stamp.assetId, `${at}/assetId`, true),
      anchor = resolve(stamp.anchor, `${at}/anchor`),
      density = SPRITE_SOURCE_TEXELS_PER_METER;
    const gridS = Math.floor(density * (anchor.s - (asset.source.anchorY + 0.5) / density) + 0.5),
      gridL = Math.floor(density * (stamp.l - (asset.source.anchorX + 0.5) / density) + 0.5);
    requireCourse(
      Number.isSafeInteger(gridS) && Number.isSafeInteger(gridL),
      at,
      'Resolved stamp top-left must fit the source lattice',
      'invalid_placement',
    );
    return Object.freeze({ id: stamp.id, asset, anchor, l: stamp.l, gridS, gridL });
  });
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
      groundBaseLeft: environment.groundBaseLeft,
      groundBaseRight: environment.groundBaseRight,
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
  const boundaries = new Map(partition.bands.flatMap((band) => [band.left, band.right]).map((edge) => [edge.id, edge]));
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
    ground: Object.freeze({
      partition,
      left: source.ground.left,
      right: source.ground.right,
      baseRgb555: source.ground.baseRgb555,
      bands: Object.freeze(bands),
      stamps: Object.freeze(stamps),
    }),
    environments: Object.freeze(environments),
    scenery: Object.freeze(scenery),
  });
}
