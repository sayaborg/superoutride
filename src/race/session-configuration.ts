import { SESSION_RULE_LIMITS, type TrafficSettings } from '../course/session-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import { NO_TRAFFIC, type FreePlayRules, type RivalPoolRule } from '../content/free-play-rules.js';

/** The most rivals a grid of `slots` holds: every slot but the player's. */
export function gridRivalCapacity(slots: number): number {
  return slots - 1;
}

interface SessionChoice {
  readonly vehicleId: string;
  /** The player's color; null for the Session's own choice (the vehicle's default, or a fixed series color). */
  readonly color: string | null;
}

/**
 * A requested Session: what the player chose, and nothing else. ARCADE takes its laps, field and traffic from its
 * class; FREE PLAY chooses rivals, their pool, traffic and laps; TIME TRIAL runs alone and chooses laps.
 */
export type SessionRequest =
  | (SessionChoice & { readonly mode: 'ARCADE' })
  | (SessionChoice & {
      readonly mode: 'FREE_PLAY';
      readonly lapCount: number;
      readonly rivalCount: number;
      /** A rival pool ID of the FREE PLAY rules. */
      readonly rivalPool: string;
      /** OFF, or a TRAFFIC level ID of the FREE PLAY rules. */
      readonly traffic: string;
    })
  | (SessionChoice & { readonly mode: 'TIME_TRIAL'; readonly lapCount: number });

/** A Session's admitted rules: what it runs, before its seed is drawn. */
export interface SessionConfiguration extends SessionChoice {
  /** TIME TRIAL runs alone: no rivals and no clock. */
  readonly mode: SessionRequest['mode'];
  /** Opponents only; the player is not included. */
  readonly rivalCount: number;
  /** The FREE PLAY rival pool; null in ARCADE and TIME TRIAL. */
  readonly rivalPool: RivalPoolRule | null;
  readonly lapCount: number;
  /** The checkpoint clock; ARCADE only, FREE PLAY and TIME TRIAL have none. */
  readonly timeLimit: boolean;
  /** m/s along the grid slot's road tangent for every competitor at spawn; finite, negative allowed. The product uses 0. */
  readonly initialSpeed: number;
  /** Traffic, or null for none; TIME TRIAL has none. ARCADE takes its class's. */
  readonly traffic: TrafficSettings | null;
}

/**
 * Admit a requested Session against its course, its class (`arcade`, null on an untimed course), the vehicle
 * catalog and FREE PLAY's rules, and derive its rules: the one admission and derivation of every request. The vehicle must be a
 * catalog vehicle and the color one of its sprite set. ARCADE needs a class and one of the class's vehicles
 * and takes the class's field, laps and traffic with the checkpoint clock. FREE PLAY and TIME TRIAL take up to the
 * course's `maxLaps`; FREE PLAY's rivals fit the grid, its pool and traffic level are its rules', and its traffic
 * draws from every catalog vehicle at their traffic speed. `initialSpeed` is the start speed (the product's is 0).
 */
export function compileSessionConfiguration(
  request: SessionRequest,
  course: Pick<CompiledCourse, 'rules' | 'gates'>,
  arcade: SeriesClass | null,
  catalog: { readonly vehicles: readonly CompiledVehicleDefinition[]; readonly freePlay: FreePlayRules },
  initialSpeed = 0,
): SessionConfiguration {
  const { vehicles, freePlay } = catalog;
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === request.vehicleId);
  if (!vehicle) throw new RangeError('Unknown Session vehicle');
  if (request.color !== null && !spriteSetHasColor(vehicle.spriteSet, request.color))
    throw new RangeError('Unknown vehicle color');
  if (!Number.isFinite(initialSpeed)) throw new RangeError('Session initialSpeed must be finite');
  const choice = { vehicleId: request.vehicleId, color: request.color, initialSpeed };
  let rules: Pick<SessionConfiguration, 'mode' | 'rivalCount' | 'rivalPool' | 'lapCount' | 'timeLimit' | 'traffic'>;
  if (request.mode === 'ARCADE') {
    if (!arcade) throw new RangeError('An untimed course has no ARCADE Session');
    if (!arcade.vehicles.includes(request.vehicleId)) throw new RangeError('ARCADE requires a vehicle of its class');
    rules = {
      mode: 'ARCADE',
      rivalCount: arcade.entries.length - 1,
      rivalPool: null,
      lapCount: arcade.laps,
      timeLimit: true,
      traffic: arcade.traffic,
    };
  } else {
    const { lapCount } = request;
    if (!Number.isInteger(lapCount) || lapCount < 1 || lapCount > course.rules.maxLaps)
      throw new RangeError(`Session lapCount must be an integer within 1..${course.rules.maxLaps}`);
    if (request.mode === 'TIME_TRIAL')
      rules = { mode: 'TIME_TRIAL', rivalCount: 0, rivalPool: null, lapCount, timeLimit: false, traffic: null };
    else {
      const { rivalCount, rivalPool, traffic } = request;
      if (!Number.isInteger(rivalCount) || rivalCount < 0 || rivalCount > SESSION_RULE_LIMITS.rivals)
        throw new RangeError(`Session rivalCount must be an integer within 0..${SESSION_RULE_LIMITS.rivals}`);
      const pool = freePlay.rivalPools.find((candidate) => candidate.id === rivalPool);
      if (!pool) throw new RangeError('Unknown rival pool');
      const level = freePlay.traffic.find((candidate) => candidate.id === traffic);
      if (!level && traffic !== NO_TRAFFIC) throw new RangeError('Unknown traffic level');
      rules = {
        mode: 'FREE_PLAY',
        rivalCount,
        rivalPool: pool,
        lapCount,
        timeLimit: false,
        // FREE PLAY traffic is its level's, drawn from every vehicle.
        traffic: level
          ? Object.freeze({
              density: level.density,
              vehicles: Object.freeze(vehicles.map((v) => v.compiledVehicle.id)),
              speedKilometersPerHour: freePlay.trafficSpeedKilometersPerHour,
            })
          : null,
      };
    }
  }
  // The grid holds the rivals that start from it: in ARCADE the entries with a slot, not those appearing ahead.
  const gridRivals =
    rules.mode === 'ARCADE' ? arcade!.entries.filter((entry) => entry.slot !== null).length - 1 : rules.rivalCount;
  if (gridRivals > gridRivalCapacity(course.gates.grid.length))
    throw new RangeError('The authored grid cannot hold this field');
  return Object.freeze({ ...choice, ...rules });
}
