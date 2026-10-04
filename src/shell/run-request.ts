import type { SeriesCourse } from '../content/series-catalog.js';
import type { SessionRequest } from '../race/session-configuration.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { PlayerRecord } from './player-record.js';

/** A requested run: its course and its Session request, which the run's assembly admits. */
export type RunRequest = SessionRequest & { readonly courseId: string };

/** Every mode's display name, in the order SELECT MODE lists them: the one source of mode names. */
export const MODE_NAMES: Readonly<Record<RunRequest['mode'], string>> = Object.freeze({
  ARCADE: 'ARCADE',
  FREE_PLAY: 'FREE PLAY',
  TIME_TRIAL: 'TIME TRIAL',
});

/** The player record's color for `vehicle` when its sprite set has it, else null. */
export function recordedColor(player: PlayerRecord, vehicle: CompiledVehicleDefinition): string | null {
  const color = player.settings.vehicleColors[vehicle.compiledVehicle.id];
  return color !== undefined && spriteSetHasColor(vehicle.spriteSet, color) ? color : null;
}

/**
 * The run a URL names for `courseId`. Absent parameters take the defaults: ARCADE on a series course, else FREE PLAY;
 * the series' first vehicle in ARCADE, else the parameter's or the first catalog vehicle; one lap, no rivals, the
 * pool of the player's vehicle form and no traffic; the player record's color. The mode must be one of the three, and a
 * `rivals`, `pool` or `traffic` parameter is an error in TIME TRIAL. Every value is admitted with the run
 * (`compileSessionConfiguration`), like a request from the selection screens.
 */
export function readUrlRunRequest(
  params: URLSearchParams,
  courseId: string,
  arcade: SeriesCourse | null,
  vehicles: readonly CompiledVehicleDefinition[],
  freePlay: FreePlayRules,
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
  // An unknown vehicle has no defaults of its own; the run's admission rejects it.
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
  const choice = { courseId, vehicleId, color: vehicle ? recordedColor(player, vehicle) : null };
  const lapCount = Number(params.get('laps') ?? 1);
  if (mode === 'ARCADE') return Object.freeze({ ...choice, mode });
  if (mode === 'TIME_TRIAL') return Object.freeze({ ...choice, mode, lapCount });
  return Object.freeze({
    ...choice,
    mode,
    lapCount,
    rivalCount: Number(params.get('rivals') ?? 0),
    rivalPool: params.get('pool') ?? (vehicle ? formPool(freePlay, vehicle) : freePlay.rivalPools[0]!).id,
    traffic: params.get('traffic') ?? NO_TRAFFIC,
  });
}
