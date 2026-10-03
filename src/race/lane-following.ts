import type { DriverIntent, TargetCarriageway } from './course-fork-field.js';
import type { RouteFootprint } from './body-contacts.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';

/** A present vehicle as drivers see it: its route footprint and speed (m/s). The race writes it; drivers only read. */
export interface VehicleSighting extends RouteFootprint {
  readonly speed: number;
}

/** A driver's intent whose lane the driver itself changes. */
export interface LaneIntent extends DriverIntent {
  lane: number;
}

/**
 * Lane following for drivers, over the race's read-only sightings of the present vehicles. A driver whose lane holds,
 * within its following distance, a vehicle slower than its own planned speed moves to a free adjacent lane (the left
 * one first) and stays there; with neither adjacent lane free it follows that vehicle at its speed.
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
  /**
   * The driver's speed limit for this step (Infinity when it need not follow), changing `intent.lane` when it moves to a
   * free adjacent lane. `self` is the driver's own sighting in `sightings`.
   */
  return (
    intent: LaneIntent,
    self: VehicleSighting,
    plannedSpeed: number,
    sightings: readonly VehicleSighting[],
  ): number => {
    let leader: VehicleSighting | null = null;
    for (const other of sightings)
      if (
        other !== self &&
        other.s > self.s &&
        (!leader || other.s < leader.s) &&
        inLane(self, intent.exit, intent.lane, other)
      )
        leader = other;
    if (!leader || leader.speed >= plannedSpeed || leader.s - self.s >= followDistance(self, leader)) return Infinity;
    const lanes = forks.targetCarriageway(self.s, intent.exit).road.lanes;
    const lane = Math.min(intent.lane, lanes - 1);
    for (const candidate of [lane - 1, lane + 1])
      if (candidate >= 0 && candidate < lanes && free(self, intent.exit, candidate, sightings)) {
        intent.lane = candidate;
        return Infinity;
      }
    return leader.speed;
  };
}
