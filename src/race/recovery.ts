import { clamp } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import {
  vehicleBodyKinematics,
  createBodyKinematicsWorkspace,
  updateVehicle,
  type VehicleState,
} from '../vehicle/physics/vehicle-physics.js';
import { createAutomaticPowertrainState } from '../vehicle/physics/automatic-powertrain.js';
import { resetDrivingActuatorState } from '../vehicle/physics/driving-actuator.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import {
  VehicleOutsideModelError,
  VEHICLE_GRAVITY,
  initializePlanCoordinateObservation,
  resetVehicleControlState,
  sampleSurfaceGeometryAtCoordinate,
  createSurfaceGeometryWorkspace,
} from '../vehicle/physics/vehicle-dynamics.js';
import { add3, dot3, scale3 } from '../core/vector3.js';
import { drivenWheelOmega } from '../vehicle/physics/vehicle-definitions.js';

type RecoveryReason =
  | 'unsupported-time'
  | 'fall-distance'
  | 'surface-penetration'
  | 'outside-domain'
  | 'overturned'
  | 'suspension-travel'
  | 'manual'
  | 'wrong-course';

// Metres: 1 mm contact/recovery deadband, not floating-point epsilon.
// At a 1/720 s vehicle substep, gravity alone contributes about 0.019 mm of displacement.
const SURFACE_PENETRATION_TOLERANCE_METERS = 1e-3;

export interface RecoverySettings {
  maxUnsupportedTime: number;
  maxFallDistance: number;
  maxOutsideDomainTime: number;
  backtrackDistance: number;
  minRecoverySpeed: number;
  maxRecoverySpeed: number;
  speedRetention: number;
  /** Resolve the supported recovery lane at the final route station. */
  targetL?: (s: number) => number;
}

export const RECOVERY_SETTINGS: Readonly<RecoverySettings> = {
  maxUnsupportedTime: 0.72,
  maxFallDistance: 3.25,
  maxOutsideDomainTime: 0.72,
  backtrackDistance: 8,
  minRecoverySpeed: 18,
  maxRecoverySpeed: 32,
  speedRetention: 0.58,
};

export interface RecoveryState {
  lastSafeS: number;
  unsupportedTime: number;
  outsideDomainTime: number;
  recoveries: number;
  lastReason: RecoveryReason | null;
}

interface RecoveryTarget {
  readonly s: number;
  readonly l: number;
}

export function createRecoveryState(vehicle: VehicleState): RecoveryState {
  return {
    lastSafeS: vehicle.course.s,
    unsupportedTime: 0,
    outsideDomainTime: 0,
    recoveries: 0,
    lastReason: null,
  };
}

interface RecoveryOptions {
  readonly state: RecoveryState;
  readonly settings?: RecoverySettings;
}

/** One gameplay step. A physical-domain exit recovers; unrelated faults stay visible. */
export function advanceVehicleWithRecovery(
  world: VehicleWorld,
  vehicle: VehicleState,
  {
    state,
    input,
    dt,
    settings = RECOVERY_SETTINGS,
    target = null,
  }: RecoveryOptions & { input: DrivingInput; dt: number; target?: RecoveryTarget | null },
): RecoveryReason | null {
  try {
    updateVehicle(world, vehicle, input, dt);
  } catch (error) {
    if (!(error instanceof VehicleOutsideModelError)) throw error;
    recoverVehicle(world, vehicle, { state, reason: 'suspension-travel', settings, target });
    return 'suspension-travel';
  }
  return updateRecovery(world, vehicle, {
    state,
    dt,
    settings,
    target,
  });
}

const observationWorkspaces = new WeakMap<
  VehicleState,
  { surface: ReturnType<typeof createSurfaceGeometryWorkspace>; body: ReturnType<typeof createBodyKinematicsWorkspace> }
>();

/** Gameplay observes derived load/support facts; it never changes the ordinary physics law. */
function updateRecovery(
  world: VehicleWorld,
  vehicle: VehicleState,
  {
    state,
    dt,
    settings = RECOVERY_SETTINGS,
    target = null,
  }: RecoveryOptions & { dt: number; target?: RecoveryTarget | null },
): RecoveryReason | null {
  if (!vehicle.course.inDomain) {
    state.outsideDomainTime += dt;
    if (state.outsideDomainTime < settings.maxOutsideDomainTime) return null;
    recoverVehicle(world, vehicle, { state, reason: 'outside-domain', settings, target });
    return 'outside-domain';
  }
  state.outsideDomainTime = 0;
  const { coordinates, height, surfaces } = world;
  let workspace = observationWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = { surface: createSurfaceGeometryWorkspace(), body: createBodyKinematicsWorkspace() };
    observationWorkspaces.set(vehicle, workspace);
  }
  const surface = sampleSurfaceGeometryAtCoordinate(coordinates, height, surfaces, vehicle.course, workspace.surface);
  // Single-wheel support is allowed. Only an overturned pose bypasses the ordinary support check;
  // stale contact telemetry must not make an inverted vehicle a new safe recovery checkpoint.
  const overturned = dot3(vehicleBodyKinematics(vehicle, workspace.body).up, surface.normal) <= 0;
  if (!overturned && vehicle.supported) {
    state.lastSafeS = vehicle.course.s;
    state.unsupportedTime = 0;
    return null;
  }

  state.unsupportedTime += dt;
  const desiredCgHeight = vehicle.compiledVehicle.desiredCgHeight;
  const expectedCgY = height.sample(vehicle.course.s) + desiredCgHeight;
  const fallDistance = Math.max(0, expectedCgY - vehicle.y);
  const surfaceDistance =
    (vehicle.x - surface.point.x) * surface.normal.x +
    (vehicle.y - surface.point.y) * surface.normal.y +
    (vehicle.z - surface.point.z) * surface.normal.z;
  // VOID is non-load-bearing, but it still shares the rendered heightfield. Letting the CG pass
  // below that authored surface makes the vehicle visibly drive under terrain while gameplay waits
  // for the larger fall-distance limits.
  const penetratedSurface = surfaceDistance < -SURFACE_PENETRATION_TOLERANCE_METERS;

  let reason: RecoveryReason | null = null;
  if (overturned) reason = 'overturned';
  else if (fallDistance >= settings.maxFallDistance) reason = 'fall-distance';
  else if (penetratedSurface) reason = 'surface-penetration';
  else if (state.unsupportedTime >= settings.maxUnsupportedTime) reason = 'unsupported-time';

  if (reason !== null) recoverVehicle(world, vehicle, { state, reason, settings, target });
  return reason;
}

