import { compileEnvelopeDriver, type VehicleEnvelope } from './envelope-driver.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../course/compiler/course-rules.js';
import {
  compileSessionConfiguration,
  type SessionConfiguration,
  type SessionVehicle,
} from './session-configuration.js';
export interface CourseTimeBudgets {
  readonly initialMs: number;
  after(gate: CompiledCourseLandmark, lap: number): number;
}

/** Resolve one playable configuration before actors/ticks exist. Graph and catalog objects remain shared references. */
export function resolveCourseSession(
  course: CompiledCourse,
  requested: SessionConfiguration,
  vehicle: SessionVehicle,
  envelope: VehicleEnvelope,
  budgets: CourseTimeBudgets | null = null,
) {
  if (!course.rules) throw new RangeError('Session requires authored rules');
  const preset = course.rules.classic;
  const configuration = compileSessionConfiguration(
    requested.mode === 'CLASSIC'
      ? { mode: 'CLASSIC', rivalCount: preset.rivalCount, lapCount: preset.lapCount, countdown: true }
      : requested,
  );
  if (configuration.mode === 'CLASSIC' && vehicle.profile.id !== preset.vehicleId)
    throw new RangeError('CLASSIC requires its preset vehicle');
  if (configuration.lapCount > course.rules.maxLaps)
    throw new RangeError('Lap count exceeds the authored course limit');
  if (configuration.rivalCount >= course.rules.grid.length)
    throw new RangeError('The authored grid cannot hold this field');
  if (configuration.countdown && !budgets) throw new RangeError('Countdown requires current, complete reference runs');
  const rivalUtilization = 0.75;
  // The entire current roster shares this admitted vehicle and envelope, including a solo player.
  const driver = compileEnvelopeDriver(envelope, rivalUtilization, envelope.maximumSpeed);
  const stoppingDistance = envelope.maximumSpeed ** 2 / (2 * driver.braking);
  for (const { finish } of course.rules.intervals) {
    if (!finish || finish.section.outgoing.length !== 0) continue;
    const available = finish.section.coordinates.domain.end - finish.anchor.s;
    if (available < stoppingDistance)
      throw new RangeError(
        `FINISH ${finish.id}: ${available.toFixed(2)} m of runout; ${vehicle.profile.id} requires ${stoppingDistance.toFixed(2)} m to stop from maximum speed`,
      );
  }
  return Object.freeze({
    course,
    configuration,
    vehicle,
    grid: course.rules.grid,
    initialSpeed: 0,
    rivalUtilization,
    envelope,
    budgets: configuration.countdown ? budgets : null,
  });
}

export type ResolvedCourseSession = ReturnType<typeof resolveCourseSession>;
