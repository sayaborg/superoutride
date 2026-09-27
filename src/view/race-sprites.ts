import type { VehicleSpriteStates } from './vehicle-sprites.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { CameraState } from './camera.js';
import type { CourseSprite } from './course-sprite.js';
import { createDynamicVehicleCourseSprite } from './dynamic-vehicle-sprite.js';

/** Observer-owned sprite assembly over borrowed, camera-independent competitor observations. */
export function createRaceSprites(assets: VehicleSpriteStates) {
  const sprites: CourseSprite[] = [];
  return (actors: readonly CompetitorObservation[], camera: CameraState) => {
    sprites.length = 0;
    for (const actor of actors) {
      sprites.push(
        createDynamicVehicleCourseSprite(actor.id, actor, camera.yaw, actor.brakeLampOn ? assets.on : assets.off),
      );
    }
    return sprites;
  };
}
