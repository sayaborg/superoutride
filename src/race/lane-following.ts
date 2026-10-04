import type { DriverIntent, TargetCarriageway } from './course-fork-field.js';
import type { RouteFootprint } from './body-contacts.js';
import {
  createSteeringPath,
  ENVELOPE_DRIVER,
  envelopeCanFollow,
  steeringLookahead,
  steeringPathLateral,
  traceSteeringPath,
  type DrivingDomain,
  type EnvelopeDriver,
  type EnvelopeLeader,
} from './envelope-driver.js';

/**
 * A present vehicle as drivers see it: its route footprint, speed (m/s), travel direction, the lateral it is heading
 * for at its station (`target`: its driver's target lateral, or its own lateral while the player drives it) and the
 * driver driving it (null while the player drives it, and for a standing object). The race writes it; drivers only
 * read.
 */
export interface VehicleSighting extends RouteFootprint {
  readonly speed: number;
  /** The direction it travels in relative to the road (rad, positive toward greater lateral). */
  readonly heading: number;
  readonly target: number;
  readonly driver: EnvelopeDriver | null;
}

/**
 * Whether a vehicle at lateral `l` heading for lateral `target` is in a lane for a driver: either lateral is nearer the
 * driver's lane centre at the vehicle's station (`centre`) than `halfWidths`, half the two vehicles' widths. A vehicle
 * thus occupies both the lanes it overlaps where it is and the lane it is heading for.
 */
export function occupiesLane(l: number, target: number, centre: number, halfWidths: number): boolean {
  return Math.abs(l - centre) < halfWidths || Math.abs(target - centre) < halfWidths;
}

/** A driver's intent whose lane the driver itself changes. */
export interface LaneIntent extends DriverIntent {
  lane: number;
  ordinal: number;
}

/**
 * Lane following for drivers, over the race's read-only sightings of the present vehicles. It owns the three judgements
 * every driver decision reads — whether a vehicle occupies a lane, which vehicle is ahead in a lane, and whether the
 * driven vehicles behind in a lane can stop for one ahead — and the decisions built from them: merging where a lane ends
 * and moving to a faster free lane.
 */
export function createLaneFollowing(
  forks: {
    targetL(s: number, intent: DriverIntent): number;
    targetCarriageway(s: number, exit: DriverIntent['exit']): TargetCarriageway;
  },
  window: Pick<DrivingDomain, 'end'>,
) {
  const { followSeconds } = ENVELOPE_DRIVER;
  const probe = { lane: 0, ordinal: 0, exit: (() => 0) as DriverIntent['exit'] };
  // The centre of `lane` of the driver's intent at station s.
  const centre = (intent: DriverIntent, lane: number, s: number) => {
    probe.lane = lane;
    probe.ordinal = intent.ordinal;
    probe.exit = intent.exit;
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
    const lanes = forks.targetCarriageway(self.s, intent.exit).road.lanes;
    let least = Infinity;
    for (const candidate of [lane - 1, lane + 1]) {
      if (candidate < 0 || candidate >= lanes) continue;
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
   * driver's steering path into it meets. A driver that passes keeps its escape gap behind it. Null when none.
   */
  const ahead = (
    self: VehicleSighting,
    intent: DriverIntent,
    lane: number,
    sightings: readonly VehicleSighting[],
  ): EnvelopeLeader | null => {
    trace(path, self, intent, lane, false);
    let nearest: VehicleSighting | null = null;
    for (const other of sightings) {
      if (other === self || other.s <= self.s || (nearest && other.s >= nearest.s)) continue;
      if (inLane(self, intent, lane, other) || meets(path, self, intent, lane, other)) nearest = other;
    }
    if (!nearest) return null;
    leader.s = nearest.s;
    leader.speed = nearest.speed;
    leader.clearance = (self.length + nearest.length) / 2;
    leader.escape = self.driver?.passes ? escape(self, intent, lane, nearest) : 0;
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
    counts: (driver: EnvelopeDriver) => boolean,
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
        if (!envelopeCanFollow(other.s, other.speed, other.driver.braking, stopping)) return false;
      }
    return true;
  };
  return Object.freeze({
    /** The vehicle ahead in the driver's lane, or null. `self` is the driver's own sighting in `sightings`. */
    leader: (intent: LaneIntent, self: VehicleSighting, sightings: readonly VehicleSighting[]) =>
      ahead(self, intent, intent.lane, sightings),
    followersCanStop,
    /**
     * Merge the driver, whose lane ends ahead, one lane toward lane `toward` (the lane that continues where its own
     * ends) when that lane is free and every driven vehicle behind in it can stop for the driver. Returns whether it
     * moved.
     */
    merge(intent: LaneIntent, self: VehicleSighting, sightings: readonly VehicleSighting[], toward: number): boolean {
      const candidate = intent.lane + Math.sign(toward - intent.lane);
      if (
        candidate < 0 ||
        !free(self, intent, candidate, sightings) ||
        !followersCanStop(self, intent, candidate, sightings, () => true)
      )
        return false;
      intent.lane = candidate;
      return true;
    },
    /**
     * Move the driver, whose plan behind its own lane's vehicle allows `target`, to the free adjacent lane of the
     * Carriageway it follows where its plan allows the most speed (`speedBehind` of that lane's vehicle ahead), when that
     * exceeds `target` by more than the passing margin; the left one on a tie. A lane that `ends` ahead does not qualify.
     * Returns the speed its plan allows in the new lane, or null when no lane qualifies.
     */
    moveOver(
      intent: LaneIntent,
      self: VehicleSighting,
      sightings: readonly VehicleSighting[],
      target: number,
      speedBehind: (leader: EnvelopeLeader | null) => number,
      ends: (lane: number) => boolean,
    ): number | null {
      const lanes = forks.targetCarriageway(self.s, intent.exit).road.lanes;
      const lane = Math.min(intent.lane, lanes - 1);
      let best = -1,
        bestSpeed = target + ENVELOPE_DRIVER.passingMargin;
      for (const candidate of [lane - 1, lane + 1]) {
        if (candidate < 0 || candidate >= lanes || ends(candidate) || !free(self, intent, candidate, sightings))
          continue;
        const speed = speedBehind(ahead(self, intent, candidate, sightings));
        if (speed > bestSpeed) [best, bestSpeed] = [candidate, speed];
      }
      if (best < 0) return null;
      intent.lane = best;
      return bestSpeed;
    },
  });
}
