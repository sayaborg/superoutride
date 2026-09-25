import type { VehicleSpriteStates } from './vehicle-sprites.js';
import type { RaceActorObservation } from '../race/course-race.js';
import type { CameraState } from './camera.js';
import type { CourseSprite } from './course-sprite.js';
import { createDynamicVehicleCourseSprite } from './dynamic-vehicle-sprite.js';

/** Observer-owned sprite assembly over camera-independent race observations. */
export function createRaceSprites(assets: VehicleSpriteStates) {
  const sprites: CourseSprite[] = [];
  return (actors: readonly RaceActorObservation[], camera: CameraState) => {
    sprites.length = 0;
    for (const actor of actors) {
      sprites.push(
        createDynamicVehicleCourseSprite(
          actor.id,
          actor.vehicle,
          camera.yaw,
          actor.brakeLampOn ? assets.on : assets.off,
        ),
      );
    }
    return sprites;
  };
}
