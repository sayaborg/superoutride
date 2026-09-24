import { createVehiclePaletteVariant, type SpriteAssets } from '../image/sprite-assets.js';
import type { RaceActorObservation } from '../race/course-race.js';
import type { SessionVehicle } from '../race/session-configuration.js';
import type { CameraState } from './camera.js';
import type { CourseSprite } from './course-sprite.js';
import { createDynamicVehicleCourseSprite } from './dynamic-vehicle-sprite.js';

/** Observer-owned sprite assembly over camera-independent race observations. */
export function createRaceSprites(assets: SpriteAssets, rival: SessionVehicle) {
  const brakingAssets =
    rival.profile.id === 'TESTAROSSA'
      ? createVehiclePaletteVariant(assets.car, assets.car.assets[0]![0]!.paletteChoices[1]!)
      : assets[rival.kind];
  const sprites: CourseSprite[] = [];
  return (actors: readonly RaceActorObservation[], camera: CameraState) => {
    sprites.length = 0;
    for (const actor of actors) {
      sprites.push(
        createDynamicVehicleCourseSprite(
          actor.id,
          actor.vehicle,
          camera.yaw,
          actor.paletteVariant === 'braking' ? brakingAssets : assets[actor.kind],
        ),
      );
    }
    return sprites;
  };
}
