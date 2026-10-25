import { createVehicleSprites, type VehicleSpriteStates } from './vehicle-sprites.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { contactResponseStopped } from '../race/contact-response.js';
import type { CameraState } from './camera.js';
import type { CourseSprite } from './course-sprite.js';
import { createDynamicVehicleCourseSprite } from './dynamic-vehicle-sprite.js';
import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { basePoint, type BasePoint } from './base-point.js';

/**
 * Observer-owned sprite assembly over borrowed, camera-independent competitor observations. Each competitor is
 * drawn from its own vehicle's sprite set in its observed color, bound once per vehicle and color on first use, standing
 * at its base point on the scene's route coordinates and seen from the camera's direction of view to it, its shadow
 * on the road under that point. Each keeps its previous frame's yaw
 * image near that image's sector.
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
  const base: BasePoint = { x: 0, y: 0, z: 0, s: 0 },
    sample = createPlanCoordinateSample();
  // Each drawn competitor's shadow place, reused frame to frame.
  const places: { y: number }[] = [];
  // Each competitor's yaw image in the previous frame, held near its sector; only the previous frame's are kept.
  let held = new Map<string, number>(),
    shown = new Map<string, number>();
  return (
    actors: readonly CompetitorObservation[],
    camera: CameraState,
    world: { readonly coordinates: PlanCoordinateReader; readonly height: ProfileReader },
  ) => {
    sprites.length = 0;
    [held, shown] = [shown, held];
    shown.clear();
    for (const actor of actors) {
      if (contactResponseStopped(actor.contactResponse)) continue;
      const states = statesOf(actor.vehicleId, actor.color);
      basePoint(world.coordinates, actor, base, sample);
      const place = (places[sprites.length] ??= { y: 0 });
      place.y = world.height.sample(actor.course.s);
      const { sprite, yawIndex } = createDynamicVehicleCourseSprite(
        actor.id,
        actor,
        base,
        place,
        camera,
        actor.brakeLampOn ? states.on : states.off,
        held.get(actor.id),
      );
      shown.set(actor.id, yawIndex);
      sprites.push(sprite);
    }
    return sprites;
  };
}
