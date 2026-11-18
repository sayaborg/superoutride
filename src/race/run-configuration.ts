import type { TrafficSettings } from '../course/run-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseStartGrid } from '../course/compiler/course-rules.js';
import type { ClassRules } from '../content/series-catalog.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';

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
 * A requested run: what the player chose, and nothing else. RACE takes its laps, field and traffic from its class;
 * TIME ATTACK runs its class's course alone.
 */
export type RunRulesRequest = PlayerChoice & { readonly mode: 'RACE' | 'TIME_ATTACK' };

/** A run's admitted rules: what it runs, before its seed is drawn. */
export interface RunConfiguration extends PlayerChoice {
  /** TIME ATTACK runs alone: no rivals, no traffic and no clock. */
  readonly mode: RunRulesRequest['mode'];
  /** Opponents only; the player is not included. */
  readonly rivalCount: number;
  /** The laps to the finish; null for a run without a finish, TIME ATTACK on a CIRCUIT, which the player ends. */
  readonly lapCount: number | null;
  /** The checkpoint clock; a RACE whose class has a margin, never TIME ATTACK. */
  readonly timeLimit: boolean;
  /** m/s along the grid slot's road tangent for every competitor at spawn; finite, negative allowed. The product uses 0. */
  readonly initialSpeed: number;
  /** Traffic, or null for none; TIME ATTACK has none. RACE takes its class's. */
  readonly traffic: TrafficSettings | null;
  /** How the field starts: together from the grid, or CHASE (RACE only, its class's). */
  readonly start: ClassRules['start'];
}

/**
 * Admit a requested run against its course, its class on that course (`classOnCourse`) and the vehicle catalog, and
 * derive its rules: the one admission and derivation of every request. The vehicle must be one of the class's and the
 * color one of its sprite set. RACE takes the class's field, laps and traffic with its clock; TIME ATTACK runs alone,
 * without traffic or clock, the class's laps to a finish on a LINEAR course and without a finish on a CIRCUIT. The
 * field's grid entries fit the grid it starts from. `initialSpeed` is the start speed (the product's is 0).
 */
export function compileRunConfiguration(
  request: RunRulesRequest,
  course: Pick<CompiledCourse, 'type' | 'rules' | 'gates'>,
  runClass: ClassRules,
  catalog: { readonly vehicles: readonly CompiledVehicleDefinition[] },
  initialSpeed = 0,
): RunConfiguration {
  const { vehicles } = catalog;
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === request.vehicleId);
  if (!vehicle) throw new RangeError('Unknown run vehicle');
  if (request.color !== null && !spriteSetHasColor(vehicle.spriteSet, request.color))
    throw new RangeError('Unknown vehicle color');
  if (!Number.isFinite(initialSpeed)) throw new RangeError('Run initialSpeed must be finite');
  if (!runClass.vehicles.includes(request.vehicleId))
    throw new RangeError('A class run requires a vehicle of its class');
  const choice = { vehicleId: request.vehicleId, color: request.color, initialSpeed };
  const rules: Pick<RunConfiguration, 'mode' | 'rivalCount' | 'lapCount' | 'timeLimit' | 'traffic' | 'start'> =
    request.mode === 'RACE'
      ? {
          mode: 'RACE',
          rivalCount: runClass.entries.length - 1,
          lapCount: runClass.laps,
          // A class without a margin races without a clock.
          timeLimit: runClass.timeMargin !== null,
          traffic: runClass.traffic,
          start: runClass.start,
        }
      : {
          mode: 'TIME_ATTACK',
          rivalCount: 0,
          lapCount: course.type === 'CIRCUIT' ? null : runClass.laps,
          timeLimit: false,
          traffic: null,
          start: 'grid',
        };
  // The grid holds the rivals that start from it: the entries with a slot, not those appearing ahead, on the grid of
  // the class's field.
  const formOf = (id: string) => vehicles.find((v) => v.compiledVehicle.id === id)!.listing.form;
  const slots = courseStartGrid(
    course.gates,
    runClass.entries.every((entry) => formOf(entry.vehicle) === 'bike'),
  ).length;
  const gridRivals = rules.mode === 'RACE' ? runClass.entries.filter((entry) => entry.slot !== null).length - 1 : 0;
  if (gridRivals > gridRivalCapacity(slots)) throw new RangeError('The authored grid cannot hold this field');
  return Object.freeze({ ...choice, ...rules });
}
