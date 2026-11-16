import type { RouteView } from '../course/course-route.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { footprintsOverlap, type RouteFootprint } from './body-contacts.js';
import type { createCourseLaneField } from './course-lane-field.js';
import type { createRoadsideObjects } from './object-contacts.js';
import type { PresentVehicle } from './present-vehicle.js';
import { RECOVERY_POLICY, type RecoveryTarget } from './recovery.js';

/**
 * Where the race places vehicles: whether a place is free and where recovery backs a vehicle to. It reads the present
 * vehicles (`bodies`, which the race keeps current) and the standing roadside objects; it moves no vehicle.
 */
export function createVehiclePlacement(options: {
  readonly window: Pick<RouteView, 'start'>;
  readonly laneField: ReturnType<typeof createCourseLaneField>;
  readonly roadsideObjects: ReturnType<typeof createRoadsideObjects>;
  readonly bodies: readonly PresentVehicle[];
}) {
  const { window, laneField, roadsideObjects, bodies } = options;
  const footprint = (model: VehicleModel, s: number, l: number): RouteFootprint => ({
    s,
    l,
    length: model.compiledVehicle.footprint,
    width: model.compiledVehicle.footprint,
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
        return { s: body.vehicle.course.s, length: body.model.compiledVehicle.footprint };
    let object: { s: number; length: number } | null = null;
    const near = at.length / 2 + roadsideObjects.objectReach();
    roadsideObjects.sight(s - near, s + near, (objectS, objectL, width, depth) => {
      if (!object && footprintsOverlap(at, { s: objectS, l: objectL, length: depth, width }))
        object = { s: objectS, length: depth };
    });
    return object;
  };
  // The first route station at which the resident Route holds a vehicle of `model` whole: the resident start plus its
  // reach, so its centre and body lie in the coordinate domain however it stands there.
  const firstPlace = (model: VehicleModel) => window.start + model.compiledVehicle.reach;
  // Recovery places no vehicle on another's footprint, nor where the resident Route does not hold it: from station s,
  // no earlier than its first place, it backs along the Route behind each vehicle in the way, by the policy's
  // clearance, until the place in its lane there is free; null when it reaches its first place and the place is not
  // free there.
  const vacantPlace = (self: PresentVehicle, from: number, lane: (s: number) => number): RecoveryTarget | null => {
    const first = firstPlace(self.model);
    let s = Math.max(first, from),
      l = lane(s);
    for (
      let other = occupant(self.model, s, l, self.vehicle);
      other;
      other = occupant(self.model, s, l, self.vehicle)
    ) {
      if (s <= first) return null;
      const behind =
        other.s - (self.model.compiledVehicle.footprint + other.length) / 2 - RECOVERY_POLICY.placementClearance;
      s = Math.max(first, behind);
      l = lane(s);
    }
    return { s, l };
  };
  return Object.freeze({
    /** Whether a footprint of `model` at (s, l) would overlap a present vehicle or a standing fixed object. */
    occupied: (model: VehicleModel, s: number, l: number) => occupant(model, s, l) !== null,
    vacantPlace,
    /**
     * Where a recovery from route station `s` places `self`, every vehicle alike: the centre of the lane nearest it
     * there (`recoveryL`), no earlier than where the resident Route holds it whole, behind any vehicle or standing
     * object in the way; null when no place is free.
     */
    recoveryPlace: (self: PresentVehicle, s: number) =>
      vacantPlace(self, s, (at) =>
        laneField.recoveryL(at, self.vehicle.course.l, self.model.compiledVehicle.footprint),
      ),
  });
}
