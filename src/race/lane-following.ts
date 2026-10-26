import { LINE, type DriverIntent } from './course-fork-field.js';
import type { RouteFootprint } from './body-contacts.js';
import {
  canFollow,
  createSteeringPath,
  PLANNED_DRIVER,
  steeringLookahead,
  steeringPathLateral,
  steeringPathReach,
  traceSteeringPath,
  type DriverLeader,
  type DrivingDomain,
  type PlannedDriver,
} from './planned-driver.js';

/**
 * A present vehicle as drivers see it: its route footprint, speed (m/s), travel direction, the lateral it is heading
 * for at its station (`target`: its driver's target lateral, or its own lateral while the player drives it) and the
 * driver driving it (null while the player drives it, and for a standing object), and whether it is a standing
 * object. The race writes it; drivers only read.
 */
export interface VehicleSighting extends RouteFootprint {
  readonly speed: number;
  /** The direction it travels in relative to the road (rad, positive toward greater lateral). */
  readonly heading: number;
  readonly target: number;
  readonly driver: PlannedDriver | null;
  /** Whether it is a standing roadside object. */
  readonly standing: boolean;
}

/**
 * Whether a vehicle at lateral `l` heading for lateral `target` is in a lane for a driver: either lateral is nearer the
 * driver's lane centre at the vehicle's station (`centre`) than `halfWidths`, half the two vehicles' widths. A vehicle
 * thus occupies both the lanes it overlaps where it is and the lane it is heading for.
 */
export function occupiesLane(l: number, target: number, centre: number, halfWidths: number): boolean {
  return Math.abs(l - centre) < halfWidths || Math.abs(target - centre) < halfWidths;
}

/** The path offset rules' constants. */
export const PATH_OFFSET = Object.freeze({
  /**
   * Metres: what an offset keeps beyond half the two widths from a vehicle it passes or gives room to, and beyond half
   * the driver's width from the road's edge.
   */
  clearance: 0.5,
  edgeClearance: 0.3,
  /** A change of offset blends over this many seconds of the driver's speed, at least `blendLeast` metres. */
  blendSeconds: 1.5,
  blendLeast: 30,
  /** Metres: the resolution of the offset a driver heads for, so that a slowly moving target retargets seldom. */
  resolution: 0.25,
});

/**
 * A racing line driver's offset from the line: a cosine blend from `from` at route station `at` to `to` over `length`
 * metres; for each vehicle alongside, whether the driver gives it room (it came alongside later); and the pass it is
 * making, if any: the vehicle it passes, on which side (-1 left, 1 right) and from what gap.
 */
export interface PathOffset {
  from: number;
  to: number;
  at: number;
  length: number;
  readonly alongside: Map<VehicleSighting, boolean>;
  passing: { readonly vehicle: VehicleSighting; readonly side: number; readonly gap: number } | null;
}

/** The offset a blend gives at route station `s`. */
export function pathOffsetAt(offset: Pick<PathOffset, 'from' | 'to' | 'at' | 'length'>, s: number): number {
  const t = offset.length > 0 ? Math.min(1, Math.max(0, (s - offset.at) / offset.length)) : 1;
  return offset.from + ((offset.to - offset.from) * (1 - Math.cos(Math.PI * t))) / 2;
}

/** A driver's intent whose lane the driver itself changes. */
export interface LaneIntent extends DriverIntent {
  lane: number;
  at: number;
  width?: number;
}

/**
 * Lane following for drivers, over the race's read-only sightings of the present vehicles in station order. It owns the
 * three judgements every driver decision reads — whether a vehicle occupies a lane, which vehicle is ahead in a lane,
 * and whether the driven vehicles behind in a lane can stop for one ahead — and the decisions built from them: merging
 * where a lane ends and the racing line drivers' path offsets.
 */
