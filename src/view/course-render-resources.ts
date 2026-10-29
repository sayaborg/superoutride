import type { ProfileReader } from '../course/geometry/profile.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { createSpritePalette, type SpriteAsset } from '../image/sprite.js';
import type { CourseAppearance, CourseSpriteResource } from '../course/course-appearance.js';
import { compileCourseSprite } from './course-sprite.js';

/** Rendering resources over the compiled course's decoded images, which are borrowed read-only. */
export function createCourseRenderResources() {
  // Only palette instances are materialized here; the compiled images are shared, never decoded again.
  const instances = new Map<CourseSpriteResource, SpriteAsset>();
  function instanceImage(instance: CourseSpriteResource): SpriteAsset {
    let asset = instances.get(instance);
    if (!asset) {
      asset = createSpritePalette(instance.asset.image, instance.palette);
      instances.set(instance, asset);
    }
    return asset;
  }
  const createSectionReaders = (
    p: CourseAppearance,
    geometry: { readonly coordinates: PlanCoordinateReader },
    height: ProfileReader,
  ) => {
    if (!p || !Array.isArray(p.environments) || !Array.isArray(p.sprites) || !geometry?.coordinates || !height)
      throw new TypeError('Section rendering requires compiled content, plan and height readers');

    return Object.freeze({
      sprites: Object.freeze(
        p.sprites.map((placement) =>
          Object.freeze({
            l: placement.l,
            unselectedLink: placement.unselectedLink,
            knocked: placement.knocked && {
              airborne: instanceImage(placement.knocked.airborne),
              landed: instanceImage(placement.knocked.landed),
            },
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
