import type { ProfileReader } from '../course/geometry/profile.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { createSpritePalette, type SpriteAsset } from '../image/sprite.js';
import type { CourseAppearance } from '../course/course-appearance.js';
import { EnvironmentTimeline } from '../course/environment-timeline.js';
import { compileCourseSprite } from './course-sprite.js';

/** Rendering resources over the compiled course's decoded images, which are borrowed read-only. */
export function createCourseRenderResources() {
  // Only palette instances are materialized here; the compiled images are shared, never decoded again.
  const instances = new Map<CourseAppearance['sprites'][number]['instance'], SpriteAsset>();
  const instanceImage = (instance: CourseAppearance['sprites'][number]['instance']) => {
    let asset = instances.get(instance);
    if (!asset) {
      asset = createSpritePalette(instance.asset.image, instance.palette);
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
          return Object.freeze({
            image: e.background.asset.image,
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
                name: placement.instance.asset.image.name,
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
