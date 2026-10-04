import { wrapAngle } from '../core/math.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { createCourseForkField } from './course-fork-field.js';
import {
  drivingDomainBefore,
  ENVELOPE_DRIVER,
  envelopeDrivingInput,
  envelopeSpeedBehind,
  planEnvelopeDriving,
  plannedEnvelopeSpeed,
  travelYaw,
  type DriverRoad,
  type DrivingDomain,
  type EnvelopeDriver,
} from './envelope-driver.js';
import { createLaneFollowing, type LaneIntent, type VehicleSighting } from './lane-following.js';
import type { createRoadsideObjects } from './object-contacts.js';
import { presentTarget, type PresentVehicle } from './present-vehicle.js';

/**
 * The drivers' lane decisions over the sightings: which lane a driver drives, merging where its lane ends, passing or
 * following a slower vehicle, and the input that follows; and how fast an appearing vehicle enters. `observe` writes how
 * drivers see the present vehicles (`bodies`, which the race keeps current) and the standing objects ahead; `drive`
 * decides one driver's input from them and `appearanceSpeed` one appearance.
 */
export function createLaneDriving(options: {
  readonly road: DriverRoad;
  readonly window: DrivingDomain;
  readonly forks: ReturnType<typeof createCourseForkField>;
  readonly roadsideObjects: ReturnType<typeof createRoadsideObjects>;
  readonly bodies: readonly PresentVehicle[];
}) {
  const { road, window, forks, roadsideObjects, bodies } = options;
  // Drivers follow and change lanes over the race's sightings of the present vehicles.
  const following = createLaneFollowing(forks, window);
  const sightings: VehicleSighting[] = [];
  // Reused records for the standing objects drivers see: zero length, the object's width, at rest in line with the
  // road, heading for their own lateral.
  const objectSightings: VehicleSighting[] = [];
  const roadSample = createPlanCoordinateSample();
  const laneDomain = { start: 0, end: 0, terminal: null as number | null };
  const probe: LaneIntent = { lane: 0, ordinal: 0, exit: () => 0 };
  // Drivers see the present vehicles as they stand now, and the standing objects as stopped vehicles from the rearmost
  // present vehicle to the driver lookahead beyond the foremost one, or beyond station `through` when that is farther.
  const observe = (through = -Infinity) => {
    sightings.length = 0;
    for (const body of bodies) {
      const { vehicle, model } = body;
      Object.assign(body.sighting, {
        s: vehicle.course.s,
        l: vehicle.course.l,
        length: model.compiledVehicle.overallLength,
        width: model.compiledVehicle.overallWidth,
        speed: Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed),
        heading: wrapAngle(
          travelYaw(vehicle) - road.coordinates.toWorld(vehicle.course.s, vehicle.course.l, roadSample).heading,
        ),
        target: presentTarget(body),
        driver: body.driving?.driver ?? null,
      });
      sightings.push(body.sighting);
    }
    let rearS = through,
      frontS = through;
    for (const body of bodies) {
      rearS = Math.min(rearS, body.vehicle.course.s);
      frontS = Math.max(frontS, body.vehicle.course.s);
    }
    let sighted = 0;
    roadsideObjects.sight(rearS, frontS + ENVELOPE_DRIVER.lookahead, (s, l, width) => {
      if (sighted === objectSightings.length)
        objectSightings.push({ s: 0, l: 0, length: 0, width: 0, speed: 0, heading: 0, target: 0, driver: null });
      const sighting = objectSightings[sighted++] as { s: number; l: number; width: number; target: number };
      sighting.s = s;
      sighting.l = sighting.target = l;
      sighting.width = width;
      sightings.push(sighting as VehicleSighting);
    });
  };
  // The appearing vehicle as drivers would see it.
  const appearing = {
    s: 0,
    l: 0,
    length: 0,
    width: 0,
    speed: 0,
    heading: 0,
    target: 0,
    driver: null as EnvelopeDriver | null,
  };
  const appearanceDomain = { start: 0, end: 0, terminal: null as number | null };
  return Object.freeze({
    /** Drivers see the present vehicles and the standing objects ahead as they stand at the step's start. */
    observe: () => observe(),
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
      if (end !== null && end.merge !== null && following.merge(intent, driven.sighting, sightings, end.merge)) {
        driving.target = (station: number) => forks.targetL(station, intent);
        driven.sighting.target = driving.target(driven.sighting.s);
        end = endOf(intent.lane);
      }
      const laneEnd = end?.s ?? null;
      const planned = laneEnd === null ? domain : drivingDomainBefore(domain, laneEnd, laneDomain);
      const plan = planEnvelopeDriving(
        road,
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
          (leader) => envelopeSpeedBehind(driven.vehicle, driver, driving.workspace, plan.free, leader),
          (lane) => endOf(lane) !== null,
        );
        if (moved !== null) {
          driving.target = (station: number) => forks.targetL(station, intent);
          driven.sighting.target = driving.target(driven.sighting.s);
          targetSpeed = moved;
        }
      }
      return envelopeDrivingInput(
        road,
        driven.vehicle,
        driver,
        driving.target,
        driving.workspace,
        planned,
        targetSpeed,
      );
    },
    /**
     * How fast a vehicle of `model` appears at (s, its intent's lane centre) under `driver`, seeing the present vehicles
     * and standing objects as they stand now: its planned speed there behind the vehicle ahead in that lane, and short of
     * that lane's end when it ends within the lookahead. Null when a driven vehicle behind in that lane whose driver does
     * not pass could not stop for it at that speed, so the appearance waits or passes like an occupied one. Drivers that
     * pass move over or match its speed; the player avoids it.
     */
    appearanceSpeed(model: VehicleModel, s: number, intent: LaneIntent, driver: EnvelopeDriver): number | null {
      observe(s);
      const lane = (station: number) => forks.targetL(station, intent);
      const laneEnd = forks.laneEnd(s, s + ENVELOPE_DRIVER.lookahead, intent)?.s ?? null;
      const domain = laneEnd === null ? window : drivingDomainBefore(window, laneEnd, appearanceDomain);
      Object.assign(appearing, {
        s,
        l: lane(s),
        length: model.compiledVehicle.overallLength,
        width: model.compiledVehicle.overallWidth,
        speed: 0,
        target: lane(s),
        driver,
      });
      appearing.speed = plannedEnvelopeSpeed(
        road,
        s,
        driver,
        lane,
        domain,
        following.leader(intent, appearing, sightings),
      );
      return following.followersCanStop(appearing, intent, intent.lane, sightings, (other) => !other.passes)
        ? appearing.speed
        : null;
    },
  });
}
