import {
  createPlanProjectionWorkspace,
  type PlanCoordinateReader,
  type PlanCoordinateProjection,
  type PlanProjectionWorkspace,
} from '../../course/geometry/plan-coordinate.js';
import type { AutomaticPowertrainState } from './automatic-powertrain.js';
import { dot3, type Vec3 } from '../../core/vector3.js';

export const VEHICLE_GRAVITY = 9.80665;

/** Output cache for presentation/DEV only. Physics never consumes this object as an authority. */
interface VehicleControlState {
  /** Canonical input observation. */
  steeringRequest: number;
  steeringActuator: number;
  automaticSteerAngle: number;
  requestedSteerOffset: number;
  deliveredSteerOffset: number;
  targetSteerAngle: number;
  throttleActuator: number;
  brakeActuator: number;
  actualSteerAngle: number;
  /** HUD-only handwheel angle derived from road-wheel angle and the vehicle's presentation ratio. */
  /** Signed regularized front contact slip angle. Derived telemetry only. */
  frontSlipAngle: number;
  /** Station drive torques as the powertrain delivers them; protection bounds the opening, never these. */
  frontDriveTorque: number;
  rearDriveTorque: number;
  requestedFrontBrakeTorque: number;
  requestedRearBrakeTorque: number;
  pitchBrakeScale: number;
  pitchFeasible: boolean;
  frontBrakeTorque: number;
  rearBrakeTorque: number;
  frontWheelLocked: boolean;
  rearWheelLocked: boolean;
  frontUtilization: number;
  rearUtilization: number;
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
  readonly control: VehicleControlState;
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

export function createVehicleControlState(): VehicleControlState {
  return {
    steeringRequest: 0,
    steeringActuator: 0,
    automaticSteerAngle: 0,
    requestedSteerOffset: 0,
    deliveredSteerOffset: 0,
    targetSteerAngle: 0,
    throttleActuator: 0,
    brakeActuator: 0,
    actualSteerAngle: 0,
    frontSlipAngle: 0,
    frontDriveTorque: 0,
    rearDriveTorque: 0,
    requestedFrontBrakeTorque: 0,
    requestedRearBrakeTorque: 0,
    pitchBrakeScale: 1,
    pitchFeasible: true,
    frontBrakeTorque: 0,
    rearBrakeTorque: 0,
    frontWheelLocked: false,
    rearWheelLocked: false,
    frontUtilization: 0,
    rearUtilization: 0,
  };
}

export function resetVehicleControlState(vehicle: VehicleDynamicsState): void {
  Object.assign(vehicle.control, createVehicleControlState());
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