export function createLaneFollowing(
  forks: {
    targetL(s: number, intent: DriverIntent): number;
    adjacentLanes(s: number, lane: number, exit: DriverIntent['exit'], vehicle?: number): readonly number[];
  },
  window: Pick<DrivingDomain, 'end'>,
) {
  const { followSeconds } = PLANNED_DRIVER;
  const probe: {
    lane: number;
    at: number;
    exit: DriverIntent['exit'];
    offset: DriverIntent['offset'];
    width: DriverIntent['width'];
  } = { lane: 0, at: 0, exit: () => 0, offset: undefined, width: undefined };
  // The centre of `lane` of the driver's intent at station s.
  const centre = (intent: DriverIntent, lane: number, s: number) => {
    probe.lane = lane;
    probe.at = intent.at;
    probe.exit = intent.exit;
    probe.offset = lane === intent.lane ? intent.offset : undefined;
    probe.width = intent.width;
    return forks.targetL(s, probe);
  };
  // Whether `other` occupies `lane` for the driver `self`, at other's station.
  const inLane = (self: RouteFootprint, intent: DriverIntent, lane: number, other: VehicleSighting) =>
    occupiesLane(other.l, other.target, centre(intent, lane, other.s), (other.width + self.width) / 2);
  // Half their lengths plus the follower's speed times the following time.
  const followDistance = (follower: VehicleSighting, leader: VehicleSighting) =>
    (follower.length + leader.length) / 2 + follower.speed * followSeconds;
  const free = (self: VehicleSighting, intent: DriverIntent, lane: number, sightings: readonly VehicleSighting[]) => {
    for (const other of sightings) {
      if (other === self || !inLane(self, intent, lane, other)) continue;
      const ds = other.s - self.s;
      if (ds > -followDistance(other, self) && ds < followDistance(self, other)) return false;
    }
    return true;
  };
  // The leader record reused for the driver's plan, and the steering paths drivers judge their way by.
  const leader = { s: 0, speed: 0, clearance: 0, escape: 0 };
  const path = createSteeringPath(),
    rest = createSteeringPath();
  // Trace `into`: the steering path of the driver `self` into `lane`, from its own lateral and travel direction at its
  // speed, or from rest in line with the road; the steering target holds within the resident Route.
  const trace = (
    into: ReturnType<typeof createSteeringPath>,
    self: VehicleSighting,
    intent: DriverIntent,
    lane: number,
    atRest: boolean,
  ) =>
    traceSteeringPath(
      into,
      self.s,
      self.l,
      atRest ? 0 : self.heading,
      steeringLookahead(atRest ? 0 : self.speed),
      (s) => centre(intent, lane, Math.min(s, window.end)),
    );
  // Whether `traced` keeps nearer than half the two widths to `other` side to side anywhere over the stations where their
  // footprints overlap lengthwise; beyond the traced distance the path is the lane's centre.
  const meets = (
    traced: ReturnType<typeof createSteeringPath>,
    self: VehicleSighting,
    intent: DriverIntent,
    lane: number,
    other: VehicleSighting,
  ) => {
    const halfWidths = (self.width + other.width) / 2,
      halfLengths = (self.length + other.length) / 2;
    const onset = other.s - self.s - halfLengths;
    const a = (steeringPathLateral(traced, onset) ?? centre(intent, lane, other.s)) - other.l;
    const b = (steeringPathLateral(traced, onset + 2 * halfLengths) ?? centre(intent, lane, other.s)) - other.l;
    return Math.abs(a) < halfWidths || Math.abs(b) < halfWidths || a * b < 0;
  };
  /*
   * The escape gap behind `other` for the driver `self` in `lane`: the least footprint gap from which its steering path
   * from rest into an adjacent lane passes clear of `other` side to side and stays clear; 0 when no adjacent lane does.
   */
  const escape = (self: VehicleSighting, intent: DriverIntent, lane: number, other: VehicleSighting) => {
    const halfWidths = (self.width + other.width) / 2;
    let least = Infinity;
    for (const candidate of forks.adjacentLanes(self.s, lane, intent.exit, intent.width)) {
      trace(rest, self, intent, candidate, true);
      // The first distance after which the path stays clear.
      let clearFrom = -1;
      for (let i = rest.count - 1; i >= 0 && Math.abs(rest.laterals[i]! - other.l) >= halfWidths; i--)
        clearFrom = rest.distances[i]!;
      if (clearFrom >= 0 && Math.abs(centre(intent, candidate, other.s) - other.l) >= halfWidths)
        least = Math.min(least, clearFrom);
    }
    return Number.isFinite(least) ? least : 0;
  };
  /*
   * The vehicle ahead in `lane` for the driver `self`: the nearest one ahead that occupies that lane, or that the
   * driver's steering path into it meets. A driver keeps its escape gap behind it when it passes, or when that vehicle
   * is a standing object, which ends the lane. Null when none.
   */
  // The sighting of the latest vehicle ahead found.
  let aheadSighting: VehicleSighting | null = null;
  const ahead = (
    self: VehicleSighting,
    intent: DriverIntent,
    lane: number,
    sightings: readonly VehicleSighting[],
  ): DriverLeader | null => {
    // The steering path is traced once a vehicle within its reach needs it; beyond its reach it is the lane's centre,
    // which only a vehicle in the lane meets.
    const reach = steeringPathReach(self.speed);
    let traced = false;
    let nearest: VehicleSighting | null = null;
    for (const other of sightings) {
      if (other === self || other.s <= self.s) continue;
      let found = inLane(self, intent, lane, other);
      if (!found && other.s - self.s - (self.length + other.length) / 2 < reach) {
        if (!traced) trace(path, self, intent, lane, false);
        traced = true;
        found = meets(path, self, intent, lane, other);
      }
      if (found) {
        nearest = other;
        break;
      }
    }
    aheadSighting = nearest;
    if (!nearest) return null;
    leader.s = nearest.s;
    leader.speed = nearest.speed;
    leader.clearance = (self.length + nearest.length) / 2;
    // The escape gap matters only where it could exceed the following gap: a steering path from rest settles within its
    // reach.
    leader.escape =
      (self.driver?.passes || nearest.standing) &&
      PLANNED_DRIVER.terminalClearance + Math.max(0, nearest.speed) * followSeconds < steeringPathReach(0)
        ? escape(self, intent, lane, nearest)
        : 0;
    return leader;
  };
  /*
   * Whether every driven vehicle behind `self` in `lane` whose driver `counts` can stop for it: its plan, seeing `self`
   * ahead at its speed, would not ask more than its own speed.
   */
  const stopping = { s: 0, speed: 0, clearance: 0, escape: 0 };
  const followersCanStop = (
    self: VehicleSighting,
    intent: DriverIntent,
    lane: number,
    sightings: readonly VehicleSighting[],
    counts: (driver: PlannedDriver) => boolean,
  ) => {
    for (const other of sightings)
      if (
        other !== self &&
        other.driver !== null &&
        other.s <= self.s &&
        counts(other.driver) &&
        inLane(self, intent, lane, other)
      ) {
        stopping.s = self.s;
        stopping.speed = self.speed;
        stopping.clearance = (self.length + other.length) / 2;
        if (!canFollow(other.s, other.speed, other.driver.braking, stopping)) return false;
      }
    return true;
  };
  // The driver's path at a candidate offset from the racing line, for its judgements.
  const candidate = {
    lane: LINE,
    at: 0,
    exit: (() => 0) as DriverIntent['exit'],
    value: 0,
    offset: () => candidate.value,
  };
  /*
   * The offset from the racing line the driver `self`, which drives the line, heads for: the first of the path offset
   * rules that applies, else 0. `line` is the racing line's lateral and `path` the driver's path now, `edges` the road's
   * edges, `offset` the driver's path offset, whose memory of vehicles alongside and of its pass this updates,
   * `lapLength` is a circuit's lap (null elsewhere), and `speedBehind` gives the driver's plan behind a vehicle ahead.
   */
  const offsetTarget = (
    intent: LaneIntent,
    self: VehicleSighting,
    sightings: readonly VehicleSighting[],
    options: {
      readonly line: (s: number) => number;
      readonly path: (s: number) => number;
      readonly edges: (s: number) => { readonly left: number; readonly right: number };
      readonly offset: PathOffset;
      readonly lapLength: number | null;
      readonly speedBehind: (leader: DriverLeader | null) => number;
    },
  ): number => {
    const { line, path, edges, offset, lapLength, speedBehind } = options;
    const { alongside } = offset;
    const { passingMargin } = PLANNED_DRIVER;
    const { edgeClearance } = PATH_OFFSET;
    const clearance = (other: VehicleSighting) => (self.width + other.width) / 2 + PATH_OFFSET.clearance;
    // The lateral nearest `l` within the road's edge margin at station `s`.
    const within = (s: number, l: number) => {
      const { left, right } = edges(s);
      const margin = self.width / 2 + edgeClearance;
      return Math.min(right - margin, Math.max(left + margin, l));
    };
    // Another vehicle's station from the driver's, and how many laps it leads by on a circuit.
    const relative = (other: VehicleSighting) => {
      const difference = other.s - self.s;
      if (lapLength === null) return { ds: difference, laps: 0 };
      const laps = Math.round(difference / lapLength);
      return { ds: difference - laps * lapLength, laps };
    };
    const here = line(self.s);
    // 1. Yielding: a competitor leading by a lap or more, closing from behind: aside, away from its path, until it has
    // passed.
    for (const other of sightings) {
      if (other === self || other.standing) continue;
      const { ds, laps } = relative(other);
      const halfLengths = (self.length + other.length) / 2;
      if (laps < 1 || ds >= halfLengths || ds <= -(halfLengths + other.speed * followSeconds)) continue;
      if (ds < -halfLengths && other.speed <= self.speed) continue;
      const away =
        other.target >= here
          ? Math.min(here, other.target - clearance(other))
          : Math.max(here, other.target + clearance(other));
      return within(self.s, away) - here;
    }
    // 2. Giving room: away from each vehicle alongside that came alongside first, never toward it.
    let room: number | null = null;
    for (const other of sightings) {
      if (other === self || other.standing) continue;
      const { ds } = relative(other);
      if (Math.abs(ds) >= (self.length + other.length) / 2) {
        alongside.delete(other);
        continue;
      }
      // The vehicle ahead when they came alongside was there first and keeps its line.
      if (!alongside.has(other)) alongside.set(other, ds > 0);
      if (!alongside.get(other)) continue;
      const from: number = room ?? path(self.s);
      room = other.l >= from ? Math.min(from, other.l - clearance(other)) : Math.max(from, other.l + clearance(other));
    }
    for (const other of [...alongside.keys()]) if (!sightings.includes(other)) alongside.delete(other);
    if (room !== null) return within(self.s, room) - here;
    // 3. Passing. A pass holds while the vehicle it passes is ahead, no farther than the gap it began from plus half the
    // two lengths, and its side still lies within the road's edge margin: the target stays while it clears that vehicle,
    // else moves out to clear it.
    if (offset.passing) {
      const { vehicle, side, gap } = offset.passing;
      const { ds } = relative(vehicle);
      const lateral = vehicle.l + side * clearance(vehicle);
      if (
        sightings.includes(vehicle) &&
        ds > 0 &&
        ds <= gap + (self.length + vehicle.length) / 2 &&
        within(vehicle.s, lateral) === lateral
      )
        return side * (line(vehicle.s) + offset.to - lateral) >= 0 ? offset.to : lateral - line(vehicle.s);
      offset.passing = null;
    }
    // When the vehicle ahead on the racing line holds the plan back, the side that clears it and allows more speed by
    // the passing margin, the left on a tie.
    candidate.at = intent.at;
    candidate.exit = intent.exit;
    candidate.value = 0;
    const behind = speedBehind(ahead(self, candidate, LINE, sightings));
    const blocking = aheadSighting;
    if (blocking === null || !(behind < speedBehind(null))) return 0;
    let best = 0,
      bestSide = 0,
      bestSpeed = behind + passingMargin;
    for (const side of [-1, 1]) {
      const lateral = blocking.l + side * clearance(blocking);
      if (within(blocking.s, lateral) !== lateral) continue;
      candidate.value = lateral - line(blocking.s);
      const speed = speedBehind(ahead(self, candidate, LINE, sightings));
      if (speed > bestSpeed) [best, bestSide, bestSpeed] = [candidate.value, side, speed];
    }
    if (bestSide !== 0) offset.passing = { vehicle: blocking, side: bestSide, gap: relative(blocking).ds };
    return best;
  };
  return Object.freeze({
    offsetTarget,
    /** The vehicle ahead in the driver's lane, or null. `self` is the driver's own sighting in `sightings`. */
    leader: (intent: LaneIntent, self: VehicleSighting, sightings: readonly VehicleSighting[]) =>
      ahead(self, intent, intent.lane, sightings),
    followersCanStop,
    /**
     * The station of the nearest standing object ahead of the driver `self`, up to station `end`, that occupies `lane`:
     * where that lane ends for the driver. Null when none.
     */
    standingEnd(
      intent: DriverIntent,
      lane: number,
      self: VehicleSighting,
      sightings: readonly VehicleSighting[],
      end: number,
    ) {
      let nearest: number | null = null;
      for (const other of sightings)
        if (
          other.standing &&
          other.s > self.s &&
          other.s <= end &&
          (nearest === null || other.s < nearest) &&
          inLane(self, intent, lane, other)
        )
          nearest = other.s;
      return nearest;
    },
    /**
     * Merge the driver, whose lane ends ahead, one lane toward lane `toward` (the lane that continues where its own
     * ends) when that lane is free and every driven vehicle behind in it can stop for the driver. Returns whether it
     * moved.
     */
    merge(intent: LaneIntent, self: VehicleSighting, sightings: readonly VehicleSighting[], toward: number): boolean {
      const candidate = intent.lane + Math.sign(toward - intent.lane);
      if (
        candidate === intent.lane ||
        !free(self, intent, candidate, sightings) ||
        !followersCanStop(self, intent, candidate, sightings, () => true)
      )
        return false;
      intent.lane = candidate;
      return true;
    },
  });
}
