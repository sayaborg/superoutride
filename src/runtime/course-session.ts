import type { CompiledCourse } from '../compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../compiler/course-rules.js';
import {
  compileSessionConfiguration,
  type SessionConfiguration,
  type SessionVehicle,
} from '../gameplay/session-configuration.js';
export interface CourseTimeBudgets {
  readonly initialMs: number;
  after(gate: CompiledCourseLandmark, lap: number): number;
}

/** Resolve one playable configuration before actors/ticks exist. Graph and catalog objects remain shared references. */
export function resolveCourseSession(
  course: CompiledCourse,
  requested: SessionConfiguration,
  vehicle: SessionVehicle,
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
  return Object.freeze({
    course,
    configuration,
    vehicle,
    grid: course.rules.grid,
    initialSpeed: 0,
    rivalUtilization: 0.75,
    budgets: configuration.countdown ? budgets : null,
  });
}

export type ResolvedCourseSession = ReturnType<typeof resolveCourseSession>;
