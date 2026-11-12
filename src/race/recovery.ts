import { clamp } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import {
  vehicleBodyKinematics,
  createBodyKinematicsWorkspace,
  publishVehicleRenderY,
  supportedTargetSurface,
  updateVehicle,
  type VehicleState,
} from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { DriverSteering } from '../vehicle/physics/vehicle-calibration.js';
import { createAutomaticPowertrainState } from '../vehicle/physics/automatic-powertrain.js';
import { resetDrivingActuatorState } from '../vehicle/physics/driving-actuator.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import {
  VEHICLE_GRAVITY,
  initializePlanCoordinateObservation,
  resetVehicleControlObservation,
} from '../vehicle/physics/vehicle-state.js';
import {
  sampleSurfaceGeometryAtCoordinate,
  createSurfaceGeometryWorkspace,
} from '../vehicle/physics/vehicle-surface-sampling.js';
import { add3, dot3, scale3, type Vec3 } from '../core/vector3.js';
import { drivenWheelOmega } from '../vehicle/physics/vehicle-definitions.js';
import { initializeVehicleTireObservation } from '../vehicle/physics/vehicle-tire-observation.js';

type RecoveryReason = 'fallen' | 'stuck' | 'overturned' | 'manual' | 'explosion' | 'outside-domain';

/** The fixed recovery policy: rules only, shared by every competitor; no live state or target resolution. */
export interface RecoveryPolicy {
  /**
   * Consecutive fixed steps a vehicle is stuck (drive reaching its wheels below `stuckSpeed`) before it recovers.
   */
  readonly holdSteps: number;
  /** m/s: the speed below which a vehicle whose wheels drive counts as not moving. */
  readonly stuckSpeed: number;
  /** Metres: how far below the ground along its normal a vehicle's centre of gravity has fallen when it recovers. */
  readonly fallDepth: number;
  /** Metres recovery backs off along the Route. */
  readonly backtrackDistance: number;
  /** Metres left between a recovered vehicle's footprint and the competitor it is placed behind. */
  readonly placementClearance: number;
}

export const RECOVERY_POLICY: RecoveryPolicy = Object.freeze({
  // 44 fixed steps of 1/60 s, about 0.733 s.
  holdSteps: 44,
  stuckSpeed: 0.15,
  // K, 2026-11-12.
  fallDepth: 3,
  backtrackDistance: 8,
  placementClearance: 1,
});

/**
 * The race's recovery place for a route station: the target it chooses there or behind it, or null when it has no
 * free place, and the vehicle does not recover that step. Target resolution belongs to the race, not the policy.
 */
export type RecoveryPlacement = (s: number) => RecoveryTarget | null;

export interface RecoveryState {
  lastSafeS: number;
  /** Consecutive fixed steps drive has reached its wheels with the vehicle below `stuckSpeed`. */
  stuckSteps: number;
  recoveries: number;
  lastReason: RecoveryReason | null;
}

export interface RecoveryTarget {
  readonly s: number;
  readonly l: number;
}

export function createRecoveryState(vehicle: VehicleState): RecoveryState {
  return {
    lastSafeS: vehicle.course.s,
    stuckSteps: 0,
    recoveries: 0,
    lastReason: null,
  };
}

interface RecoveryOptions {
  readonly state: RecoveryState;
  readonly place: RecoveryPlacement;
}

/**
 * One fixed gameplay step under the step's input, its driver's steering rule and external force (N, world). Recovery
 * observes the completed step; physics faults stay visible.
 */
export function advanceVehicleWithRecovery(
  world: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  {
    state,
    input,
    steering,
    place,
    externalForce,
  }: RecoveryOptions & {
    input: DrivingInput;
    steering: DriverSteering;
    externalForce: Readonly<Vec3>;
  },
): RecoveryReason | null {
  updateVehicle(world, vehicle, model, input, steering, false, externalForce);
  return updateRecovery(world, vehicle, model, { state, place });
}

const observationWorkspaces = new WeakMap<
  VehicleState,
  { surface: ReturnType<typeof createSurfaceGeometryWorkspace>; body: ReturnType<typeof createBodyKinematicsWorkspace> }
>();

/**
 * Gameplay observes derived load/support facts; it never changes the ordinary physics law. Airborne
 * motion is ordinary: only states from which driving cannot continue recover.
 */
