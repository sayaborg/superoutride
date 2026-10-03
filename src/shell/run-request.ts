import type { SeriesCourse } from '../content/series-catalog.js';
import { compileSessionConfiguration, type SessionConfiguration } from '../race/session-configuration.js';
import {
  formPool,
  FREE_PLAY_TRAFFIC,
  FREE_PLAY_TRAFFIC_LEVELS,
  FREE_PLAY_TRAFFIC_SPEED_KILOMETERS_PER_HOUR,
  RIVAL_POOLS,
  type FreePlayTraffic,
  type RivalPool,
} from '../race/free-play-field.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { PlayerRecord } from './player-record.js';

interface RunChoice {
  readonly courseId: string;
  readonly vehicleId: string;
  /** The player's color; null for the Session's own choice (the vehicle's default, or a fixed series color). */
  readonly color: string | null;
}
/**
 * A requested run: what the player chose, and nothing else. ARCADE takes its laps, field and traffic from the series;
 * FREE PLAY chooses rivals, their pool, traffic and laps; TIME TRIAL runs alone and chooses laps.
 */
export type RunRequest =
  | (RunChoice & { readonly mode: 'ARCADE' })
  | (RunChoice & {
      readonly mode: 'FREE_PLAY';
      readonly lapCount: number;
      readonly rivalCount: number;
      readonly rivalPool: RivalPool;
      readonly traffic: FreePlayTraffic;
    })
  | (RunChoice & { readonly mode: 'TIME_TRIAL'; readonly lapCount: number });

/** A requested run's Session settings; each Session assembly adds its own seed. */
export interface RunSettings extends Omit<SessionConfiguration, 'seed'> {
  readonly vehicleId: string;
  /** The FREE PLAY rival pool; null in ARCADE and TIME TRIAL. */
  readonly rivalPool: RivalPool | null;
}

/** The player record's color for `vehicle` when its sprite set has it, else null. */
export function recordedColor(player: PlayerRecord, vehicle: CompiledVehicleDefinition): string | null {
  const color = player.settings.vehicleColors[vehicle.compiledVehicle.id];
  return color !== undefined && spriteSetHasColor(vehicle.spriteSet, color) ? color : null;
}

/**
 * The run a URL names for `courseId`. Absent parameters take the defaults: ARCADE on a series course, else FREE PLAY;
 * the series' first vehicle in ARCADE, else the parameter's or the first catalog vehicle; one lap, no rivals, the
 * pool of the player's vehicle form and no traffic; the player record's color. A `rivals`, `pool` or `traffic`
 * parameter is an error in TIME TRIAL. Values are checked when the run is assembled ({@link runSettings}).
 */
export function readUrlRunRequest(
  params: URLSearchParams,
  courseId: string,
  arcade: SeriesCourse | null,
  vehicles: readonly CompiledVehicleDefinition[],
  player: PlayerRecord,
): RunRequest {
  const mode = params.get('mode') ?? (arcade ? 'ARCADE' : 'FREE_PLAY');
  if (mode !== 'ARCADE' && mode !== 'FREE_PLAY' && mode !== 'TIME_TRIAL') throw new RangeError('Unknown Session mode');
  if (mode === 'TIME_TRIAL' && (params.has('rivals') || params.has('pool') || params.has('traffic')))
    throw new RangeError('TIME TRIAL has no rivals and no traffic');
  const vehicleId =
    mode === 'ARCADE' && arcade
      ? arcade.series.vehicles[0]!
      : (params.get('vehicle') ?? vehicles[0]!.compiledVehicle.id);
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
  if (!vehicle) throw new RangeError('Unknown Session vehicle');
  const choice = { courseId, vehicleId, color: recordedColor(player, vehicle) };
  const lapCount = Number(params.get('laps') ?? 1);
  if (mode === 'ARCADE') return Object.freeze({ ...choice, mode });
  if (mode === 'TIME_TRIAL') return Object.freeze({ ...choice, mode, lapCount });
  const pool = params.get('pool') ?? formPool(vehicle);
  if (!RIVAL_POOLS.includes(pool as RivalPool)) throw new RangeError('Unknown rival pool');
  const traffic = params.get('traffic') ?? 'OFF';
  if (!FREE_PLAY_TRAFFIC_LEVELS.includes(traffic as FreePlayTraffic)) throw new RangeError('Unknown traffic level');
  return Object.freeze({
    ...choice,
    mode,
    lapCount,
    rivalCount: Number(params.get('rivals') ?? 0),
    rivalPool: pool as RivalPool,
    traffic: traffic as FreePlayTraffic,
  });
}

/**
 * Admit a requested run against its course and the catalogs, and derive its Session settings. ARCADE needs a series
 * course and one of the series' vehicles, and has the clock and the series' laps and field. FREE PLAY and TIME TRIAL
 * take any catalog vehicle and up to the course's `maxLaps`. A color must be one of the vehicle's sprite set. Product
 * Sessions use standing starts.
 */
export function runSettings(
  request: RunRequest,
  arcade: SeriesCourse | null,
  vehicles: readonly CompiledVehicleDefinition[],
  maxLaps: number,
): RunSettings {
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === request.vehicleId);
  if (!vehicle) throw new RangeError('Unknown Session vehicle');
  if (request.color !== null && !spriteSetHasColor(vehicle.spriteSet, request.color))
    throw new RangeError('Unknown vehicle color');
  let values: { rivalCount: number; lapCount: number; timeLimit: boolean; rivalPool: RivalPool | null };
  if (request.mode === 'ARCADE') {
    if (!arcade) throw new RangeError('An untimed course has no ARCADE Session');
    if (!arcade.series.vehicles.includes(request.vehicleId)) throw new RangeError('Not a series vehicle');
    values = { rivalCount: arcade.entries.length - 1, lapCount: arcade.laps, timeLimit: true, rivalPool: null };
  } else {
    if (request.lapCount > maxLaps) throw new RangeError(`The course has at most ${maxLaps} laps`);
    values =
      request.mode === 'FREE_PLAY'
        ? { rivalCount: request.rivalCount, lapCount: request.lapCount, timeLimit: false, rivalPool: request.rivalPool }
        : { rivalCount: 0, lapCount: request.lapCount, timeLimit: false, rivalPool: null };
    if (values.rivalPool !== null && !RIVAL_POOLS.includes(values.rivalPool))
      throw new RangeError('Unknown rival pool');
  }
  // The seed is chosen per assembly, so validation uses a placeholder.
  const { seed: _seed, ...configuration } = compileSessionConfiguration({
    mode: request.mode,
    rivalCount: values.rivalCount,
    lapCount: values.lapCount,
    timeLimit: values.timeLimit,
    initialSpeed: 0,
    seed: 0,
    // ARCADE takes its series course's traffic; FREE PLAY its level's, from every vehicle; TIME TRIAL has none.
    traffic:
      request.mode === 'ARCADE'
        ? arcade!.traffic
        : request.mode === 'FREE_PLAY' && request.traffic !== 'OFF'
          ? {
              ...FREE_PLAY_TRAFFIC[request.traffic],
              vehicles: vehicles.map((v) => v.compiledVehicle.id),
              speedKilometersPerHour: FREE_PLAY_TRAFFIC_SPEED_KILOMETERS_PER_HOUR,
            }
          : null,
  });
  return Object.freeze({ ...configuration, vehicleId: request.vehicleId, rivalPool: values.rivalPool });
}