export function recoverVehicle(
  world: VehicleWorld,
  vehicle: VehicleState,
  {
    state,
    reason = 'manual',
    settings = RECOVERY_SETTINGS,
    target = null,
  }: RecoveryOptions & { reason?: RecoveryReason; target?: RecoveryTarget | null },
): void {
  recoverVehicleToPlanCoordinate(world, vehicle, {
    state,
    target: target ?? routeRecoveryTarget(world, vehicle, state, settings),
    reason,
    settings,
  });
}

function routeRecoveryTarget(
  world: VehicleWorld,
  vehicle: VehicleState,
  state: RecoveryState,
  settings: RecoverySettings,
): RecoveryTarget {
  // Airborne world motion can advance well beyond the last loaded station. Recovering only from
  // lastSafeS can place the vehicle back on the same launch face forever. Preserve the farther
  // causal plan coordinate observation, then backtrack once into the ordinary supported reconstruction.
  const domain = world.extent;
  const recoveryBaseS = clamp(Math.max(state.lastSafeS, vehicle.course.s), domain.start, domain.end);
  const s = Math.max(domain.start, recoveryBaseS - settings.backtrackDistance);
  const bounds = world.coordinates.domain.lateralAt(s, { left: 0, right: 0 });
  return { s, l: settings.targetL ? settings.targetL(s) : (bounds.left + bounds.right) / 2 };
}

/**
 * Explicit gameplay discontinuity: reconstruct a complete safe authoritative vehicle state at one
 * authored supported coordinate. No contact phase, tire memory or route progress is manufactured.
 */
export function recoverVehicleToPlanCoordinate(
  world: VehicleWorld,
  vehicle: VehicleState,
  {
    state,
    target,
    reason,
    settings = RECOVERY_SETTINGS,
  }: RecoveryOptions & { target: RecoveryTarget; reason: RecoveryReason },
): void {
  const { coordinates, height, surfaces } = world;

  const coordinate = {
    s: target.s,
    l: target.l,
    inDomain: true,
  };
  const surface = sampleSurfaceGeometryAtCoordinate(
    coordinates,
    height,
    surfaces,
    coordinate,
    createSurfaceGeometryWorkspace(),
  );

  const speed = clamp(
    Math.max(0, vehicle.longitudinalSpeed) * settings.speedRetention,
    settings.minRecoverySpeed,
    settings.maxRecoverySpeed,
  );

  vehicle.surfaceType = surface.surfaceType;
  vehicle.longitudinalAcceleration = 0;
  vehicle.lateralAcceleration = 0;
  resetVehicleControlState(vehicle);

  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const velocity = scale3(surface.tangent, speed);
  vehicle.velocityX = velocity.x;
  vehicle.velocityY = velocity.y;
  vehicle.velocityZ = velocity.z;

  reconstructVehicle(vehicle, surface.point, surface.normal, yaw, surface.gradeAngle, speed);
  vehicle.course = initializePlanCoordinateObservation(coordinates, vehicle.x, vehicle.z, target.s);

  state.lastSafeS = target.s;
  state.unsupportedTime = 0;
  state.outsideDomainTime = 0;
  state.recoveries += 1;
  state.lastReason = reason;
}

function reconstructVehicle(
  vehicle: VehicleState,
  surfacePoint: { readonly x: number; readonly y: number; readonly z: number },
  surfaceNormal: { readonly x: number; readonly y: number; readonly z: number },
  yaw: number,
  pitch: number,
  speed: number,
): void {
  const p = vehicle.compiledVehicle;
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
  vehicle.frontNormalLoad = (p.mass * VEHICLE_GRAVITY * p.rearAxle) / wheelbase;
  vehicle.rearNormalLoad = (p.mass * VEHICLE_GRAVITY * p.frontAxle) / wheelbase;
  vehicle.frontGap = -p.frontStation.suspension.qStatic;
  vehicle.rearGap = -p.rearStation.suspension.qStatic;
  vehicle.frontSupportAvailable = true;
  vehicle.rearSupportAvailable = true;
  Object.assign(
    vehicle.powertrain,
    createAutomaticPowertrainState(p.powertrain, drivenWheelOmega(p, vehicle.frontWheelOmega, vehicle.rearWheelOmega)),
  );
}
