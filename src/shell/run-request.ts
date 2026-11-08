import type { SeriesCatalog } from '../content/series-catalog.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { RunRulesRequest } from '../race/run-configuration.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { PlayerRecord } from './player-record.js';

/** What every run request chooses: the vehicle, the player's color (null for the run's own) and the track. */
interface RunChoice {
  readonly vehicleId: string;
  readonly color: string | null;
  /**
   * The run's track; null is MUSIC OFF, a race without music, which every run requests until it is decided which of
   * its course's tracks plays (K, 2026-11-08). Like the color, neither a rule nor a record condition.
   */
  readonly track: string | null;
}

/** How a class is driven: RACE, the menus' session, or TIME ATTACK, which only a URL requests (K, 2026-11-09). */
export type SessionName = 'RACE' | 'TIME_ATTACK';
/** The sessions with their display names: the one source of session names. */
export const SESSION_NAMES: Readonly<Record<SessionName, string>> = Object.freeze({
  RACE: 'RACE',
  TIME_ATTACK: 'TIME ATTACK',
});

/** A run of a class: its series and class, which names the course, and its session. */
export interface ClassRunRequest extends RunChoice {
  readonly seriesId: string;
  readonly classId: string;
  readonly session: SessionName;
}
/** A FREE PLAY run: the course it names and its options. */
export interface FreePlayRunRequest extends RunChoice {
  readonly courseId: string;
  readonly lapCount: number;
  readonly rivalCount: number;
  /** A rival pool ID of the FREE PLAY rules. */
  readonly rivalPool: string;
  /** OFF, or a TRAFFIC level ID of the FREE PLAY rules. */
  readonly traffic: string;
}
/** A requested run: a class's session or FREE PLAY. The run's assembly admits its run request. */
export type RunRequest = ClassRunRequest | FreePlayRunRequest;

/** The name a run's rules are shown by (READY): its session, or FREE PLAY. */
export const RULES_NAMES: Readonly<Record<RunRulesRequest['mode'], string>> = Object.freeze({
  RACE: SESSION_NAMES.RACE,
  TIME_ATTACK: SESSION_NAMES.TIME_ATTACK,
  FREE_PLAY: 'FREE PLAY',
});

/** Whether `request` is a FREE PLAY run, which names a course rather than a class. */
export function isFreePlay(request: RunRequest): request is FreePlayRunRequest {
  return 'courseId' in request;
}

/** The rules a run is requested with: a class run's session names them, and FREE PLAY gives its options. */
export function rulesRequest(request: RunRequest): RunRulesRequest {
  const { vehicleId, color } = request;
  if (!isFreePlay(request)) return { mode: request.session, vehicleId, color };
  const { lapCount, rivalCount, rivalPool, traffic } = request;
  return { mode: 'FREE_PLAY', vehicleId, color, lapCount, rivalCount, rivalPool, traffic };
}

/** The latest music choice MUSIC OFF, as the player record keeps it among its latest selections. */
export const MUSIC_OFF = 'off';

/**
 * The latest track the player record names among `offered`, which the SETTINGS audition plays: that track, or MUSIC OFF
 * (null) when it was MUSIC OFF; else the first offered track, or MUSIC OFF when none is offered.
 */
export function latestTrack(player: PlayerRecord, offered: readonly MusicTrack[]): string | null {
  const latest = player.settings.latestSelections.music;
  if (latest === MUSIC_OFF) return null;
  return offered.find((track) => track.id === latest)?.id ?? offered[0]?.id ?? null;
}

/** The player record's color for `vehicle` when its sprite set has it, else null. */
export function recordedColor(player: PlayerRecord, vehicle: CompiledVehicleDefinition): string | null {
  const color = player.settings.vehicleColors[vehicle.compiledVehicle.id];
  return color !== undefined && spriteSetHasColor(vehicle.spriteSet, color) ? color : null;
}

/**
 * The run a URL names, or null when it names none. `series` and `class` name a run of that class, in the session
 * `session` names (`race` or `attack`; RACE when absent); `course` names a FREE PLAY run on that course. A URL naming
 * both, a class without its series (or the reverse), a session with a course or an unknown session is an error; an old
 * `mode` parameter is other URL data and ignored. Absent parameters take the defaults: the class's first vehicle for a
 * class, else the parameter's or the first catalog vehicle; one lap, no rivals, the pool of the player's vehicle form
 * and no traffic; the player record's color and no music. Every value is admitted with the run
 * (`compileRunConfiguration`), like a request from the selection screens.
 */
export function readUrlRunRequest(
  params: URLSearchParams,
  series: SeriesCatalog,
  vehicles: readonly CompiledVehicleDefinition[],
  freePlay: FreePlayRules,
  player: PlayerRecord,
): RunRequest | null {
  const courseId = params.get('course'),
    seriesId = params.get('series'),
    classId = params.get('class'),
    session = params.get('session');
  if (courseId === null && seriesId === null && classId === null) return null;
  if (courseId !== null && (seriesId !== null || classId !== null))
    throw new RangeError('A run names a course, or a series and class, not both');
  if ((seriesId === null) !== (classId === null)) throw new RangeError('A class run names a series and a class');
  const named = seriesId !== null ? series.seriesClass(seriesId, classId!) : null;
  if (seriesId !== null && !named) throw new RangeError(`Unknown class ${classId} of series ${seriesId}`);
  if (!named && session !== null) throw new RangeError("A session is a class run's; FREE PLAY names a course");
  if (session !== null && session !== 'race' && session !== 'attack') throw new RangeError('Unknown session');
  const vehicleId = named ? named.vehicles[0]! : (params.get('vehicle') ?? vehicles[0]!.compiledVehicle.id);
  // An unknown vehicle has no defaults of its own; the run's admission rejects it.
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
  const choice = {
    vehicleId,
    color: vehicle ? recordedColor(player, vehicle) : null,
    track: null,
  };
  if (named)
    return Object.freeze({
      ...choice,
      seriesId: named.series.id,
      classId: named.id,
      session: session === 'attack' ? 'TIME_ATTACK' : 'RACE',
    });
  return Object.freeze({
    ...choice,
    courseId: courseId!,
    lapCount: Number(params.get('laps') ?? 1),
    rivalCount: Number(params.get('rivals') ?? 0),
    rivalPool: params.get('pool') ?? (vehicle ? formPool(freePlay, vehicle) : freePlay.rivalPools[0]!).id,
    traffic: params.get('traffic') ?? NO_TRAFFIC,
  });
}
