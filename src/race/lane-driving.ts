import { wrapAngle } from '../core/math.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { LINE, type createCourseForkField } from './course-fork-field.js';
import {
  drivingDomainBefore,
  PLANNED_DRIVER,
  planDriving,
  plannedDrivingInput,
  plannedSpeed,
  routeSpeed,
  speedBehind,
  travelYaw,
  type DriverRoad,
  type DrivingDomain,
  type PlannedDriver,
} from './planned-driver.js';
import {
  createLaneFollowing,
  heldLateral,
  PATH_OFFSET,
  pathOffsetAt,
  type LaneIntent,
  type PathOffset,
  type VehicleSighting,
} from './lane-following.js';
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
  /** A circuit's lap length, by which drivers tell a competitor's lead in laps; null on other courses. */
  readonly lapLength: number | null;
}) {
  const { road, window, forks, roadsideObjects, bodies, lapLength } = options;
  // Drivers follow and change lanes over the race's sightings of the present vehicles.
  const following = createLaneFollowing(forks, window);
  const sightings: VehicleSighting[] = [];
  // Reused records for the standing objects drivers see: the object's footprint, at rest in line with the road, heading
  // for their own lateral.
  const objectSightings: VehicleSighting[] = [];
  const roadSample = createPlanCoordinateSample();
  // The road's heading at a vehicle's route position (kept in `roadSample`).
  const roadHeading = (vehicle: PresentVehicle['vehicle']) =>
    road.coordinates.toWorld(vehicle.course.s, vehicle.course.l, roadSample).heading;
  const byStation = (a: VehicleSighting, b: VehicleSighting) => a.s - b.s;
  const laneDomain = { start: 0, end: 0, terminal: null as number | null };
  const probe: LaneIntent = { lane: 0, at: 0, exit: () => 0 };
  // Drivers see the present vehicles as they stand now, and the standing objects as stopped vehicles from the rearmost
  // present vehicle to the driver lookahead beyond the foremost one, or beyond station `through` when that is farther.
  const observe = (through = -Infinity) => {
    sightings.length = 0;
    for (const body of bodies) {
      const { vehicle, model } = body;
      Object.assign(body.sighting, {
        s: vehicle.course.s,
        l: vehicle.course.l,
        length: model.compiledVehicle.footprint,
        width: model.compiledVehicle.footprint,
        speed: routeSpeed(vehicle, roadHeading(vehicle)),
        heading: wrapAngle(travelYaw(vehicle) - roadSample.heading),
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
    roadsideObjects.sight(rearS, frontS + PLANNED_DRIVER.lookahead, (s, l, width, depth, fixed) => {
      if (sighted === objectSightings.length)
        objectSightings.push({
          s: 0,
          l: 0,
          length: 0,
          width: 0,
          speed: 0,
          heading: 0,
          target: 0,
          driver: null,
          standing: true,
          fixed: false,
        });
      const sighting = objectSightings[sighted++] as {
        s: number;
        l: number;
        length: number;
        width: number;
        target: number;
        fixed: boolean;
      };
      sighting.s = s;
      sighting.l = sighting.target = l;
      sighting.length = depth;
      sighting.width = width;
      sighting.fixed = fixed;
      sightings.push(sighting as VehicleSighting);
    });
    // Drivers judge the vehicles in station order (a stable sort keeps a row's order).
    sightings.sort(byStation);
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
    driver: null as PlannedDriver | null,
    standing: false,
    fixed: false,
  };
  const appearanceDomain = { start: 0, end: 0, terminal: null as number | null };
  // The racing line of an intent's exits, without its offset.
  const lineIntent: LaneIntent = { lane: LINE, at: 0, exit: () => 0 };
  const line = (s: number) => forks.targetL(s, lineIntent);
  /*
   * A racing line driver's input: its plan along its path, which the vehicle ahead on it constrains, and the offset it
   * heads for by the path offset rules. A new offset, at the offset resolution, blends from the path's offset here over
   * the blend length; the driver's path is then a new function, since the driver caches by path, and its sighting heads
   * for the new path at once.
   */
  const driveLine = (driven: PresentVehicle, offset: PathOffset, domain: DrivingDomain): DrivingInput => {
    const driving = driven.driving!;
    const { intent, driver } = driving;
    const s = driven.vehicle.course.s;
    const plan = planDriving(
      road,
      driven.vehicle,
      driver,
      driving.target,
      driving.workspace,
      domain,
      following.leader(intent, driven.sighting, sightings),
      true,
    );
    lineIntent.exit = intent.exit;
    const { resolution, blendSeconds, blendLeast } = PATH_OFFSET;
    const next =
      Math.round(
        following.offsetTarget(intent, driven.sighting, sightings, {
          line,
          path: driving.target,
          edges: (station) => forks.roadEdges(station, intent.exit),
          offset,
          lapLength,
          speedBehind: (leader) => speedBehind(driven.vehicle, driver, plan.free, leader),
        }) / resolution,
      ) * resolution;
    if (next !== offset.to) {
      offset.from = intent.offset?.(s) ?? pathOffsetAt(offset, s);
      offset.to = next;
      offset.at = s;
      offset.length = Math.max(blendLeast, driven.sighting.speed * blendSeconds);
      const blend = Object.freeze({ from: offset.from, to: offset.to, at: offset.at, length: offset.length });
      // The path keeps within the road's edge margin, or no farther out than the line where the line is.
      const own: LaneIntent = { lane: LINE, at: 0, exit: intent.exit };
      const margin = driven.sighting.width / 2 + PATH_OFFSET.edgeClearance;
      intent.offset = (station: number) => {
        const shift = pathOffsetAt(blend, station);
        if (shift === 0) return 0;
        const l = forks.targetL(station, own);
        return heldLateral(l, shift, forks.roadEdges(station, own.exit), margin) - l;
      };
      driving.target = (station: number) => forks.targetL(station, intent);
      driven.sighting.target = driving.target(driven.sighting.s);
    }
    return plannedDrivingInput(road, driven.vehicle, driver, driving.target, driving.workspace, plan.target);
  };
  return Object.freeze({
    /** Drivers see the present vehicles and the standing objects ahead as they stand at the step's start. */
    observe: () => observe(),
    /**
     * A driver's input this step, for the present vehicle `driven` that its driver drives. Its intent is first carried
     * to the occurrence it is in, a racing line driver's too, whose adjacent lanes are read there. Where its lane ends
     * within its lookahead — at a seam, or at a standing object in it — it first merges one lane toward the lane that
     * continues there (beside an object, an adjacent lane that does not end) when that lane is free; while its lane
     * still ends at a seam, the seam is its plan's terminal, so it slows to stop there short of `terminalClearance`
     * until it can merge, and an object is its vehicle ahead. Then its plan, which the vehicle ahead in its lane
     * constrains, and that plan's input. A merge (a new lane function, since the driver caches by lane) rewrites the
     * lateral the driver's sighting is heading for at once, so drivers deciding later in the same step see it; position
     * and speed keep their values from the step's start. A driver of the racing line instead drives its line with its
     * path offset.
     */
    drive(driven: PresentVehicle, domain: DrivingDomain = window): DrivingInput {
      const driving = driven.driving!;
      const { intent, driver } = driving;
      const s = driven.vehicle.course.s;
      forks.carry(intent, s);
      if (driving.offset) return driveLine(driven, driving.offset, domain);
      const ahead = s + PLANNED_DRIVER.lookahead;
      // Where `lane` ends within the lookahead: at a seam across which it does not continue, or at a standing object in
      // it, whichever comes first.
      const seamEnd = (lane: number) => {
        probe.lane = lane;
        probe.at = intent.at;
        probe.exit = intent.exit;
        probe.width = intent.width;
        return forks.laneEnd(s, ahead, probe);
      };
      const objectEnd = (lane: number, seam: { readonly s: number } | null) =>
        following.standingEnd(intent, lane, driven.sighting, sightings, seam?.s ?? ahead);
      const ends = (lane: number) => {
        const seam = seamEnd(lane);
        return seam !== null || objectEnd(lane, seam) !== null;
      };
      const endOf = (lane: number) => {
        const seam = seamEnd(lane);
        const object = objectEnd(lane, seam);
        if (object === null) return seam && { s: seam.s, merge: seam.merge, seam: true };
        // A lane a standing object ends is left toward an adjacent lane of its road that does not end, the left one first.
        let merge: number | null = null;
        for (const candidate of forks.adjacentLanes(s, lane, intent.exit, intent.width))
          if (merge === null && !ends(candidate)) merge = candidate;
        return { s: object, merge, seam: false };
      };
      let end = endOf(intent.lane);
      if (end !== null && end.merge !== null && following.merge(intent, driven.sighting, sightings, end.merge)) {
        driving.target = (station: number) => forks.targetL(station, intent);
        driven.sighting.target = driving.target(driven.sighting.s);
        end = endOf(intent.lane);
      }
      // A seam where the lane ends is a terminal of the plan; a standing object is the vehicle ahead in the lane.
      const planned = end?.seam ? drivingDomainBefore(domain, end.s, laneDomain) : domain;
      const plan = planDriving(
        road,
        driven.vehicle,
        driver,
        driving.target,
        driving.workspace,
        planned,
        following.leader(intent, driven.sighting, sightings),
        false,
      );
      return plannedDrivingInput(road, driven.vehicle, driver, driving.target, driving.workspace, plan.target);
    },
    /**
     * How fast a vehicle of `model` appears at (s, its intent's lane centre) under `driver`, seeing the present vehicles
     * and standing objects as they stand now: its planned speed there behind the vehicle ahead in that lane, and short of
     * that lane's end when it ends within the lookahead. Null when a driven vehicle behind in that lane whose driver does
     * not pass could not stop for it at that speed, so the appearance waits or passes like an occupied one. Drivers that
     * pass move over or match its speed; the player avoids it.
     */
    appearanceSpeed(model: VehicleModel, s: number, intent: LaneIntent, driver: PlannedDriver): number | null {
      observe(s);
      const lane = (station: number) => forks.targetL(station, intent);
      const laneEnd = forks.laneEnd(s, s + PLANNED_DRIVER.lookahead, intent)?.s ?? null;
      const domain = laneEnd === null ? window : drivingDomainBefore(window, laneEnd, appearanceDomain);
      Object.assign(appearing, {
        s,
        l: lane(s),
        length: model.compiledVehicle.footprint,
        width: model.compiledVehicle.footprint,
        speed: 0,
        target: lane(s),
        driver,
      });
      appearing.speed = plannedSpeed(road, s, driver, lane, domain, following.leader(intent, appearing, sightings));
      return following.followersCanStop(appearing, intent, intent.lane, sightings, (other) => !other.passes)
        ? appearing.speed
        : null;
    },
  });
}
