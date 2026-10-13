import type { CompiledSeries, SeriesCatalog } from '../content/series-catalog.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { SessionRequest } from '../race/session-configuration.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { PlayerRecord } from './player-record.js';
import type { MusicCatalog } from '../content/recording-catalog.js';

/**
 * A requested run: where it is driven, its Session request, which the run's assembly admits, and its track. ARCADE and
 * TIME ATTACK name a series and one of its classes, and the class names the course; FREE PLAY names the course. The
 * track, like the color, is neither a Session rule nor a record condition; null is MUSIC OFF, a race without music.
 */
export type RunRequest = SessionRequest &
  (
    | { readonly mode: ClassMode; readonly seriesId: string; readonly classId: string }
    | { readonly mode: 'FREE_PLAY'; readonly courseId: string }
  ) & { readonly track: string | null };

/** The modes that run a class of a series. */
export type ClassMode = Exclude<SessionRequest['mode'], 'FREE_PLAY'>;

/** The latest SELECT MUSIC choice MUSIC OFF, as the player record keeps it among its latest selections. */
export const MUSIC_OFF = 'off';

/** The tracks a run offers besides MUSIC OFF: its series' race tracks, else (FREE PLAY) every delivered track. */
export function offeredTracks(series: CompiledSeries | null, music: MusicCatalog): readonly MusicTrack[] {
  return series ? series.music.race : music;
}

/**
 * The run's track from the player record's latest SELECT MUSIC choice among `offered`: that track, or MUSIC OFF (null)
 * when it was MUSIC OFF; else the first offered track, or MUSIC OFF when none is offered.
 */
export function latestTrack(player: PlayerRecord, offered: readonly MusicTrack[]): string | null {
  const latest = player.settings.latestSelections.music;
  if (latest === MUSIC_OFF) return null;
  return offered.find((track) => track.id === latest)?.id ?? offered[0]?.id ?? null;
}

/** Every mode's display name, in the order SELECT MODE lists them: the one source of mode names. */
export const MODE_NAMES: Readonly<Record<RunRequest['mode'], string>> = Object.freeze({
  ARCADE: 'ARCADE',
  FREE_PLAY: 'FREE PLAY',
  TIME_ATTACK: 'TIME ATTACK',
});

/** The player record's color for `vehicle` when its sprite set has it, else null. */
export function recordedColor(player: PlayerRecord, vehicle: CompiledVehicleDefinition): string | null {
  const color = player.settings.vehicleColors[vehicle.compiledVehicle.id];
  return color !== undefined && spriteSetHasColor(vehicle.spriteSet, color) ? color : null;
}

/**
 * The run a URL names, or null when it names none. `series` and `class` name an ARCADE or TIME ATTACK run of that
 * class; `course` names a FREE PLAY run on that course. A URL naming both, a class without its series (or the reverse),
 * or a mode its place does not offer is an error. Absent parameters take the defaults: ARCADE for a class, FREE PLAY on
 * a course; the class's first vehicle for a class, else the parameter's or the first catalog vehicle; one lap, no
 * rivals, the pool of the player's vehicle form and no traffic; the player record's color and latest track. Every value
 * is admitted with the run (`compileSessionConfiguration`), like a request from the selection screens.
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
  if (mode !== 'ARCADE' && mode !== 'FREE_PLAY' && mode !== 'TIME_ATTACK') throw new RangeError('Unknown Session mode');
  if ((mode === 'FREE_PLAY') !== (arcade === null))
    throw new RangeError(arcade ? 'A class runs ARCADE or TIME ATTACK' : `${mode} names a series and a class`);
  const vehicleId = arcade ? arcade.vehicles[0]! : (params.get('vehicle') ?? vehicles[0]!.compiledVehicle.id);
  // An unknown vehicle has no defaults of its own; the run's admission rejects it.
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
  const choice = {
    vehicleId,
    color: vehicle ? recordedColor(player, vehicle) : null,
    track: latestTrack(player, offeredTracks(arcade?.series ?? null, music)),
  };
  if (mode !== 'FREE_PLAY') return Object.freeze({ ...choice, mode, seriesId: arcade!.series.id, classId: arcade!.id });
  return Object.freeze({
    ...choice,
    mode,
    courseId: courseId!,
    lapCount: Number(params.get('laps') ?? 1),
    rivalCount: Number(params.get('rivals') ?? 0),
    rivalPool: params.get('pool') ?? (vehicle ? formPool(freePlay, vehicle) : freePlay.rivalPools[0]!).id,
    traffic: params.get('traffic') ?? NO_TRAFFIC,
  });
}
