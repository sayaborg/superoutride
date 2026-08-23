import { guideCourseToWorld, type GuideCurve } from '../core/guide-curve.js';
import { clamp, wrapPositive } from '../core/math.js';
import type { M5CarState } from '../physics/car-physics.js';
import type { M5BikeState } from '../physics/motorcycle-physics.js';
import type { CyclicSurfaceMap, SurfaceType } from '../physics/surface-map.js';
import type { CyclicHeightProfile } from '../visual/height-profile.js';

export type M5VehicleState = M5CarState | M5BikeState;
export type RecoveryReason = 'unsupported-time' | 'fall-distance' | 'chart-excursion' | 'manual';

export interface M5RecoveryProfile {
  maxUnsupportedTime: number;
  maxFallDistance: number;
  maxLateralExcursion: number;
  backtrackDistance: number;
  minRecoverySpeed: number;
  maxRecoverySpeed: number;
  speedRetention: number;
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

export function createM5RecoveryState(vehicle: M5VehicleState): M5RecoveryState {
  return {
    lastSafeS: vehicle.course.s,
    unsupportedTime: 0,
    recoveries: 0,
    lastReason: null,
  };
}

/**
 * M5 gameplay-side fail-safe. Core defines VOID as unsupported but intentionally leaves
 * crash/damage/respawn to gameplay. This DEV rule keeps the driving prototype playable
 * without modifying world physics or pseudo projection.
 */
export function updateM5Recovery(
  state: M5RecoveryState,
  guide: GuideCurve,
  height: CyclicHeightProfile,
  surfaces: CyclicSurfaceMap,
  vehicle: M5VehicleState,
  dt: number,
  profile: M5RecoveryProfile = M5_RECOVERY_PROFILE,
): RecoveryReason | null {
  if (vehicle.supported) {
    state.lastSafeS = vehicle.course.s;
    state.unsupportedTime = 0;
    return null;
  }

  state.unsupportedTime += dt;
  const groundY = height.samplePhysics(vehicle.course.s);
  const fallDistance = Math.max(0, groundY - vehicle.y);

  let reason: RecoveryReason | null = null;
  if (Math.abs(vehicle.course.l) >= profile.maxLateralExcursion) reason = 'chart-excursion';
  else if (fallDistance >= profile.maxFallDistance) reason = 'fall-distance';
  else if (state.unsupportedTime >= profile.maxUnsupportedTime) reason = 'unsupported-time';

  if (reason !== null) {
    recoverM5Vehicle(state, guide, height, surfaces, vehicle, reason, profile);
  }
  return reason;
}

export function recoverM5Vehicle(
  state: M5RecoveryState,
  guide: GuideCurve,
  height: CyclicHeightProfile,
  surfaces: CyclicSurfaceMap,
  vehicle: M5VehicleState,
  reason: RecoveryReason = 'manual',
  profile: M5RecoveryProfile = M5_RECOVERY_PROFILE,
): void {
  const s = wrapPositive(state.lastSafeS - profile.backtrackDistance, guide.length);
  const plan = guideCourseToWorld(guide, s, 0);
  const speed = clamp(
    Math.max(0, vehicle.longitudinalSpeed) * profile.speedRetention,
    profile.minRecoverySpeed,
    profile.maxRecoverySpeed,
  );
  const surface = surfaces.sample(plan.s, 0);

  vehicle.x = plan.x;
  vehicle.y = height.samplePhysics(plan.s);
  vehicle.z = plan.z;
  vehicle.yaw = plan.heading;
  vehicle.speed = speed;
  vehicle.course = { s: plan.s, l: 0, segmentIndex: plan.segmentIndex, distanceSquared: 0 };
  vehicle.verticalSpeed = 0;
  vehicle.longitudinalSpeed = speed;
  vehicle.lateralSpeed = 0;
  vehicle.yawRate = 0;
  vehicle.steerAngle = 0;
  vehicle.supported = surface.material.supported;
  vehicle.surfaceType = surface.type as SurfaceType;
  vehicle.lateralAcceleration = 0;
  vehicle.sprungRoll = 0;

  if ('bankAngle' in vehicle) {
    vehicle.bankAngle = 0;
    vehicle.bankRate = 0;
  }

  state.lastSafeS = plan.s;
  state.unsupportedTime = 0;
  state.recoveries += 1;
  state.lastReason = reason;
}
