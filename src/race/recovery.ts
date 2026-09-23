import { clamp } from '../core/math.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import {
  arcadeBodyKinematics,
  createBodyKinematicsWorkspace,
  updateArcadeVehicle,
  type ArcadeVehicleState,
} from '../vehicle/physics/arcade-vehicle-physics.js';
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
import { drivenWheelOmega } from '../vehicle/physics/vehicle-profiles.js';

type RecoveryReason =
  | 'unsupported-time'
  | 'fall-distance'
  | 'surface-penetration'
  | 'chart-excursion'
  | 'overturned'
  | 'suspension-travel'
  | 'manual'
  | 'wrong-course';

const SURFACE_PENETRATION_TOLERANCE_METERS = 1e-3;

export interface RecoverySettings {
  maxUnsupportedTime: number;
  maxFallDistance: number;
  maxLateralExcursion: number;
  backtrackDistance: number;
  minRecoverySpeed: number;
  maxRecoverySpeed: number;
  speedRetention: number;
  /** Ordinary same-chart recovery lane target. Explicit route recovery may still supply its own target. */
  targetL?: number;
}

export const RECOVERY_SETTINGS: Readonly<RecoverySettings> = {
  maxUnsupportedTime: 0.72,
  maxFallDistance: 3.25,
  maxLateralExcursion: 18,
  backtrackDistance: 8,
  minRecoverySpeed: 18,
  maxRecoverySpeed: 32,
  speedRetention: 0.58,
};

export interface RecoveryState {
  lastSafeS: number;
  unsupportedTime: number;
  recoveries: number;
  lastReason: RecoveryReason | null;
}

interface RecoveryTarget {
  readonly s: number;
  readonly l: number;
}

