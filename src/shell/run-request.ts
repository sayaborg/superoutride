import type { SeriesCatalog } from '../content/series-catalog.js';
import type { SessionRequest } from '../race/session-configuration.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { PlayerRecord } from './player-record.js';
import type { MusicCatalog } from '../content/recording-catalog.js';

/**
 * A requested run: where it is driven, its Session request, which the run's assembly admits, and its track. ARCADE names
 * a series and one of its classes, and the class names the course; FREE PLAY and TIME TRIAL name the course. The track,
 * like the color, is neither a Session rule nor a record condition.
 */
export type RunRequest = SessionRequest &
  (
    | { readonly mode: 'ARCADE'; readonly seriesId: string; readonly classId: string }
    | { readonly mode: Exclude<SessionRequest['mode'], 'ARCADE'>; readonly courseId: string }
  ) & { readonly track: string };

/** The player record's latest track when it is delivered, else the first track. */
export function latestTrack(player: PlayerRecord, music: MusicCatalog): string {
  const latest = player.settings.latestSelections.music;
  return music.find((track) => track.id === latest)?.id ?? music[0]!.id;
}

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
 * The run a URL names, or null when it names none. `series` and `class` name an ARCADE run of that class; `course`
 * names a FREE PLAY or TIME TRIAL run on that course. A URL naming both, a class without its series (or the reverse),
 * or a mode its place does not offer is an error. Absent parameters take the defaults: ARCADE for a class, FREE PLAY on
 * a course; the class's first vehicle in ARCADE, else the parameter's or the first catalog vehicle; one lap, no rivals,
 * the pool of the player's vehicle form and no traffic; the player record's color and latest track. A `rivals`, `pool`
 * or `traffic` parameter is an error in TIME TRIAL. Every value is admitted with the run
 * (`compileSessionConfiguration`), like a request from the selection screens.
 */
export function readUrlRunRequest(
  params: URLSearchParams,
  series: SeriesCatalog,
  vehicles: readonly CompiledVehicleDefinition[],
  freePlay: FreePlayRules,
  player: PlayerRecord,
  music: MusicCatalog,
): RunRequest | null {
  const courseId = params.get('course'),
    seriesId = params.get('series'),
    classId = params.get('class');
  if (courseId === null && seriesId === null && classId === null) return null;
  if (courseId !== null && (seriesId !== null || classId !== null))
    throw new RangeError('A run names a course, or a series and class, not both');
  if ((seriesId === null) !== (classId === null)) throw new RangeError('An ARCADE run names a series and a class');
  const arcade = seriesId !== null ? series.seriesClass(seriesId, classId!) : null;
  if (seriesId !== null && !arcade) throw new RangeError(`Unknown class ${classId} of series ${seriesId}`);
  const mode = params.get('mode') ?? (arcade ? 'ARCADE' : 'FREE_PLAY');
  if (mode !== 'ARCADE' && mode !== 'FREE_PLAY' && mode !== 'TIME_TRIAL') throw new RangeError('Unknown Session mode');
  if ((mode === 'ARCADE') !== (arcade !== null))
    throw new RangeError(arcade ? `A class runs ARCADE alone` : 'ARCADE names a series and a class');
  if (mode === 'TIME_TRIAL' && (params.has('rivals') || params.has('pool') || params.has('traffic')))
    throw new RangeError('TIME TRIAL has no rivals and no traffic');
  const vehicleId = arcade ? arcade.vehicles[0]! : (params.get('vehicle') ?? vehicles[0]!.compiledVehicle.id);
  // An unknown vehicle has no defaults of its own; the run's admission rejects it.
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
  const choice = {
    vehicleId,
    color: vehicle ? recordedColor(player, vehicle) : null,
    track: latestTrack(player, music),
  };
  if (arcade) return Object.freeze({ ...choice, mode: 'ARCADE', seriesId: arcade.series.id, classId: arcade.id });
  const lapCount = Number(params.get('laps') ?? 1);
  if (mode === 'TIME_TRIAL') return Object.freeze({ ...choice, mode, courseId: courseId!, lapCount });
  return Object.freeze({
    ...choice,
    mode: 'FREE_PLAY',
    courseId: courseId!,
    lapCount,
    rivalCount: Number(params.get('rivals') ?? 0),
    rivalPool: params.get('pool') ?? (vehicle ? formPool(freePlay, vehicle) : freePlay.rivalPools[0]!).id,
    traffic: params.get('traffic') ?? NO_TRAFFIC,
  });
}
