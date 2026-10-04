import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { createCourseForkField } from './course-fork-field.js';
import {
  drivingDomainBefore,
  ENVELOPE_DRIVER,
  envelopeCanFollow,
  envelopeDrivingInput,
  envelopeSpeedBehind,
  planEnvelopeDriving,
  type DrivingDomain,
} from './envelope-driver.js';
import { createLaneFollowing, occupiesLane, type LaneIntent, type VehicleSighting } from './lane-following.js';
import type { createRoadsideObjects } from './object-contacts.js';
import { presentTarget, type PresentVehicle } from './present-vehicle.js';

/**
 * The drivers' lane decisions over one step's sightings: which lane a driver drives, merging where its lane ends,
 * passing or following a slower vehicle, and the input that follows. `observe` writes, at the step's start, how drivers
 * see the present vehicles (`bodies`, which the race keeps current) and the standing objects ahead; `drive` decides one
 * driver's input from them.
 */
export function createLaneDriving(options: {
  readonly coordinates: PlanCoordinateReader;
  readonly window: DrivingDomain;
  readonly forks: ReturnType<typeof createCourseForkField>;
  readonly roadsideObjects: ReturnType<typeof createRoadsideObjects>;
  readonly bodies: readonly PresentVehicle[];
}) {
  const { coordinates, window, forks, roadsideObjects, bodies } = options;
  // Drivers follow and change lanes over the race's sightings of the present vehicles.
  const following = createLaneFollowing(forks);
  const sightings: VehicleSighting[] = [];
  // Reused records for the standing objects drivers see: zero length, the object's width, at rest, heading nowhere.
  const objectSightings: { s: number; l: number; length: number; width: number; speed: number; target: number }[] = [];
  const laneDomain = { start: 0, end: 0, terminal: null as number | null };
  const probe: LaneIntent = { lane: 0, ordinal: 0, exit: () => 0 };
  return Object.freeze({
    /**
     * Drivers see the present vehicles as they stand at the step's start, and the standing objects from the rearmost
     * present vehicle to the foremost one's driver lookahead, as stopped vehicles.
     */
    observe() {
      sightings.length = 0;
      for (const body of bodies) {
        const { vehicle, model } = body;
        Object.assign(body.sighting, {
          s: vehicle.course.s,
          l: vehicle.course.l,
          length: model.compiledVehicle.overallLength,
          width: model.compiledVehicle.overallWidth,
          speed: Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed),
          target: presentTarget(body),
        });
        sightings.push(body.sighting);
      }
      let rearS = Infinity,
        frontS = -Infinity;
      for (const body of bodies) {
        rearS = Math.min(rearS, body.vehicle.course.s);
        frontS = Math.max(frontS, body.vehicle.course.s);
      }
      let sighted = 0;
      roadsideObjects.sight(rearS, frontS + ENVELOPE_DRIVER.lookahead, (s, l, width) => {
        if (sighted === objectSightings.length)
          objectSightings.push({ s: 0, l: 0, length: 0, width: 0, speed: 0, target: 0 });
        const sighting = objectSightings[sighted++]!;
        sighting.s = s;
        sighting.l = sighting.target = l;
        sighting.width = width;
        sightings.push(sighting);
      });
    },
    /**
     * A driver's input this step, for the present vehicle `driven` that its driver drives. Its lane is first carried to
     * the occurrence it is in. Where that lane ends within its lookahead (`laneEnd`), it first merges one lane toward the
     * lane that continues there when that lane is free; while its lane still ends, the lane's end is its plan's
     * terminal, so it slows to stop there short of `terminalClearance` until it can merge. Then its plan, which the
     * vehicle ahead in its lane constrains, and that plan's input. When the vehicle ahead lowers the plan, a driver that
     * passes moves to the free adjacent lane where its plan allows the most speed, if that beats its own lane by more
     * than the passing margin and that lane does not end ahead, and drives that speed in its new lane (a new lane function,
     * since the driver caches by lane); otherwise it follows. A move rewrites the lateral the driver's sighting is
     * heading for at once, so drivers deciding later in the same step see it; position and speed keep their values from
     * the step's start.
     */
    drive(driven: PresentVehicle, domain: DrivingDomain = window): DrivingInput {
      const driving = driven.driving!;
      const { intent, driver } = driving;
      const s = driven.vehicle.course.s;
      forks.carry(intent, s);
      const endOf = (lane: number) => {
        probe.lane = lane;
        probe.ordinal = intent.ordinal;
        probe.exit = intent.exit;
        return forks.laneEnd(s, s + ENVELOPE_DRIVER.lookahead, probe);
      };
      let end = endOf(intent.lane);
      // A driven vehicle behind in the lane merged into must be able to stop behind the driver, as for an appearance.
      const followable = (lane: number) => {
        const self = driven.sighting;
        probe.lane = lane;
        probe.ordinal = intent.ordinal;
        probe.exit = intent.exit;
        for (const body of bodies)
          if (
            body.driving &&
            body.sighting !== self &&
            body.vehicle.course.s <= self.s &&
            occupiesLane(
              body.vehicle.course.l,
              body.sighting.target,
              forks.targetL(body.vehicle.course.s, probe),
              (self.width + body.model.compiledVehicle.overallWidth) / 2,
            ) &&
            !envelopeCanFollow(body.vehicle.course.s, body.sighting.speed, body.driving.driver.braking, {
              s: self.s,
              speed: self.speed,
              clearance: (self.length + body.model.compiledVehicle.overallLength) / 2,
            })
          )
            return false;
        return true;
      };
      if (
        end !== null &&
        end.merge !== null &&
        following.merge(intent, driven.sighting, sightings, end.merge, followable)
      ) {
        driving.target = (station: number) => forks.targetL(station, intent);
        driven.sighting.target = driving.target(driven.sighting.s);
        end = endOf(intent.lane);
      }
      const laneEnd = end?.s ?? null;
      const planned = laneEnd === null ? domain : drivingDomainBefore(domain, laneEnd, laneDomain);
      const plan = planEnvelopeDriving(
        coordinates,
        driven.vehicle,
        driver,
        driving.target,
        driving.workspace,
        planned,
        following.leader(intent, driven.sighting, sightings),
      );
      let targetSpeed = plan.target;
      if (plan.target < plan.free && driver.passes && laneEnd === null) {
        const moved = following.moveOver(
          intent,
          driven.sighting,
          sightings,
          plan.target,
          (leader) => envelopeSpeedBehind(driven.vehicle, driver, plan.free, leader),
          (lane) => endOf(lane) !== null,
        );
        if (moved !== null) {
          driving.target = (station: number) => forks.targetL(station, intent);
          driven.sighting.target = driving.target(driven.sighting.s);
          targetSpeed = moved;
        }
      }
      return envelopeDrivingInput(
        coordinates,
        driven.vehicle,
        driver,
        driving.target,
        driving.workspace,
        planned,
        targetSpeed,
      );
    },
  });
}
