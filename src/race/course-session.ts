import { compileEnvelopeDriver } from './envelope-driver.js';
import type { RivalEnvelope } from '../content/rival-envelope.js';
import type { CourseTimeBudgets } from '../content/course-time-budgets.js';
import type { SessionVehicle } from '../content/session-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { SessionConfiguration } from './session-configuration.js';

/**
 * Resolve one playable configuration before actors/ticks exist. Graph and catalog objects remain shared
 * references. A course without CLASSIC settings is untimed: it has no CLASSIC Session and no clock. A
 * Session without an envelope (a DEV-tuned vehicle) has no rivals and no time limit.
 */
export function resolveCourseSession(
  course: CompiledCourse,
  requested: SessionConfiguration,
  vehicle: SessionVehicle,
  envelope: RivalEnvelope | null,
  budgets: CourseTimeBudgets | null = null,
) {
  const preset = course.rules.classic;
  if (requested.mode === 'CLASSIC' && preset === null) throw new RangeError('An untimed course has no CLASSIC Session');
  const configuration: Readonly<SessionConfiguration> =
    requested.mode === 'CLASSIC' && preset !== null
      ? Object.freeze({
          mode: 'CLASSIC',
          rivalCount: preset.rivalCount,
          lapCount: preset.lapCount,
          timeLimit: true,
          initialSpeed: requested.initialSpeed,
          seed: requested.seed,
        })
      : Object.freeze({ ...requested, timeLimit: preset !== null && requested.timeLimit });
  if (!Number.isFinite(configuration.initialSpeed)) throw new RangeError('Session initialSpeed must be finite');
  if (configuration.mode === 'CLASSIC' && vehicle.vehicleDefinition.compiledVehicle.id !== preset?.vehicleId)
    throw new RangeError('CLASSIC requires its preset vehicle');
  if (configuration.lapCount > course.rules.maxLaps)
    throw new RangeError('Lap count exceeds the authored course limit');
  if (configuration.rivalCount >= course.gates.grid.length)
    throw new RangeError('The authored grid cannot hold this field');
  if (configuration.timeLimit && !budgets)
    throw new RangeError('A time limit requires current, complete reference runs');
  if (!envelope && (configuration.rivalCount > 0 || configuration.timeLimit))
    throw new RangeError('A Session without an envelope has no rivals and no time limit');
  const rivalUtilization = 0.75;
  if (envelope) {
    // The entire current roster shares this admitted vehicle and envelope, including a solo player.
    const driver = compileEnvelopeDriver(envelope, rivalUtilization, envelope.maximumSpeed);
    const stoppingDistance = envelope.maximumSpeed ** 2 / (2 * driver.braking);
    for (const { finish } of course.gates.intervals) {
      if (!finish || finish.section.outgoing.length !== 0) continue;
      const available = finish.section.coordinates.domain.end - finish.at.s;
      if (available < stoppingDistance)
        throw new RangeError(
          `FINISH ${finish.id}: ${available.toFixed(2)} m of runout; ${vehicle.vehicleDefinition.compiledVehicle.id} requires ${stoppingDistance.toFixed(2)} m to stop from maximum speed`,
        );
    }
  }
  return Object.freeze({
    course,
    configuration,
    vehicle,
    grid: course.gates.grid,
    rivalUtilization,
    envelope,
    budgets: configuration.timeLimit ? budgets : null,
  });
}

export type ResolvedCourseSession = ReturnType<typeof resolveCourseSession>;