export function createRecoveryState(vehicle: ArcadeVehicleState): RecoveryState {
  return {
    lastSafeS: vehicle.course.s,
    unsupportedTime: 0,
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
  vehicle: ArcadeVehicleState,
  {
    state,
    input,
    dt,
    settings = RECOVERY_SETTINGS,
    target = null,
  }: RecoveryOptions & { input: DrivingInput; dt: number; target?: RecoveryTarget | null },
): RecoveryReason | null {
  try {
    updateArcadeVehicle(world, vehicle, input, dt);
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
  ArcadeVehicleState,
  { surface: ReturnType<typeof createSurfaceGeometryWorkspace>; body: ReturnType<typeof createBodyKinematicsWorkspace> }
>();

/** Gameplay observes derived load/support facts; it never changes the ordinary physics law. */
function updateRecovery(
  world: VehicleWorld,
  vehicle: ArcadeVehicleState,
  {
    state,
    dt,
    settings = RECOVERY_SETTINGS,
    target = null,
  }: RecoveryOptions & { dt: number; target?: RecoveryTarget | null },
): RecoveryReason | null {
  const { coordinates, height, surfaces } = world;
  let workspace = observationWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = { surface: createSurfaceGeometryWorkspace(), body: createBodyKinematicsWorkspace() };
    observationWorkspaces.set(vehicle, workspace);
  }
  const surface = sampleSurfaceGeometryAtCoordinate(coordinates, height, surfaces, vehicle.course, workspace.surface);
  // Single-wheel support is allowed. Only an overturned pose bypasses the ordinary support check;
  // stale contact telemetry must not make an inverted vehicle a new safe recovery checkpoint.
  const overturned = dot3(arcadeBodyKinematics(vehicle, workspace.body).up, surface.normal) <= 0;
  if (!overturned && vehicle.supported) {
    state.lastSafeS = vehicle.course.s;
    state.unsupportedTime = 0;
    return null;
  }

  state.unsupportedTime += dt;
  const desiredCgHeight = vehicle.profile.desiredCgHeight;
  const expectedCgY = height.samplePhysics(vehicle.course.s) + desiredCgHeight;
  const fallDistance = Math.max(0, expectedCgY - vehicle.y);
  const surfaceDistance =
    (vehicle.x - surface.point.x) * surface.normal.x +
    (vehicle.y - surface.point.y) * surface.normal.y +
    (vehicle.z - surface.point.z) * surface.normal.z;
  // VOID is non-load-bearing, but it still shares the rendered heightfield. Letting the CG pass
  // below that authored surface makes the vehicle visibly drive under terrain while gameplay waits
  // for the larger fall-distance/chart limits.
  const penetratedSurface = surfaceDistance < -SURFACE_PENETRATION_TOLERANCE_METERS;

  let reason: RecoveryReason | null = null;
  if (overturned) reason = 'overturned';
  else if (Math.abs(vehicle.course.l) >= settings.maxLateralExcursion) reason = 'chart-excursion';
  else if (fallDistance >= settings.maxFallDistance) reason = 'fall-distance';
  else if (penetratedSurface) reason = 'surface-penetration';
  else if (state.unsupportedTime >= settings.maxUnsupportedTime) reason = 'unsupported-time';

  if (reason !== null) recoverVehicle(world, vehicle, { state, reason, settings, target });
  return reason;
}

export function recoverVehicle(
  world: VehicleWorld,
  vehicle: ArcadeVehicleState,
  {
    state,
    reason = 'manual',
    settings = RECOVERY_SETTINGS,
    target = null,
  }: RecoveryOptions & { reason?: RecoveryReason; target?: RecoveryTarget | null },
): void {
  recoverVehicleToPlanCoordinate(world, vehicle, {
    state,
    target: target ?? sameChartRecoveryTarget(world, vehicle, state, settings),
    reason,
    settings,
  });
}

function sameChartRecoveryTarget(
  world: VehicleWorld,
  vehicle: ArcadeVehicleState,
  state: RecoveryState,
  settings: RecoverySettings,
): RecoveryTarget {
  const { coordinates } = world;
  const domain = coordinates.domain;
  if (!Number.isFinite(state.lastSafeS) || state.lastSafeS < domain.start || state.lastSafeS > domain.end) {
    throw new RangeError('recovery lastSafeS must lie within the active plan coordinate domain');
  }
  if (!Number.isFinite(vehicle.course.s)) {
    throw new RangeError('recovery vehicle chainage observation must be finite');
  }
  // Airborne world motion can advance well beyond the last loaded station. Recovering only from
  // lastSafeS can place the vehicle back on the same launch face forever. Preserve the farther
  // causal plan coordinate observation, then backtrack once into the ordinary supported reconstruction.
  const recoveryBaseS = clamp(Math.max(state.lastSafeS, vehicle.course.s), domain.start, domain.end);
  return { s: Math.max(domain.start, recoveryBaseS - settings.backtrackDistance), l: settings.targetL ?? 0 };
}

/**
 * Explicit gameplay discontinuity: reconstruct a complete safe authoritative vehicle state at one
 * authored supported coordinate. No contact phase, tire memory or route progress is manufactured.
 */
export function recoverVehicleToPlanCoordinate(
  world: VehicleWorld,
  vehicle: ArcadeVehicleState,
  {
    state,
    target,
    reason,
    settings = RECOVERY_SETTINGS,
  }: RecoveryOptions & { target: RecoveryTarget; reason: RecoveryReason },
): void {
  const { coordinates, height, surfaces } = world;
  const domain = coordinates.domain;
  if (![target.s, target.l].every(Number.isFinite)) throw new RangeError('recovery target coordinate must be finite');
  if (target.s < domain.start || target.s > domain.end)
    throw new RangeError('recovery target chainage must lie within the active plan coordinate domain');

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
  if (!surface.material.supported) throw new Error('recovery target must be physically supported');
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
  state.recoveries += 1;
  state.lastReason = reason;
}

function reconstructVehicle(
  vehicle: ArcadeVehicleState,
  surfacePoint: { readonly x: number; readonly y: number; readonly z: number },
  surfaceNormal: { readonly x: number; readonly y: number; readonly z: number },
  yaw: number,
  pitch: number,
  speed: number,
): void {
  const p = vehicle.profile;
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
