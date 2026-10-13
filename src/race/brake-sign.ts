import type { VehicleDrivingRead } from '../vehicle/physics/vehicle-contract.js';
import type { VehicleLimits } from '../vehicle/vehicle-limits.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import {
  compilePlannedDriver,
  createPlannedDriverWorkspace,
  plannedSpeedAhead,
  type DriverRoad,
  type DrivingDomain,
} from './planned-driver.js';

/**
 * BRAKE!!: the player's vehicle planned as a driver at `utilization` along the path that keeps its lateral (read in
 * steps of `lateralResolution` metres); the sign shows while its speed exceeds the plan's speed `aheadSeconds` of its
 * speed ahead, and hides once its speed falls below `clear` of that.
 */
export const BRAKE_SIGN = Object.freeze({ utilization: 0.9, aheadSeconds: 0.5, clear: 0.97, lateralResolution: 0.25 });

/** The player's BRAKE!! sign over the race's road and planning domain, for the player vehicle's mechanics. */
export function createBrakeSign(
  road: DriverRoad,
  domain: DrivingDomain,
  mechanics: { readonly model: VehicleModel; readonly limits: VehicleLimits; readonly speedCap: number },
) {
  const { utilization, aheadSeconds, clear, lateralResolution } = BRAKE_SIGN;
  const driver = compilePlannedDriver(mechanics.model, mechanics.limits, utilization, mechanics.speedCap, false);
  const workspace = createPlannedDriverWorkspace();
  let shown = false;
  return {
    /** Whether the sign shows after the latest step. */
    get shown() {
      return shown;
    },
    /**
     * Decide the sign after a step: off unless the player's own input drives the vehicle while the run is running, and
     * off while neither tire is loaded (in flight).
     */
    update(vehicle: VehicleDrivingRead, driving: boolean) {
      if (!driving || (vehicle.tires.front.load === 0 && vehicle.tires.rear.load === 0)) {
        shown = false;
        return;
      }
      const lateral = Math.round(vehicle.course.l / lateralResolution) * lateralResolution;
      const speed = Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed);
      const allowed = plannedSpeedAhead(road, vehicle, driver, lateral, workspace, domain, speed * aheadSeconds);
      shown = shown ? speed >= clear * allowed : speed > allowed;
    },
  };
}
