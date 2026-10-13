import { RUN_RULE_LIMITS, type TrafficSettings } from '../course/run-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseGridCapacity, courseStartGrid } from '../course/compiler/course-rules.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import { NO_TRAFFIC, type FreePlayRules, type RivalPoolRule } from '../content/free-play-rules.js';

/** The most rivals a grid of `slots` holds: every slot but the player's. */
export function gridRivalCapacity(slots: number): number {
  return slots - 1;
}

interface PlayerChoice {
  readonly vehicleId: string;
  /** The player's color; null for the run's own choice (the vehicle's default, or a fixed class color). */
  readonly color: string | null;
}

/**
 * A requested run: what the player chose, and nothing else. RACE takes its laps, field and traffic from its
 * class; TIME ATTACK runs its class's course alone; FREE PLAY chooses rivals, their pool, traffic and laps.
 */
export type RunRulesRequest =
  | (PlayerChoice & { readonly mode: 'RACE' })
  | (PlayerChoice & { readonly mode: 'TIME_ATTACK' })
  | (PlayerChoice & {
      readonly mode: 'FREE_PLAY';
      readonly lapCount: number;
      readonly rivalCount: number;
      /** A rival pool ID of the FREE PLAY rules. */
      readonly rivalPool: string;
      /** OFF, or a TRAFFIC level ID of the FREE PLAY rules. */
      readonly traffic: string;
    });

/** A run's admitted rules: what it runs, before its seed is drawn. */
export interface RunConfiguration extends PlayerChoice {
  /** TIME ATTACK runs alone: no rivals, no traffic and no clock. */
  readonly mode: RunRulesRequest['mode'];
  /** Opponents only; the player is not included. */
  readonly rivalCount: number;
  /** The FREE PLAY rival pool; null in RACE and TIME ATTACK. */
  readonly rivalPool: RivalPoolRule | null;
  /** The laps to the finish; null for a run without a finish, TIME ATTACK on a CIRCUIT, which the player ends. */
  readonly lapCount: number | null;
  /** The checkpoint clock; RACE only, FREE PLAY and TIME ATTACK have none. */
  readonly timeLimit: boolean;
  /** m/s along the grid slot's road tangent for every competitor at spawn; finite, negative allowed. The product uses 0. */
  readonly initialSpeed: number;
  /** Traffic, or null for none; TIME ATTACK has none. RACE takes its class's. */
  readonly traffic: TrafficSettings | null;
}

/**
 * Admit a requested run against its course, its class (`runClass`, null on an untimed course), the vehicle
 * catalog and FREE PLAY's rules, and derive its rules: the one admission and derivation of every request. The vehicle must be a
 * catalog vehicle and the color one of its sprite set. RACE and TIME ATTACK need a class and one of the class's
 * vehicles. RACE takes the class's field, laps and traffic with the checkpoint clock; TIME ATTACK runs alone, without
 * traffic or clock, the class's laps to a finish on a LINEAR or BRANCH course and without a finish on a CIRCUIT.
 * FREE PLAY takes up to the course's `maxLaps`; its rivals fit the grid, its pool and traffic level are its rules', and its traffic
 * draws from every catalog vehicle at their traffic speed. `initialSpeed` is the start speed (the product's is 0).
 */
export function compileRunConfiguration(
  request: RunRulesRequest,
  course: Pick<CompiledCourse, 'type' | 'rules' | 'gates'>,
  runClass: SeriesClass | null,
  catalog: { readonly vehicles: readonly CompiledVehicleDefinition[]; readonly freePlay: FreePlayRules },
  initialSpeed = 0,
): RunConfiguration {
  const { vehicles, freePlay } = catalog;
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === request.vehicleId);
  if (!vehicle) throw new RangeError('Unknown run vehicle');
  if (request.color !== null && !spriteSetHasColor(vehicle.spriteSet, request.color))
    throw new RangeError('Unknown vehicle color');
  if (!Number.isFinite(initialSpeed)) throw new RangeError('Run initialSpeed must be finite');
  const choice = { vehicleId: request.vehicleId, color: request.color, initialSpeed };
  let rules: Pick<RunConfiguration, 'mode' | 'rivalCount' | 'rivalPool' | 'lapCount' | 'timeLimit' | 'traffic'>;
  if (request.mode === 'RACE' || request.mode === 'TIME_ATTACK') {
    if (!runClass) throw new RangeError('A course no class runs has no RACE or TIME ATTACK run');
    if (!runClass.vehicles.includes(request.vehicleId))
      throw new RangeError('A class run requires a vehicle of its class');
    rules =
      request.mode === 'RACE'
        ? {
            mode: 'RACE',
            rivalCount: runClass.entries.length - 1,
            rivalPool: null,
            lapCount: runClass.laps,
            timeLimit: true,
            traffic: runClass.traffic,
          }
        : {
            mode: 'TIME_ATTACK',
            rivalCount: 0,
            rivalPool: null,
            lapCount: course.type === 'CIRCUIT' ? null : runClass.laps,
            timeLimit: false,
            traffic: null,
          };
  } else {
    const { lapCount } = request;
    if (!Number.isInteger(lapCount) || lapCount < 1 || lapCount > course.rules.maxLaps)
      throw new RangeError(`Run lapCount must be an integer within 1..${course.rules.maxLaps}`);
    const { rivalCount, rivalPool, traffic } = request;
    if (!Number.isInteger(rivalCount) || rivalCount < 0 || rivalCount > RUN_RULE_LIMITS.rivals)
      throw new RangeError(`Run rivalCount must be an integer within 0..${RUN_RULE_LIMITS.rivals}`);
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
  // The grid holds the rivals that start from it: in RACE the entries with a slot, not those appearing ahead, on the
  // grid of the class's field; FREE PLAY's rivals, drawn later, on either grid.
  const formOf = (id: string) => vehicles.find((v) => v.compiledVehicle.id === id)!.listing.form;
  const slots =
    rules.mode === 'RACE'
      ? courseStartGrid(
          course.gates,
          runClass!.entries.every((entry) => formOf(entry.vehicle) === 'bike'),
        ).length
      : courseGridCapacity(course.gates);
  const gridRivals =
    rules.mode === 'RACE' ? runClass!.entries.filter((entry) => entry.slot !== null).length - 1 : rules.rivalCount;
  if (gridRivals > gridRivalCapacity(slots)) throw new RangeError('The authored grid cannot hold this field');
  return Object.freeze({ ...choice, ...rules });
}
