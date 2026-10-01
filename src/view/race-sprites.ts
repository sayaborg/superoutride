import { createVehicleSprites, type VehicleSpriteStates } from './vehicle-sprites.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { CameraState } from './camera.js';
import type { CourseSprite } from './course-sprite.js';
import { createDynamicVehicleCourseSprite } from './dynamic-vehicle-sprite.js';

/**
 * Observer-owned sprite assembly over borrowed, camera-independent competitor observations. Each competitor is
 * drawn from its own vehicle's sprite set in its observed color, bound once per vehicle and color on first use.
 */
export function createRaceSprites(vehicles: readonly CompiledVehicleDefinition[]) {
  const sprites: CourseSprite[] = [];
  const bound = new Map<string, VehicleSpriteStates>();
  const statesOf = (vehicleId: string, color: string) => {
    const key = `${vehicleId}\u0000${color}`;
    let states = bound.get(key);
    if (!states) {
      const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
      if (!vehicle) throw new Error(`No sprite set for vehicle ${vehicleId}`);
      bound.set(key, (states = createVehicleSprites(vehicle, color)));
    }
    return states;
  };
  return (actors: readonly CompetitorObservation[], camera: CameraState) => {
    sprites.length = 0;
    for (const actor of actors) {
      const states = statesOf(actor.vehicleId, actor.color);
      sprites.push(
        createDynamicVehicleCourseSprite(actor.id, actor, camera.yaw, actor.brakeLampOn ? states.on : states.off),
      );
    }
    return sprites;
  };
}
