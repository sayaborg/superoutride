import { clamp } from '../core/math.js';
import { openingForDriveTorque } from '../vehicle/physics/automatic-powertrain.js';
import type { VehicleDrivingRead } from '../vehicle/physics/vehicle-contract.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { DriverSteering } from '../vehicle/physics/vehicle-calibration.js';
import { fullSteeringYawRate } from '../vehicle/physics/vehicle-physics.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-state.js';
import type { VehicleLimits } from '../vehicle/vehicle-limits.js';

/**
 * The planned driver's control values ([Content and gameplay](../../docs/content-and-gameplay.md#drivers)).
 */
export const PLANNED_DRIVER = Object.freeze({
  /** Seconds: the time in which the pedals close a speed error to the plan. */
  speedSeconds: 0.5,
  /** rad/s and ratio: the natural frequency and damping of the path-following error. */
  pathFrequency: 1.2,
  pathDamping: 0.8,
  /** m/s: the least speed the path-following error's heading term and the steering inversion are read at. */
  minimumSteeringSpeed: 2,
});

/** A planned driver's pedals and steering, written in place. */
export function createPlannedInput() {
  return { steering: 0, throttle: 0 as number | boolean, brake: 0 as number | boolean };
}

/**
 * The one pedal that asks `acceleration` (m/s² along the travel direction) of `model`'s vehicle against the resistance
 * `resistance` (m/s²: grade and rolling resistance) and its drag: the throttle by inverting the affine opening-to-torque
 * map at its gear and engine speed, else the brake as a part of the full brake force. Written to `input`.
 */
export function plannedPedals(
  model: VehicleModel,
  limits: VehicleLimits,
  car: VehicleDrivingRead,
  acceleration: number,
  resistance: number,
  input: ReturnType<typeof createPlannedInput>,
  scratch = { opening: 0, wheelTorquePerOpening: 0 },
) {
  const { compiledVehicle } = model;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  const force = limits.mass * (acceleration + resistance + limits.drag(speed));
  const front = compiledVehicle.frontDriveTorqueFraction;
  const wheelPerTorque =
    front / compiledVehicle.frontStation.rollingRadius + (1 - front) / compiledVehicle.rearStation.rollingRadius;
  const { opening, wheelTorquePerOpening } = openingForDriveTorque(
    compiledVehicle.powertrain,
    model.powertrain,
    car.powertrain,
    force / wheelPerTorque,
    scratch,
  );
  if (opening >= 0) {
    input.throttle = Math.min(1, opening);
    input.brake = 0;
  } else {
    input.throttle = 0;
    input.brake = clamp((-opening * wheelTorquePerOpening * wheelPerTorque) / (limits.brake * limits.mass), 0, 1);
  }
  return input;
}

/**
 * The steering input that asks the yaw rate of a path of signed curvature `curvature` (1/m, positive to the right) with
 * the path-following error closed: `lateralError` (m, positive right of the path) and `headingError` (rad, the travel
 * direction's, positive right of the path's). The yaw rate is inverted through the steering rule's full-input yaw rate
 * on a front surface of `grip`.
 */
export function plannedSteering(
  model: VehicleModel,
  steering: DriverSteering,
  car: VehicleDrivingRead,
  grip: number,
  curvature: number,
  lateralError: number,
  headingError: number,
): number {
  if (car.longitudinalSpeed <= 0) return 0;
  const speed = Math.max(PLANNED_DRIVER.minimumSteeringSpeed, Math.hypot(car.longitudinalSpeed, car.lateralSpeed));
  const { pathFrequency: w, pathDamping: z } = PLANNED_DRIVER;
  const lateral = speed * speed * curvature - w * w * lateralError - 2 * z * w * speed * Math.sin(headingError);
  const full = fullSteeringYawRate(model, steering, grip, car.longitudinalSpeed, car.lateralSpeed);
  return clamp(lateral / speed / full, -1, 1);
}

/** m/s²: gravity's component along a grade of `angle` (rad) and rolling resistance `rolling` at load factor `n`. */
export function plannedResistance(angle: number, rolling: number, n: number) {
  return VEHICLE_GRAVITY * (Math.sin(angle) + rolling * Math.max(0, n));
}
