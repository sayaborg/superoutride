import type { ProfileReader } from '../course/geometry/profile.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { createSpritePalette, type SpriteAsset } from '../image/sprite.js';
import { createSpriteViewsPalette } from '../image/sprite-views.js';
import type { CourseAppearance, CourseSpriteImage, CourseSpriteResource } from '../course/course-appearance.js';
import { EnvironmentTimeline } from '../course/environment-timeline.js';
import { compileCourseSprite } from './course-sprite.js';

/** Rendering resources over the compiled course's decoded images, which are borrowed read-only. */
export function createCourseRenderResources() {
  // Only palette instances are materialized here; the compiled images are shared, never decoded again. A view set's
  // instance is its pictures in the palette and the picture of each view.
  type Instance = SpriteAsset | { readonly pictures: readonly SpriteAsset[]; readonly views: readonly number[] };
  const instances = new Map<CourseSpriteResource, Instance>();
  function instanceImage(instance: CourseSpriteResource<CourseSpriteImage & { readonly kind: 'sprite' }>): SpriteAsset;
  function instanceImage(instance: CourseSpriteResource): Instance;
  function instanceImage(instance: CourseSpriteResource): Instance {
    let asset = instances.get(instance);
    if (!asset) {
      asset =
        instance.asset.kind === 'sprite'
          ? createSpritePalette(instance.asset.image, instance.palette)
          : createSpriteViewsPalette(instance.asset.image, instance.palette);
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
            arrival: e.arrival,
          });
        }),
      ),
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