function updateRecovery(
  world: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  { state, place }: RecoveryOptions,
): RecoveryReason | null {
  // The course limits are closed everywhere, so a centre outside the coordinate domain should not happen: it recovers
  // the one way in that step, its reason `outside-domain` a development record, not a recovery condition (the
  // auditor's choice).
  if (!vehicle.course.inDomain) {
    state.stuckSteps = 0;
    return recoverVehicle(world, vehicle, model, { state, reason: 'outside-domain', place }) ? 'outside-domain' : null;
  }
  // Drive reaches its wheels and it does not move, whatever holds it: an object, a limit, a wall or another vehicle
  // (K, 2026-11-12). No input is read: an engine still rising from idle through the slipping clutch delivers none.
  const stuck =
    vehicle.control.driveTorque > 0 &&
    Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed) < RECOVERY_POLICY.stuckSpeed;
  state.stuckSteps = stuck ? state.stuckSteps + 1 : 0;
  const { coordinates, height, surfaces } = world;
  let workspace = observationWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = { surface: createSurfaceGeometryWorkspace(), body: createBodyKinematicsWorkspace() };
    observationWorkspaces.set(vehicle, workspace);
  }
  const surface = sampleSurfaceGeometryAtCoordinate(coordinates, height, surfaces, vehicle.course, workspace.surface);
  const inverted = dot3(vehicleBodyKinematics(vehicle, workspace.body).up, surface.normal) <= 0;
  // CG distance above the rendered heightfield along its normal; material-free ground included.
  const surfaceDistance =
    (vehicle.x - surface.point.x) * surface.normal.x +
    (vehicle.y - surface.point.y) * surface.normal.y +
    (vehicle.z - surface.point.z) * surface.normal.z;
  let reason: RecoveryReason | null = null;
  // No collision shape meets the ground. An inverted body counts as landed once its CG is within the
  // ride CG height of the surface; higher up it is still rotating in the air and may recover itself.
  if (inverted && surfaceDistance <= model.compiledVehicle.desiredCgHeight) reason = 'overturned';
  // A CG the fall depth below the ground has fallen, supported or not.
  else if (surfaceDistance < -RECOVERY_POLICY.fallDepth) reason = 'fallen';
  else if (state.stuckSteps >= RECOVERY_POLICY.holdSteps) reason = 'stuck';
  if (reason !== null) return recoverVehicle(world, vehicle, model, { state, reason, place }) ? reason : null;
  // Single-wheel support is allowed. Stale contact telemetry must not make an inverted vehicle a new
  // safe recovery checkpoint.
  if (!inverted && vehicle.supported) state.lastSafeS = vehicle.course.s;
  return null;
}

/**
 * Recover the vehicle at its placement's target; false, leaving it as it is, when the placement has no free place,
 * so its condition is judged again on a later step.
 */
export function recoverVehicle(
  world: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  { state, reason = 'manual', place }: RecoveryOptions & { reason?: RecoveryReason },
): boolean {
  const target = routeRecoveryTarget(world, vehicle, state, place);
  if (target === null) return false;
  recoverVehicleToPlanCoordinate(world, vehicle, model, { state, target, reason });
  return true;
}

function routeRecoveryTarget(
  world: VehicleWorld,
  vehicle: VehicleState,
  state: RecoveryState,
  place: RecoveryPlacement,
): RecoveryTarget | null {
  // Airborne world motion can advance well beyond the last loaded station. Recovering only from
  // lastSafeS can place the vehicle back on the same launch face forever. Preserve the farther
  // causal plan coordinate observation, then backtrack once into the ordinary supported reconstruction.
  const domain = world.extent;
  const recoveryBaseS = clamp(Math.max(state.lastSafeS, vehicle.course.s), domain.start, domain.end);
  const s = Math.max(domain.start, recoveryBaseS - RECOVERY_POLICY.backtrackDistance);
  return place(s);
}

/**
 * Explicit gameplay discontinuity: reconstruct a complete safe authoritative vehicle state at one
 * authored supported coordinate. No contact phase, tire memory or route progress is manufactured.
 */
export function recoverVehicleToPlanCoordinate(
  world: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  { state, target, reason }: { readonly state: RecoveryState; target: RecoveryTarget; reason: RecoveryReason },
): void {
  const surface = supportedTargetSurface(world, target.s, target.l);

  // Every recovery is one, whatever its reason: at rest (K, 2026-11-12).
  vehicle.longitudinalAcceleration = 0;
  vehicle.lateralAcceleration = 0;
  resetVehicleControlObservation(vehicle);

  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  vehicle.velocityX = 0;
  vehicle.velocityY = 0;
  vehicle.velocityZ = 0;

  reconstructVehicle(vehicle, model, surface.point, surface.normal, yaw, surface.gradeAngle);
  vehicle.course = initializePlanCoordinateObservation(world.coordinates, vehicle.x, vehicle.z, target.s);

  state.lastSafeS = target.s;
  state.stuckSteps = 0;
  state.recoveries += 1;
  state.lastReason = reason;
}

function reconstructVehicle(
  vehicle: VehicleState,
  model: VehicleModel,
  surfacePoint: { readonly x: number; readonly y: number; readonly z: number },
  surfaceNormal: { readonly x: number; readonly y: number; readonly z: number },
  yaw: number,
  pitch: number,
): void {
  const p = model.compiledVehicle;
  const wheelbase = p.frontAxle + p.rearAxle;
  const position = add3(surfacePoint, scale3(surfaceNormal, p.desiredCgHeight));
  vehicle.x = position.x;
  vehicle.y = position.y;
  vehicle.z = position.z;
  vehicle.yaw = yaw;
  vehicle.pitch = pitch;
  vehicle.yawRate = 0;
  vehicle.pitchRate = 0;
  vehicle.frontSteerAngle = 0;
  resetDrivingActuatorState(vehicle.actuator);
  vehicle.frontWheelOmega = 0;
  vehicle.rearWheelOmega = 0;
  initializeVehicleTireObservation(
    vehicle.tires,
    (p.mass * VEHICLE_GRAVITY * p.rearAxle) / wheelbase,
    (p.mass * VEHICLE_GRAVITY * p.frontAxle) / wheelbase,
  );
  // Recovery sets the gear without a shift; the shift record and its sequence carry over.
  const { shift: _shift, ...powertrain } = createAutomaticPowertrainState(
    p.powertrain,
    model.powertrain,
    drivenWheelOmega(p, vehicle.frontWheelOmega, vehicle.rearWheelOmega),
  );
  Object.assign(vehicle.powertrain, powertrain);
  publishVehicleRenderY(vehicle, model);
}
