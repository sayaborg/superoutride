import { routeS, routeSectionS, type RouteView } from '../course/course-route.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { footprintsOverlap, type RouteFootprint } from './body-contacts.js';
import type { createCourseForkField } from './course-fork-field.js';
import { ENVELOPE_DRIVER, envelopeCanFollow, plannedEnvelopeSpeed, type EnvelopeDriver } from './envelope-driver.js';
import { occupiesLane, type LaneIntent } from './lane-following.js';
import { firstObjectFrom, type createRoadsideObjects } from './object-contacts.js';
import { presentTarget, type PresentVehicle } from './present-vehicle.js';
import { RECOVERY_POLICY, recoverVehicleToPlanCoordinate, type RecoveryTarget } from './recovery.js';

/**
 * Where the race places vehicles: whether a place is free, where recovery backs a vehicle to, how fast an appearing
 * vehicle enters, and the return of a vehicle off its locked fork route to the selected road. It reads the present
 * vehicles (`bodies`, which the race keeps current) and the standing roadside objects; it moves no vehicle but the one
 * it recovers.
 */
export function createVehiclePlacement(options: {
  readonly readers: VehicleWorld & { readonly coordinates: PlanCoordinateReader };
  readonly window: Pick<RouteView, 'at' | 'start' | 'end' | 'terminal'>;
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
    const occurrence = window.at(s);
    if (!occurrence) return null;
    const objects = occurrence.section.objects;
    const native = { ...at, s: routeSectionS(occurrence, s), l: l + occurrence.lateralOrigin };
    for (let i = firstObjectFrom(objects, native.s - at.length / 2); i < objects.length; i++) {
      const object = objects[i]!;
      if (object.s > native.s + at.length / 2) break;
      if (
        roadsideObjects.standing(occurrence, i) &&
        footprintsOverlap(native, { s: object.s, l: object.l, length: 0, width: object.width })
      )
        return { s: routeS(occurrence, object.s), length: 0 };
    }
    return null;
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
     * How fast a vehicle of `model` appears at (s, its intent's target) under `driver`: its planned speed there behind
     * the vehicle ahead in that lane, and short of that lane's end when it ends within the lookahead. Null when a
     * vehicle behind in that lane whose driver does not pass could not stop for it — its own plan, seeing the new
     * vehicle ahead at that speed, would ask more than its speed — so the appearance waits or passes like an occupied
     * one. Drivers that pass move over or match its speed; the player avoids it.
     */
    appearanceSpeed(model: VehicleModel, s: number, intent: LaneIntent, driver: EnvelopeDriver): number | null {
      const lane = (station: number) => forks.targetL(station, intent);
      const laneEnd = forks.laneEnd(s, s + ENVELOPE_DRIVER.lookahead, intent)?.s ?? null;
      const domain =
        laneEnd === null
          ? window
          : { start: window.start, end: window.end, terminal: Math.min(window.terminal ?? Infinity, laneEnd) };
      const length = model.compiledVehicle.overallLength,
        width = model.compiledVehicle.overallWidth;
      const inLane = (body: PresentVehicle) =>
        occupiesLane(
          body.vehicle.course.l,
          presentTarget(body),
          lane(body.vehicle.course.s),
          (width + body.model.compiledVehicle.overallWidth) / 2,
        );
      const speedOf = (body: PresentVehicle) => Math.hypot(body.vehicle.longitudinalSpeed, body.vehicle.lateralSpeed);
      let ahead: { s: number; speed: number; clearance: number } | null = null;
      for (const body of bodies)
        if (body.vehicle.course.s > s && (!ahead || body.vehicle.course.s < ahead.s) && inLane(body))
          ahead = {
            s: body.vehicle.course.s,
            speed: speedOf(body),
            clearance: (length + body.model.compiledVehicle.overallLength) / 2,
          };
      // A standing object in the lane is a stopped vehicle to the appearing driver, as to every driver.
      roadsideObjects.sight(s, s + ENVELOPE_DRIVER.lookahead, (objectS, l, objectWidth) => {
        if (
          objectS > s &&
          (!ahead || objectS < ahead.s) &&
          occupiesLane(l, l, lane(objectS), (width + objectWidth) / 2)
        )
          ahead = { s: objectS, speed: 0, clearance: length / 2 };
      });
      const speed = plannedEnvelopeSpeed(readers.coordinates, s, driver, lane, domain, ahead);
      for (const body of bodies)
        if (
          body.driving &&
          !body.driving.driver.passes &&
          body.vehicle.course.s <= s &&
          inLane(body) &&
          !envelopeCanFollow(body.vehicle.course.s, speedOf(body), body.driving.driver.braking, {
            s,
            speed,
            clearance: (length + body.model.compiledVehicle.overallLength) / 2,
          })
        )
          return null;
      return speed;
    },
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
        target: vacantPlace(body, target.s, (s) => forks.recoveryL(s, null), target.l),
      });
      return true;
    },
  });
}
