import type { SpriteAsset } from '../image/sprite.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { CONTACT_EXPLOSION } from '../race/contact-response.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { basePoint, type BasePoint } from './base-point.js';
import type { CourseSprite } from './course-sprite.js';

/** Explosion frames stand at the vehicle's common base point and enter the scene's ordinary depth ordering. */
export function createContactExplosionSprites(frames: readonly SpriteAsset[]) {
  if (!frames.length) throw new RangeError('An explosion needs at least one picture');
  const sprites: CourseSprite[] = [];
  const base: BasePoint = { x: 0, y: 0, z: 0, s: 0 },
    sample = createPlanCoordinateSample();
  return (actors: readonly CompetitorObservation[], coordinates: PlanCoordinateReader): readonly CourseSprite[] => {
    sprites.length = 0;
    for (const actor of actors) {
      if (actor.contactResponse.phase !== 'exploding') continue;
      const frame = Math.min(
        frames.length - 1,
        Math.floor((actor.contactResponse.seconds / CONTACT_EXPLOSION.blastSeconds) * frames.length),
      );
      basePoint(coordinates, actor, base, sample);
      sprites.push({
        name: `explosion-${actor.id}`,
        x: base.x,
        y: base.y,
        z: base.z,
        sRender: base.s,
        shadow: null,
        asset: frames[frame]!,
      });
    }
    return sprites;
  };
}
