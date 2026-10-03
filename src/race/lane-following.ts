import type { DriverIntent, TargetCarriageway } from './course-fork-field.js';
import type { RouteFootprint } from './body-contacts.js';
import { ENVELOPE_DRIVER, type EnvelopeLeader } from './envelope-driver.js';

/** A present vehicle as drivers see it: its route footprint and speed (m/s). The race writes it; drivers only read. */
export interface VehicleSighting extends RouteFootprint {
  readonly speed: number;
}

/** A driver's intent whose lane the driver itself changes. */
export interface LaneIntent extends DriverIntent {
  lane: number;
}

/**
 * Lane following for drivers, over the race's read-only sightings of the present vehicles. The vehicle ahead in a
 * driver's lane constrains its plan; when that constraint lowers the driver's planned speed, the driver moves to the
 * free adjacent lane where its plan allows the most speed, if that beats its own lane by more than the speed deadzone,
 * and otherwise follows within its lane.
 */
export function createLaneFollowing(forks: {
  targetL(s: number, intent: DriverIntent): number;
  targetCarriageway(s: number, exit: DriverIntent['exit']): TargetCarriageway;
}) {
  const { followSeconds } = ENVELOPE_DRIVER;
  const probe = { lane: 0, exit: (() => 0) as DriverIntent['exit'] };
  // Whether `other`'s footprint overlaps, side to side, the driver's width centred in `lane` at other's station.
  const inLane = (self: VehicleSighting, exit: DriverIntent['exit'], lane: number, other: VehicleSighting) => {
    probe.lane = lane;
    probe.exit = exit;
    return Math.abs(other.l - forks.targetL(other.s, probe)) < (other.width + self.width) / 2;
  };
  // Half their lengths plus the follower's speed times the following time.
  const followDistance = (follower: VehicleSighting, leader: VehicleSighting) =>
    (follower.length + leader.length) / 2 + follower.speed * followSeconds;
  const free = (
    self: VehicleSighting,
    exit: DriverIntent['exit'],
    lane: number,
    sightings: readonly VehicleSighting[],
  ) => {
    for (const other of sightings) {
      if (other === self || !inLane(self, exit, lane, other)) continue;
      const ds = other.s - self.s;
      if (ds > -followDistance(other, self) && ds < followDistance(self, other)) return false;
    }
    return true;
  };
  // The leader record reused for the driver's plan.
  const leader = { s: 0, speed: 0, clearance: 0 };
  // The vehicle ahead in `lane` as a plan reads it — the nearest one ahead whose footprint overlaps the driver's width
  // centred in that lane — or null.
  const leaderIn = (
    self: VehicleSighting,
    exit: DriverIntent['exit'],
    lane: number,
    sightings: readonly VehicleSighting[],
  ): EnvelopeLeader | null => {
    let nearest: VehicleSighting | null = null;
    for (const other of sightings)
      if (other !== self && other.s > self.s && (!nearest || other.s < nearest.s) && inLane(self, exit, lane, other))
        nearest = other;
    if (!nearest) return null;
    leader.s = nearest.s;
    leader.speed = nearest.speed;
    leader.clearance = (self.length + nearest.length) / 2;
    return leader;
  };
  return Object.freeze({
    /** The vehicle ahead in the driver's lane, or null. `self` is the driver's own sighting in `sightings`. */
    leader: (intent: LaneIntent, self: VehicleSighting, sightings: readonly VehicleSighting[]) =>
      leaderIn(self, intent.exit, intent.lane, sightings),
    /**
     * Move the driver, whose plan behind its own lane's vehicle allows `target`, to the free adjacent lane of the
     * Carriageway it follows where its plan allows the most speed (`speedBehind` of that lane's vehicle ahead), when that
     * exceeds `target` by more than the speed deadzone; the left one on a tie. Returns the speed its plan allows in the
     * new lane, or null when no lane qualifies.
     */
    moveOver(
      intent: LaneIntent,
      self: VehicleSighting,
      sightings: readonly VehicleSighting[],
      target: number,
      speedBehind: (leader: EnvelopeLeader | null) => number,
    ): number | null {
      const lanes = forks.targetCarriageway(self.s, intent.exit).road.lanes;
      const lane = Math.min(intent.lane, lanes - 1);
      let best = -1,
        bestSpeed = target + ENVELOPE_DRIVER.speedDeadzone;
      for (const candidate of [lane - 1, lane + 1]) {
        if (candidate < 0 || candidate >= lanes || !free(self, intent.exit, candidate, sightings)) continue;
        const speed = speedBehind(leaderIn(self, intent.exit, candidate, sightings));
        if (speed > bestSpeed) [best, bestSpeed] = [candidate, speed];
      }
      if (best < 0) return null;
      intent.lane = best;
      return bestSpeed;
    },
  });
}
