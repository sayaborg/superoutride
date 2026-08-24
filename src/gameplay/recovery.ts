import {
  guideCoordinateCurve,
  guideCoordinateToWorld,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { clamp } from '../core/math.js';
import type { M5CarState } from '../physics/car-physics.js';
import type { M5BikeState } from '../physics/motorcycle-physics.js';
import type { SurfaceMapReader, SurfaceType } from '../physics/surface-map.js';
import type { HeightProfileReader } from '../visual/height-profile.js';

export type M5VehicleState = M5CarState | M5BikeState;
export type RecoveryReason = 'unsupported-time' | 'fall-distance' | 'chart-excursion' | 'manual' | 'wrong-course';

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

/**
 * M5 gameplay-side fail-safe. Core defines VOID as unsupported but intentionally leaves
 * crash/damage/respawn to gameplay. This DEV rule keeps the driving prototype playable
 * without modifying world physics or pseudo projection.
 */
export function updateM5Recovery(
  state: M5RecoveryState,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
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

/**
 * Ordinary open-path recovery. The target is an explicit gameplay decision, not topology:
 * backtrack along the current stage and stop at the real start endpoint instead of wrapping.
 */
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
  recoverM5VehicleToGuideCoordinate(
    state,
    guide,
    height,
    surfaces,
    vehicle,
    { s: Math.max(0, state.lastSafeS - profile.backtrackDistance), l: 0 },
    reason,
    profile,
  );
}

/**
 * Apply the common recovery state reset at one explicitly chosen supported Guide coordinate.
 * Route/session policy may use this primitive without teaching recovery about branches or laps.
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
  if (![target.s, target.l].every(Number.isFinite)) {
    throw new RangeError('recovery target coordinate must be finite');
  }
  if (target.s < 0 || target.s > curve.length) {
    throw new RangeError('recovery target chainage must lie within the active Guide domain');
  }

  const plan = guideCoordinateToWorld(guide, target.s, target.l);
  const surface = surfaces.sample(plan.s, target.l);
  if (!surface.material.supported) {
    throw new Error('recovery target must be physically supported');
  }
  const speed = clamp(
    Math.max(0, vehicle.longitudinalSpeed) * profile.speedRetention,
    profile.minRecoverySpeed,
    profile.maxRecoverySpeed,
  );

  vehicle.x = plan.x;
  vehicle.y = height.samplePhysics(plan.s);
  vehicle.z = plan.z;
  vehicle.yaw = plan.heading;
  vehicle.speed = speed;
  vehicle.course = { s: plan.s, l: target.l, segmentIndex: plan.segmentIndex, distanceSquared: 0 };
  vehicle.verticalSpeed = 0;
  vehicle.longitudinalSpeed = speed;
  vehicle.lateralSpeed = 0;
  vehicle.yawRate = 0;
  vehicle.steerAngle = 0;
  vehicle.supported = true;
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