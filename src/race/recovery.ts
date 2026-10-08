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

type RecoveryReason = 'surface-penetration' | 'outside-domain' | 'blocked' | 'overturned' | 'manual' | 'wrong-course';

// Metres: 1 mm contact/recovery deadband, not floating-point epsilon.
// At a 1/720 s vehicle substep, gravity alone contributes about 0.019 mm of displacement.
const SURFACE_PENETRATION_TOLERANCE_METERS = 1e-3;

/** The fixed recovery policy: rules only, shared by every competitor; no live state or target resolution. */
export interface RecoveryPolicy {
  /**
   * Consecutive fixed steps a recovery condition holds before the vehicle recovers: outside the coordinate domain, or
   * held against a fixed object below `blockedSpeed`.
   */
  readonly holdSteps: number;
  /** m/s: the speed below which a vehicle held against a fixed object counts as stopped there. */
  readonly blockedSpeed: number;
  /** Metres recovery backs off along the Route. */
  readonly backtrackDistance: number;
  /** Recovery speed bounds in m/s; a vehicle recovered from being blocked recovers at rest. */
  readonly minRecoverySpeed: number;
  readonly maxRecoverySpeed: number;
  /** Share of the forward speed kept through recovery, before the bounds. */
  readonly speedRetention: number;
  /** Metres left between a recovered vehicle's footprint and the competitor it is placed behind. */
  readonly placementClearance: number;
}

export const RECOVERY_POLICY: RecoveryPolicy = Object.freeze({
  // 44 fixed steps of 1/60 s, about 0.733 s.
  holdSteps: 44,
  blockedSpeed: 0.15,
  backtrackDistance: 8,
  minRecoverySpeed: 18,
  maxRecoverySpeed: 32,
  speedRetention: 0.58,
  placementClearance: 1,
});

/**
 * The race's recovery place for a route station: the target it chooses there or behind it. Target resolution belongs
 * to the race, not the policy.
 */
export type RecoveryPlacement = (s: number) => RecoveryTarget;

export interface RecoveryState {
  lastSafeS: number;
  /** Consecutive fixed steps the vehicle center has been outside the coordinate domain. */
  outsideDomainSteps: number;
  /** Consecutive fixed steps the vehicle has been held against a fixed object below `blockedSpeed`. */
  blockedSteps: number;
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
    outsideDomainSteps: 0,
    blockedSteps: 0,
    recoveries: 0,
    lastReason: null,
  };
}

interface RecoveryOptions {
  readonly state: RecoveryState;
  readonly place: RecoveryPlacement;
}

/**
 * One fixed gameplay step under the step's input and external force (N, world). `blocked` says whether a fixed object
 * (a solid sprite or a wall's free end) pushes the vehicle this step. Recovery observes the completed step; physics
 * faults stay visible.
 */
export function advanceVehicleWithRecovery(
  world: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  {
    state,
    input,
    place,
    externalForce,
    blocked = false,
  }: RecoveryOptions & { input: DrivingInput; externalForce: Readonly<Vec3>; blocked?: boolean },
): RecoveryReason | null {
  updateVehicle(world, vehicle, model, input, false, externalForce);
  return updateRecovery(world, vehicle, model, { state, place }, blocked);
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
  blocked: boolean,
): RecoveryReason | null {
  if (!vehicle.course.inDomain) {
    state.outsideDomainSteps += 1;
    if (state.outsideDomainSteps < RECOVERY_POLICY.holdSteps) return null;
    recoverVehicle(world, vehicle, model, { state, reason: 'outside-domain', place });
    return 'outside-domain';
  }
  state.outsideDomainSteps = 0;
  // Held against a fixed object it cannot leave, with no reverse gear: as long as outside the domain, then recovery.
  if (blocked && Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed) < RECOVERY_POLICY.blockedSpeed) {
    state.blockedSteps += 1;
    if (state.blockedSteps >= RECOVERY_POLICY.holdSteps) {
      recoverVehicle(world, vehicle, model, { state, reason: 'blocked', place });
      return 'blocked';
    }
  } else state.blockedSteps = 0;
  const { coordinates, height, surfaces } = world;
  let workspace = observationWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = { surface: createSurfaceGeometryWorkspace(), body: createBodyKinematicsWorkspace() };
    observationWorkspaces.set(vehicle, workspace);
  }
  const surface = sampleSurfaceGeometryAtCoordinate(coordinates, height, surfaces, vehicle.course, workspace.surface);
  const inverted = dot3(vehicleBodyKinematics(vehicle, workspace.body).up, surface.normal) <= 0;
  // Single-wheel support is allowed. Stale contact telemetry must not make an inverted vehicle a new
  // safe recovery checkpoint.
  if (!inverted && vehicle.supported) {
    state.lastSafeS = vehicle.course.s;
    return null;
  }

  // CG distance above the rendered heightfield along its normal; material-free ground included.
  const surfaceDistance =
    (vehicle.x - surface.point.x) * surface.normal.x +
    (vehicle.y - surface.point.y) * surface.normal.y +
    (vehicle.z - surface.point.z) * surface.normal.z;
  let reason: RecoveryReason | null = null;
  // No collision shape meets the ground. An inverted body counts as landed once its CG is within the
  // ride CG height of the surface; higher up it is still rotating in the air and may recover itself.
  if (inverted && surfaceDistance <= model.compiledVehicle.desiredCgHeight) reason = 'overturned';
  // A CG below the heightfield has fallen into a hole or through material-free ground.
  else if (surfaceDistance < -SURFACE_PENETRATION_TOLERANCE_METERS) reason = 'surface-penetration';

  if (reason !== null) recoverVehicle(world, vehicle, model, { state, reason, place });
  return reason;
}

export function recoverVehicle(
  world: VehicleWorld,
  vehicle: VehicleState,
  model: VehicleModel,
  { state, reason = 'manual', place }: RecoveryOptions & { reason?: RecoveryReason },
): void {
  recoverVehicleToPlanCoordinate(world, vehicle, model, {
    state,
    target: routeRecoveryTarget(world, vehicle, state, place),
    reason,
  });
}

function routeRecoveryTarget(
  world: VehicleWorld,
  vehicle: VehicleState,
  state: RecoveryState,
  place: RecoveryPlacement,
): RecoveryTarget {
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

  // A vehicle a fixed object held had stopped against it: it recovers at rest behind it, since a recovery speed would
  // carry it back into the same object. Every other recovery keeps a bounded share of its forward speed.
  const speed =
    reason === 'blocked'
      ? 0
      : clamp(
          Math.max(0, vehicle.longitudinalSpeed) * RECOVERY_POLICY.speedRetention,
          RECOVERY_POLICY.minRecoverySpeed,
          RECOVERY_POLICY.maxRecoverySpeed,
        );

  vehicle.longitudinalAcceleration = 0;
  vehicle.lateralAcceleration = 0;
  resetVehicleControlObservation(vehicle);

  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const velocity = scale3(surface.tangent, speed);
  vehicle.velocityX = velocity.x;
  vehicle.velocityY = velocity.y;
  vehicle.velocityZ = velocity.z;

  reconstructVehicle(vehicle, model, surface.point, surface.normal, yaw, surface.gradeAngle, speed);
  vehicle.course = initializePlanCoordinateObservation(world.coordinates, vehicle.x, vehicle.z, target.s);

  state.lastSafeS = target.s;
  state.outsideDomainSteps = 0;
  state.blockedSteps = 0;
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
  speed: number,
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
  vehicle.frontWheelOmega = speed / p.frontStation.rollingRadius;
  vehicle.rearWheelOmega = speed / p.rearStation.rollingRadius;
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
