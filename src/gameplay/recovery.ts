import {
  guideCoordinateCurve,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { clamp } from '../core/math.js';
import {
  M5_CAR_PROFILE,
  type M5CarState,
} from '../physics/car-physics.js';
import {
  M5_BIKE_PROFILE,
  type M5BikeState,
} from '../physics/motorcycle-physics.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import {
  initializeGuideObservation,
  resetVehicleControlState,
  sampleSurfaceGeometryAtCoordinate,
} from '../physics/vehicle-dynamics.js';
import {
  createAutomaticPowertrainState,
} from '../physics/automatic-powertrain.js';
import { add3, quaternionFromYawPitchLean, scale3 } from '../physics/vehicle-math3.js';
import type { HeightProfileReader } from '../visual/height-profile.js';

export type M5VehicleState = M5CarState | M5BikeState;
export type RecoveryReason = 'unsupported-time' | 'fall-distance' | 'surface-penetration' | 'chart-excursion' | 'manual' | 'wrong-course';

const SURFACE_PENETRATION_TOLERANCE = 1e-3;

export interface M5RecoveryProfile {
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

export const M5_RECOVERY_PROFILE: Readonly<M5RecoveryProfile> = {
  maxUnsupportedTime: 0.72,
  maxFallDistance: 3.25,
  maxLateralExcursion: 18,
  backtrackDistance: 8,
  minRecoverySpeed: 18,
  maxRecoverySpeed: 32,
  speedRetention: 0.58,
};

export interface M5RecoveryState {
  lastSafeS: number;
  unsupportedTime: number;
  recoveries: number;
  lastReason: RecoveryReason | null;
}

export interface M5RecoveryTarget {
  readonly s: number;
  readonly l: number;
}

export function createM5RecoveryState(vehicle: M5VehicleState): M5RecoveryState {
  return {
    lastSafeS: vehicle.course.s,
    unsupportedTime: 0,
    recoveries: 0,
    lastReason: null,
  };
}

/** Gameplay observes derived load/support facts; it never changes the ordinary physics law. */
export function updateM5Recovery(
  state: M5RecoveryState,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: M5VehicleState,
  dt: number,
  profile: M5RecoveryProfile = M5_RECOVERY_PROFILE,
  target: M5RecoveryTarget | null = null,
): RecoveryReason | null {
  if (vehicle.supported) {
    state.lastSafeS = vehicle.course.s;
    state.unsupportedTime = 0;
    return null;
  }

  state.unsupportedTime += dt;
  const desiredCgHeight = vehicle.kind === 'CAR'
    ? M5_CAR_PROFILE.desiredCgHeight
    : M5_BIKE_PROFILE.desiredCgHeight;
  const expectedCgY = height.samplePhysics(vehicle.course.s) + desiredCgHeight;
  const fallDistance = Math.max(0, expectedCgY - vehicle.y);
  const surface = sampleSurfaceGeometryAtCoordinate(guide, height, surfaces, vehicle.course);
  const surfaceDistance =
    (vehicle.x - surface.point.x) * surface.normal.x
    + (vehicle.y - surface.point.y) * surface.normal.y
    + (vehicle.z - surface.point.z) * surface.normal.z;
  // VOID is non-load-bearing, but it still shares the rendered heightfield. Letting the CG pass
  // below that authored surface makes the vehicle visibly drive under terrain while gameplay waits
  // for the larger fall-distance/chart limits.
  const penetratedSurface = surfaceDistance < -SURFACE_PENETRATION_TOLERANCE;

  let reason: RecoveryReason | null = null;
  if (Math.abs(vehicle.course.l) >= profile.maxLateralExcursion) reason = 'chart-excursion';
  else if (fallDistance >= profile.maxFallDistance) reason = 'fall-distance';
  else if (penetratedSurface) reason = 'surface-penetration';
  else if (state.unsupportedTime >= profile.maxUnsupportedTime) reason = 'unsupported-time';

  if (reason !== null) {
    if (target === null) recoverM5Vehicle(state, guide, height, surfaces, vehicle, reason, profile);
    else recoverM5VehicleToGuideCoordinate(state, guide, height, surfaces, vehicle, target, reason, profile);
  }
  return reason;
}

export function recoverM5Vehicle(
  state: M5RecoveryState,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: M5VehicleState,
  reason: RecoveryReason = 'manual',
  profile: M5RecoveryProfile = M5_RECOVERY_PROFILE,
): void {
  const curve = guideCoordinateCurve(guide);
  if (!Number.isFinite(state.lastSafeS) || state.lastSafeS < 0 || state.lastSafeS > curve.length) {
    throw new RangeError('recovery lastSafeS must lie within the active Guide domain');
  }
  if (!Number.isFinite(vehicle.course.s)) {
    throw new RangeError('recovery vehicle chainage observation must be finite');
  }
  // Airborne world motion can advance well beyond the last loaded station. Recovering only from
  // lastSafeS can place the vehicle back on the same launch face forever. Preserve the farther
  // causal Guide observation, then backtrack once into the ordinary supported reconstruction.
  const recoveryBaseS = clamp(Math.max(state.lastSafeS, vehicle.course.s), 0, curve.length);
  recoverM5VehicleToGuideCoordinate(
    state,
    guide,
    height,
    surfaces,
    vehicle,
    { s: Math.max(0, recoveryBaseS - profile.backtrackDistance), l: profile.targetL ?? 0 },
    reason,
    profile,
  );
}

/**
 * Explicit gameplay discontinuity: reconstruct a complete safe authoritative vehicle state at one
 * authored supported coordinate. No contact phase, tire memory, assist state or route progress is
 * manufactured.
 */
export function recoverM5VehicleToGuideCoordinate(
  state: M5RecoveryState,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: M5VehicleState,
  target: M5RecoveryTarget,
  reason: RecoveryReason,
  profile: M5RecoveryProfile = M5_RECOVERY_PROFILE,
): void {
  const curve = guideCoordinateCurve(guide);
  if (![target.s, target.l].every(Number.isFinite)) throw new RangeError('recovery target coordinate must be finite');
  if (target.s < 0 || target.s > curve.length) throw new RangeError('recovery target chainage must lie within the active Guide domain');

  const coordinate = {
    s: target.s,
    l: target.l,
    segmentIndex: segmentIndexAt(curve.segments, target.s),
    distanceSquared: 0,
  };
  const surface = sampleSurfaceGeometryAtCoordinate(guide, height, surfaces, coordinate);
  if (!surface.material.supported) throw new Error('recovery target must be physically supported');
  const speed = clamp(
    Math.max(0, vehicle.longitudinalSpeed) * profile.speedRetention,
    profile.minRecoverySpeed,
    profile.maxRecoverySpeed,
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

  if (vehicle.kind === 'CAR') reconstructCar(vehicle, surface.point, surface.normal, yaw, surface.gradeAngle, speed);
  else reconstructBike(vehicle, surface.point, surface.normal, yaw, surface.gradeAngle, speed);
  vehicle.course = initializeGuideObservation(guide, vehicle.x, vehicle.z);

  state.lastSafeS = target.s;
  state.unsupportedTime = 0;
  state.recoveries += 1;
  state.lastReason = reason;
}

function reconstructCar(
  car: M5CarState,
  surfacePoint: { readonly x: number; readonly y: number; readonly z: number },
  surfaceNormal: { readonly x: number; readonly y: number; readonly z: number },
  yaw: number,
  pitch: number,
  speed: number,
): void {
  const p = M5_CAR_PROFILE;
  const wheelbase = p.frontAxle + p.rearAxle;
  const position = add3(surfacePoint, scale3(surfaceNormal, p.desiredCgHeight));
  car.x = position.x;
  car.y = position.y;
  car.z = position.z;
  car.yaw = yaw;
  car.pitch = pitch;
  car.yawRate = 0;
  car.pitchRate = 0;
  car.frontSteerAngle = 0;
  car.steeringOffsetCommand = 0;
  car.frontWheelOmega = speed / p.wheelRadius;
  car.rearWheelOmega = speed / p.wheelRadius;
  car.frontNormalLoad = p.mass * 9.80665 * p.rearAxle / wheelbase;
  car.rearNormalLoad = p.mass * 9.80665 * p.frontAxle / wheelbase;
  car.frontGap = -p.frontStation.suspension.qStatic;
  car.rearGap = -p.rearStation.suspension.qStatic;
  car.frontSupportAvailable = true;
  car.rearSupportAvailable = true;
  Object.assign(car.powertrain, createAutomaticPowertrainState(p.powertrain, car.rearWheelOmega));
}

function reconstructBike(
  bike: M5BikeState,
  surfacePoint: { readonly x: number; readonly y: number; readonly z: number },
  surfaceNormal: { readonly x: number; readonly y: number; readonly z: number },
  yaw: number,
  pitch: number,
  speed: number,
): void {
  const p = M5_BIKE_PROFILE;
  const position = add3(surfacePoint, scale3(surfaceNormal, p.desiredCgHeight));
  bike.x = position.x;
  bike.y = position.y;
  bike.z = position.z;
  bike.orientation = quaternionFromYawPitchLean(yaw, pitch, 0);
  bike.omegaBody = { x: 0, y: 0, z: 0 };
  bike.frontSteerAngle = 0;
  bike.frontWheelOmega = speed / p.frontRollingRadius;
  bike.rearWheelOmega = speed / p.rearRollingRadius;
  bike.frontNormalLoad = p.mass * 9.80665 * p.frontWeightFraction;
  bike.rearNormalLoad = p.mass * 9.80665 - bike.frontNormalLoad;
  bike.frontGap = -p.frontStation.suspension.qStatic;
  bike.rearGap = -p.rearStation.suspension.qStatic;
  bike.frontSupportAvailable = true;
  bike.rearSupportAvailable = true;
  bike.referenceSurfaceNormal = { ...surfaceNormal };
  Object.assign(bike.powertrain, createAutomaticPowertrainState(p.powertrain, bike.rearWheelOmega));
}

function segmentIndexAt(
  segments: readonly { readonly sStart: number; readonly sEnd: number; readonly index: number }[],
  s: number,
): number {
  for (const segment of segments) {
    if (s >= segment.sStart - 1e-9 && s <= segment.sEnd + 1e-9) return segment.index;
  }
  throw new RangeError('recovery target is outside Guide segments');
}
