import { compileEnvelopeDriver } from './envelope-driver.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { SessionVehicle } from '../content/session-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { SeriesCourse } from '../content/series-catalog.js';
import type { SessionConfiguration } from './session-configuration.js';

const NO_RANK_LIMITS: Readonly<Record<string, number>> = Object.freeze({});

/** One competitor's resolved entry: its stable ID, its Session vehicle and that vehicle's envelope. */
export interface SessionEntry {
  readonly id: string;
  readonly vehicle: SessionVehicle;
  /** Null only for a DEV-tuned player, whose Session has no rivals. */
  readonly envelope: RivalEnvelope | null;
}

/**
 * Resolve one playable configuration before actors/ticks exist. Graph and catalog objects remain shared
 * references. `arcade` is the course's admitted series settings; a course without them has no ARCADE Session. Only
 * ARCADE has the clock. A Session without an envelope (a DEV-tuned vehicle) has no rivals and no time limit.
 * The resolved entries list the player first, then each rival; every rival currently drives the player's vehicle.
 */
export function resolveCourseSession(
  course: CompiledCourse,
  arcade: SeriesCourse | null,
  requested: SessionConfiguration,
  vehicle: SessionVehicle,
  envelope: RivalEnvelope | null,
  budgets: CourseTimeBudgets | null = null,
) {
  if (requested.mode === 'ARCADE' && arcade === null) throw new RangeError('An untimed course has no ARCADE Session');
  const configuration: Readonly<SessionConfiguration> =
    requested.mode === 'ARCADE' && arcade !== null
      ? Object.freeze({
          mode: 'ARCADE',
          rivalCount: arcade.rivals,
          lapCount: arcade.laps,
          timeLimit: true,
          initialSpeed: requested.initialSpeed,
          seed: requested.seed,
        })
      : Object.freeze({ ...requested });
  if (!Number.isFinite(configuration.initialSpeed)) throw new RangeError('Session initialSpeed must be finite');
  if (
    configuration.mode === 'ARCADE' &&
    !arcade?.series.vehicles.includes(vehicle.vehicleDefinition.compiledVehicle.id)
  )
    throw new RangeError('ARCADE requires a series vehicle');
  if (configuration.lapCount > course.rules.maxLaps)
    throw new RangeError('Lap count exceeds the authored course limit');
  if (configuration.rivalCount >= course.gates.grid.length)
    throw new RangeError('The authored grid cannot hold this field');
  if (configuration.timeLimit && !budgets)
    throw new RangeError('A time limit requires current, complete reference runs');
  if (!envelope && (configuration.rivalCount > 0 || configuration.timeLimit))
    throw new RangeError('A Session without an envelope has no rivals and no time limit');
  const rivalUtilization = 0.75;
  const entries: readonly SessionEntry[] = Object.freeze([
    Object.freeze({ id: 'PLAYER', vehicle, envelope }),
    ...Array.from({ length: configuration.rivalCount }, (_, index) =>
      Object.freeze({ id: `RIVAL_${String(index + 1).padStart(2, '0')}`, vehicle, envelope }),
    ),
  ]);
  // Runout covers the whole field: the entry needing the longest stop from its maximum speed decides it.
  let longest: { readonly entry: SessionEntry; readonly distance: number } | null = null;
  for (const entry of entries) {
    if (!entry.envelope) continue;
    const driver = compileEnvelopeDriver(entry.envelope, rivalUtilization, entry.envelope.maximumSpeed);
    const distance = entry.envelope.maximumSpeed ** 2 / (2 * driver.braking);
    if (!longest || distance > longest.distance) longest = { entry, distance };
  }
  if (longest)
    for (const { finish } of course.gates.intervals) {
      if (!finish || finish.section.outgoing.length !== 0) continue;
      const available = finish.section.coordinates.domain.end - finish.at.s;
      if (available < longest.distance)
        throw new RangeError(
          `FINISH ${finish.id}: ${available.toFixed(2)} m of runout; ${longest.entry.vehicle.vehicleDefinition.compiledVehicle.id} requires ${longest.distance.toFixed(2)} m to stop from maximum speed`,
        );
    }
  return Object.freeze({
    course,
    configuration,
    entries,
    grid: course.gates.grid,
    rivalUtilization,
    budgets: configuration.timeLimit ? budgets : null,
    /** Rank limit N by gate ID; ARCADE only. */
    rankLimits: configuration.mode === 'ARCADE' && arcade ? arcade.rankLimits : NO_RANK_LIMITS,
  });
}

export type ResolvedCourseSession = ReturnType<typeof resolveCourseSession>;
