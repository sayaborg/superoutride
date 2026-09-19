import type { CourseAnchor, PresentationDocument } from '../course/course-document.js';
import type { CompiledBandPartition } from '../course/course-bands.js';
import type { CompiledCourseAnchor } from '../course/course-geometry.js';
import { CourseInputError, requireCourse } from '../course/course-diagnostics.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../graphics/sprite.js';
import type { CoursePresentation, CourseSceneryInstance, CoursePaint } from '../visual/course-presentation.js';
import type { CompiledCourseImageSource } from './course-image-source.js';

export const COURSE_PRESENTATION_RECIPE = Object.freeze({ id: 'superoutride.course-presentation', version: 1 });

/** Resolve saved presentation through canonical geometry/assets; no inferred role-derived paint. */
export function compileCoursePresentation(
  source: PresentationDocument | null,
  partition: CompiledBandPartition,
  assets: readonly CompiledCourseImageSource[],
  instances: ReadonlyMap<string, CourseSceneryInstance>,
  resolve: (anchor: CourseAnchor, path: string) => CompiledCourseAnchor,
  path: string,
): CoursePresentation | null {
  if (source === null) return null;
  const assetTable = new Map(assets.map((asset) => [asset.id, asset]));
  const image = (id: string, at: string, master = false) => {
    const asset = assetTable.get(id);
    if (!asset) throw new CourseInputError('unresolved_reference', at, 'Image must belong to this Section');
    requireCourse(
      !master || asset.source.levels.length === 1,
      at,
      'Ground and background require a normalized master, not a sprite LOD pyramid',
      'invalid_image_role',
    );
    return asset;
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
      asset = image(b.assetId, `${at}/background/assetId`, true);
    requireCourse(
      Number.isInteger(b.horizonY) && b.horizonY < asset.source.height,
      `${at}/background/horizonY`,
      'Background horizon must be an image row',
      'invalid_image_role',
    );
    requireCourse(
      asset.source.levels[0]!.indices.every((index) => index !== 0),
      `${at}/background/assetId`,
      'Background master must provide opaque frame coverage',
      'invalid_image_role',
    );
    return Object.freeze({
      anchor: resolve(environment.anchor, `${at}/anchor`),
      name: environment.name,
      groundBaseLeft: environment.groundBaseLeft,
      groundBaseRight: environment.groundBaseRight,
      background: Object.freeze({
        asset,
        horizonY: b.horizonY,
        pixelsPerRadian: b.pixelsPerRadian,
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
    return Object.freeze({
      id: placement.id,
      instance,
      anchor: resolve(placement.anchor, `${at}/anchor`),
      l: placement.l,
      groundOffset: placement.groundOffset,
    });
  });
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
