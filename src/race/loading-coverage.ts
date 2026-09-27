import { PLAN_PROJECTION_WINDOW_METERS } from '../course/geometry/plan-coordinate.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { MAXIMUM_VEHICLE_SPEED } from '../vehicle/physics/vehicle-definitions.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';
import { SIM_DT } from './fixed-step.js';
import { RECOVERY_SETTINGS } from './recovery.js';

/** The observer's loading window, supplied by the view that renders the course. */
export interface CourseLoadingWindow {
  readonly cameraDistance: number;
  readonly near: number;
  readonly far: number;
}

export interface LoadingCoverage {
  /** The largest route-s advance of one fixed step at the vehicle speed bound. */
  readonly maximumStepMeters: number;
  /** Route kept ahead of the foremost vehicle. */
  readonly forwardMeters: number;
  /** Route kept behind the rearmost vehicle. */
  readonly rearMeters: number;
}

/**
 * The one loading coverage record, derived once from the camera window, the driver lookahead,
 * recovery backtrack (with the projection window and contact reach) and one step at the speed bound.
 */
export function resolveLoadingCoverage(
  window: CourseLoadingWindow,
  vehicles: readonly CompiledVehicleDefinition[],
): LoadingCoverage {
  const maximumStepMeters = MAXIMUM_VEHICLE_SPEED * SIM_DT;
  const contactReachMeters = Math.ceil(
    Math.max(
      ...vehicles.flatMap(({ compiledVehicle }) =>
        [compiledVehicle.frontStation, compiledVehicle.rearStation].map((station) =>
          Math.hypot(station.forwardOffset, station.freeReachDown),
        ),
      ),
    ),
  );
  return Object.freeze({
    maximumStepMeters,
    forwardMeters:
      Math.max(window.cameraDistance + window.far, ENVELOPE_DRIVER.lookahead, PLAN_PROJECTION_WINDOW_METERS) +
      maximumStepMeters,
    rearMeters:
      Math.max(
        window.cameraDistance + window.near,
        RECOVERY_SETTINGS.backtrackDistance + PLAN_PROJECTION_WINDOW_METERS + contactReachMeters,
      ) + maximumStepMeters,
  });
}
