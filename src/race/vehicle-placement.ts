import type { RouteView } from '../course/course-route.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { footprintsOverlap, type RouteFootprint } from './body-contacts.js';
import type { createCourseForkField } from './course-fork-field.js';
import type { createRoadsideObjects } from './object-contacts.js';
import type { PresentVehicle } from './present-vehicle.js';
import { RECOVERY_POLICY, recoverVehicleToPlanCoordinate, type RecoveryTarget } from './recovery.js';

/**
 * Where the race places vehicles: whether a place is free, where recovery backs a vehicle to, and the return of a vehicle off its locked fork route to the selected road. It reads the present
 * vehicles (`bodies`, which the race keeps current) and the standing roadside objects; it moves no vehicle but the one
 * it recovers.
 */
export function createVehiclePlacement(options: {
  readonly readers: VehicleWorld & { readonly coordinates: PlanCoordinateReader };
  readonly window: Pick<RouteView, 'start'>;
  readonly forks: ReturnType<typeof createCourseForkField>;
  readonly roadsideObjects: ReturnType<typeof createRoadsideObjects>;
  readonly bodies: readonly PresentVehicle[];
}) {
  const { readers, window, forks, roadsideObjects, bodies } = options;
  const footprint = (model: VehicleModel, s: number, l: number): RouteFootprint => ({
    s,
    l,
    length: model.compiledVehicle.overallLength,
    width: model.compiledVehicle.overallWidth,
  });
  // What a footprint of `model` at (s, l) would overlap — a present vehicle other than `self`, or a fixed object — as its
  // route station and length; null when the place is free.
  const occupant = (
    model: VehicleModel,
    s: number,
    l: number,
    self: VehicleState | null = null,
  ): { readonly s: number; readonly length: number } | null => {
    const at = footprint(model, s, l);
    for (const body of bodies)
      if (
        body.vehicle !== self &&
        footprintsOverlap(at, footprint(body.model, body.vehicle.course.s, body.vehicle.course.l))
      )
        return { s: body.vehicle.course.s, length: body.model.compiledVehicle.overallLength };
    let object: { s: number; length: number } | null = null;
    roadsideObjects.sight(s - at.length / 2, s + at.length / 2, (objectS, objectL, width) => {
      if (!object && footprintsOverlap(at, { s: objectS, l: objectL, length: 0, width }))
        object = { s: objectS, length: 0 };
    });
    return object;
  };
  // Recovery places no vehicle on another's footprint: from station s it backs along the Route behind each vehicle in
  // the way, by the policy's clearance, until the place in its lane there is free (or the resident Route begins).
  const vacantPlace = (self: PresentVehicle, s: number, lane: (s: number) => number, l = lane(s)): RecoveryTarget => {
    for (
      let other = occupant(self.model, s, l, self.vehicle);
      other && s > window.start;
      other = occupant(self.model, s, l, self.vehicle)
    ) {
      const behind =
        other.s - (self.model.compiledVehicle.overallLength + other.length) / 2 - RECOVERY_POLICY.placementClearance;
      s = Math.max(window.start, behind);
      l = lane(s);
    }
    return { s, l };
  };
  return Object.freeze({
    /** Whether a footprint of `model` at (s, l) would overlap a present vehicle or a standing fixed object. */
    occupied: (model: VehicleModel, s: number, l: number) => occupant(model, s, l) !== null,
    vacantPlace,
    /**
     * Return `body` to the selected road when it has left the route its locked fork allows: behind a vehicle in the
     * way, the selected road's centre. Returns whether it recovered.
     */
    legalRecovery(body: PresentVehicle): boolean {
      const target = forks.legalTarget(body.vehicle.course.s, body.vehicle.course.l);
      if (!target) return false;
      recoverVehicleToPlanCoordinate(readers, body.vehicle, body.model, {
        state: body.step.state,
        reason: 'wrong-course',
        target: vacantPlace(body, target.s, (s) => forks.recoveryL(s, null, target.l), target.l),
      });
      return true;
    },
  });
}
