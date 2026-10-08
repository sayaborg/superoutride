import {
  createPlanProjectionWorkspace,
  type PlanCoordinateReader,
  type PlanCoordinateProjection,
  type PlanProjectionWorkspace,
} from '../../course/geometry/plan-coordinate.js';
import type { AutomaticPowertrainState } from './automatic-powertrain.js';
import { dot3, type Vec3 } from '../../core/vector3.js';

export const VEHICLE_GRAVITY = 9.80665;

/** The controls the competitor observation reports; physics never consumes this object as an authority. */
interface VehicleControlObservation {
  /** The delivered driver steering offset. */
  deliveredSteerOffset: number;
  throttleActuator: number;
  brakeActuator: number;
}

/** Shared public world-state fields. `course` is a derived plan coordinate cache, never world authority. */
export interface VehicleDynamicsState {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  course: PlanCoordinateProjection;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
  readonly control: VehicleControlObservation;
  readonly powertrain: AutomaticPowertrainState;
}

interface BodyFrameVelocity {
  readonly longitudinal: number;
  readonly lateral: number;
  readonly vertical: number;
}

export interface BodyKinematics {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly omegaWorld: Vec3;
}

export function createVehicleControlObservation(): VehicleControlObservation {
  return { deliveredSteerOffset: 0, throttleActuator: 0, brakeActuator: 0 };
}

export function resetVehicleControlObservation(vehicle: VehicleDynamicsState): void {
  Object.assign(vehicle.control, createVehicleControlObservation());
}

export function vehicleSpeed(vehicle: VehicleDynamicsState): number {
  return Math.hypot(vehicle.velocityX, vehicle.velocityZ);
}

export function bodyFrameVelocity(vehicle: VehicleDynamicsState, forward: Vec3, right: Vec3): BodyFrameVelocity {
  const velocity = { x: vehicle.velocityX, y: vehicle.velocityY, z: vehicle.velocityZ };
  return {
    longitudinal: dot3(velocity, forward),
    lateral: dot3(velocity, right),
    vertical: vehicle.velocityY,
  };
}

export function refreshPlanCoordinateObservation(
  coordinates: PlanCoordinateReader,
  vehicle: VehicleDynamicsState,
  workspace: PlanProjectionWorkspace,
): void {
  vehicle.course = coordinates.locateLocal(vehicle, vehicle.course.s, vehicle.course, workspace);
}

/** Reproject the reconstructed CG near its known placement; overlapping charts are not interchangeable. */
export function initializePlanCoordinateObservation(
  coordinates: PlanCoordinateReader,
  x: number,
  z: number,
  previousS: number,
): PlanCoordinateProjection {
  return coordinates.locateLocal({ x, z }, previousS, { s: 0, l: 0, inDomain: false }, createPlanProjectionWorkspace());
}
