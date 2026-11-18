import type { SeriesCatalog, SeriesClass } from '../content/series-catalog.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { RunRulesRequest } from '../race/run-configuration.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { PlayerRecord } from './player-record.js';

/** What every run request chooses: the vehicle, the player's color (null for the run's own) and the track. */
interface RunChoice {
  readonly vehicleId: string;
  readonly color: string | null;
  /**
   * The run's track; null is MUSIC OFF, a race without music. The selection screens request the course's first race
   * track, or none (K, 2026-11-11). Like the color, neither a rule nor a record condition.
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

/**
 * A requested run, a run of a class: its series and class, which names the course, and its session; a class of any
 * course runs the course it names (`courseId`), which no other class run names. The run's assembly admits it.
 */
export interface RunRequest extends RunChoice {
  readonly seriesId: string;
  readonly classId: string;
  readonly session: SessionName;
  readonly courseId?: string;
}

/**
 * The course a class run drives: its class's, or for a class of any course the one the request names. A request naming
 * a course for a class of its own course, or none for a class of any, is a `RangeError`.
 */
export function classRunCourse(named: SeriesClass, request: RunRequest): string {
  if ((named.course === null) !== (request.courseId !== undefined))
    throw new RangeError(
      named.course === null
        ? `Class ${named.id} of series ${named.series.id} runs the course its run names`
        : `Class ${named.id} of series ${named.series.id} runs its own course`,
    );
  return named.course ?? request.courseId!;
}

/** The rules a run is requested with: its session, and the player's vehicle and color. */
export function rulesRequest(request: RunRequest): RunRulesRequest {
  return { mode: request.session, vehicleId: request.vehicleId, color: request.color };
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

/** The class a URL naming a course alone runs on it: FREE PLAY's SOLO (K, 2026-11-19). */
export const URL_COURSE_CLASS = Object.freeze({ seriesId: 'free-play', classId: 'solo' });

/**
 * The run a URL names, or null when it names none. `series` and `class` name a run of that class, in the session
 * `session` names (`race` or `attack`; RACE when absent), and `course` the course of a class of any course; `course`
 * alone names a run of `URL_COURSE_CLASS` on it. A class without its series (or the reverse), a course for a class of
 * its own course or none for a class of any, TIME ATTACK of a class of any course or an unknown session is an error;
 * other parameters are other URL data and ignored. The vehicle is `vehicle` in a class of any vehicle, else the class's
 * first, with the player record's color and no music. Every value is admitted with the run
 * (`compileRunConfiguration`), like a request from the selection screens.
 */
export function readUrlRunRequest(
  params: URLSearchParams,
  series: SeriesCatalog,
  vehicles: readonly CompiledVehicleDefinition[],
  player: PlayerRecord,
): RunRequest | null {
  const courseId = params.get('course'),
    session = params.get('session');
  let seriesId = params.get('series'),
    classId = params.get('class');
  if (courseId === null && seriesId === null && classId === null) return null;
  if ((seriesId === null) !== (classId === null)) throw new RangeError('A class run names a series and a class');
  if (seriesId === null) ({ seriesId, classId } = URL_COURSE_CLASS);
  const named = series.seriesClass(seriesId, classId!);
  if (!named) throw new RangeError(`Unknown class ${classId} of series ${seriesId}`);
  if (session !== null && session !== 'race' && session !== 'attack') throw new RangeError('Unknown session');
  if (session === 'attack' && named.course === null) throw new RangeError('A class of any course has no TIME ATTACK');
  const vehicleId = named.vehicles?.[0] ?? params.get('vehicle') ?? vehicles[0]!.compiledVehicle.id;
  // An unknown vehicle has no defaults of its own; the run's admission rejects it.
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === vehicleId);
  const request = Object.freeze({
    vehicleId,
    color: vehicle ? recordedColor(player, vehicle) : null,
    track: null,
    seriesId: named.series.id,
    classId: named.id,
    session: session === 'attack' ? 'TIME_ATTACK' : 'RACE',
    ...(courseId === null ? {} : { courseId }),
  } as const);
  classRunCourse(named, request);
  return request;
}
