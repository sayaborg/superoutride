import { createVehicleSprites, type VehicleSpriteStates } from './vehicle-sprites.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { CameraState } from './camera.js';
import type { CourseSprite } from './course-sprite.js';
import { createDynamicVehicleCourseSprite } from './dynamic-vehicle-sprite.js';
import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { standingPoint, type StandingPoint } from './standing-point.js';

/**
 * Observer-owned sprite assembly over borrowed, camera-independent competitor observations. Each competitor is
 * drawn from its own vehicle's sprite set in its observed color, bound once per vehicle and color on first use, standing
 * on its footprint's near edge on the scene's route coordinates.
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
  const footprints = new Map(
    vehicles.map((vehicle) => [vehicle.compiledVehicle.id, vehicle.compiledVehicle.footprint]),
  );
  const standing: StandingPoint = { x: 0, y: 0, z: 0, s: 0 },
    sample = createPlanCoordinateSample();
  return (actors: readonly CompetitorObservation[], camera: CameraState, coordinates: PlanCoordinateReader) => {
    sprites.length = 0;
    for (const actor of actors) {
      const states = statesOf(actor.vehicleId, actor.color);
      standingPoint(coordinates, actor, footprints.get(actor.vehicleId)!, standing, sample);
      sprites.push(
        createDynamicVehicleCourseSprite(
          actor.id,
          actor,
          standing,
          camera.yaw,
          actor.brakeLampOn ? states.on : states.off,
        ),
      );
    }
    return sprites;
  };
}
