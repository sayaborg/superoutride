import type { ProfileReader } from '../course/geometry/profile.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { readSpriteLodAsset, createSpritePaletteVariant, type SpriteLodDocument } from '../image/sprite.js';
import { TileBackgroundImage, type TileBackgroundDocument } from '../image/tile-background-image.js';
import type { CourseAppearance } from '../course/course-appearance.js';
import { EnvironmentTimeline } from '../course/environment-timeline.js';
import { compileCourseSprite } from './course-sprite.js';

/** Rendering resources from ordinary saved facets; completed sprite levels and immutable image readers are shared. */
export function createCourseRenderResources() {
  // Decoded rendering workspaces are borrowed read-only. Canonical saved sources remain immutable.
  const images = new Map<SpriteLodDocument, ReturnType<typeof readSpriteLodAsset>>();
  const backgrounds = new Map<TileBackgroundDocument, TileBackgroundImage>();
  const instances = new Map<CourseAppearance['sprites'][number]['instance'], ReturnType<typeof readSpriteLodAsset>>();
  const image = (source: SpriteLodDocument) => {
    let decoded = images.get(source);
    if (!decoded) {
      decoded = readSpriteLodAsset(source);
      images.set(source, decoded);
    }
    return decoded;
  };
  const instanceImage = (instance: CourseAppearance['sprites'][number]['instance']) => {
    let asset = instances.get(instance);
    if (!asset) {
      const decoded = image(instance.asset.source);
      asset = instance.paletteRgb555 === null ? decoded : createSpritePaletteVariant(decoded, instance.paletteRgb555);
      instances.set(instance, asset);
    }
    return asset;
  };
  const createSectionReaders = (
    p: CourseAppearance,
    geometry: { readonly coordinates: PlanCoordinateReader },
    height: ProfileReader,
  ) => {
    if (!p || !Array.isArray(p.environments) || !Array.isArray(p.sprites) || !geometry?.coordinates || !height)
      throw new TypeError('Section rendering requires compiled content, plan and height readers');

    return Object.freeze({
      environment: new EnvironmentTimeline(
        height.knots.at(-1)!.s,
        p.environments.map((e) => ({
          sStart: e.at.s,
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
            imageHorizonY: e.background.horizonY,
            yawOriginRadians: e.background.yawOriginRadians,
          });
        }),
      ),
      sprites: Object.freeze(
        p.sprites.map((placement) =>
          Object.freeze({
            l: placement.l,
            unselected: placement.unselected,
            sprite: Object.freeze(
              compileCourseSprite(geometry, height, {
                name: placement.instance.asset.source.name,
                s: placement.at.s,
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
  return Object.freeze({ createSectionReaders });
}
