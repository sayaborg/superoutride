import type { HeightProfileReader } from '../course/geometry/height-profile.js';
import type { RasterGeometry } from '../course/geometry/raster-coordinate-reader.js';
import { readSpriteLodAsset, createSpritePaletteVariant, type SpriteLodDocument } from '../image/sprite.js';
import { TileBackgroundImage, type TileBackgroundDocument } from '../image/tile-background-image.js';
import type { CoursePresentation } from '../course/course-presentation.js';
import { VisualProfile } from '../visual/visual-profile.js';
import { compileCourseSprite } from './course-sprite.js';

/** Presentation from ordinary saved facets; completed sprite levels and immutable image readers are shared. */
export function createCoursePresentationPreview() {
  // Decoded preview workspaces are borrowed read-only. Canonical saved sources remain immutable.
  const images = new Map<SpriteLodDocument, ReturnType<typeof readSpriteLodAsset>>();
  const backgrounds = new Map<TileBackgroundDocument, TileBackgroundImage>();
  const instances = new Map<CoursePresentation['scenery'][number]['instance'], ReturnType<typeof readSpriteLodAsset>>();
  const image = (source: SpriteLodDocument) => {
    let decoded = images.get(source);
    if (!decoded) {
      decoded = readSpriteLodAsset(source);
      images.set(source, decoded);
    }
    return decoded;
  };
  const instanceImage = (instance: CoursePresentation['scenery'][number]['instance']) => {
    let asset = instances.get(instance);
    if (!asset) {
      const source = image(instance.asset.source);
      asset = instance.paletteRgb555 === null ? source : createSpritePaletteVariant(source, instance.paletteRgb555);
      instances.set(instance, asset);
    }
    return asset;
  };
  const createSource = (p: CoursePresentation, geometry: RasterGeometry, height: HeightProfileReader) => {
    if (!p || !p.ground || !Array.isArray(p.environments) || !Array.isArray(p.scenery) || !geometry?.raster || !height)
      throw new TypeError('Presentation preview requires compiled content, Raster and height readers');
    if (p.ground.length !== geometry.length || height.courseLength !== geometry.length)
      throw new RangeError('Presentation preview facets must share their source ruler');

    return Object.freeze({
      visual: new VisualProfile(
        geometry.length,
        p.environments.map((e) => ({
          sStart: e.anchor.s,
          name: e.name,
        })),
      ),
      backgrounds: Object.freeze(
        p.environments.map((e) => {
          const source = e.background.asset.source;
          let background = backgrounds.get(source);
          if (!background) {
            background = new TileBackgroundImage(source);
            backgrounds.set(source, background);
          }
          return Object.freeze({
            image: background,
            sourceHorizonY: e.background.horizonY,
            yawOriginRadians: e.background.yawOriginRadians,
          });
        }),
      ),
      sprites: Object.freeze(
        p.scenery.map((placement) =>
          Object.freeze({
            l: placement.l,
            unselected: placement.unselected,
            sprite: Object.freeze(
              compileCourseSprite(geometry, height, {
                name: placement.instance.id,
                s: placement.anchor.s,
                l: placement.l,
                groundOffset: placement.groundOffset,
                asset: instanceImage(placement.instance),
              }),
            ),
          }),
        ),
      ),
    });
  };
  return Object.freeze({ createSource });
}
