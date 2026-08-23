import { guideCourseToWorld } from '../core/guide-curve.js';
import { clamp, wrapPositive } from '../core/math.js';
export const M5_RECOVERY_PROFILE = {
    maxUnsupportedTime: 0.72,
    maxFallDistance: 3.25,
    maxLateralExcursion: 18,
    backtrackDistance: 8,
    minRecoverySpeed: 18,
    maxRecoverySpeed: 32,
    speedRetention: 0.58,
};
export function createM5RecoveryState(vehicle) {
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
export function updateM5Recovery(state, guide, height, surfaces, vehicle, dt, profile = M5_RECOVERY_PROFILE) {
    if (vehicle.supported) {
        state.lastSafeS = vehicle.course.s;
        state.unsupportedTime = 0;
        return null;
    }
    state.unsupportedTime += dt;
    const groundY = height.samplePhysics(vehicle.course.s);
    const fallDistance = Math.max(0, groundY - vehicle.y);
    let reason = null;
    if (Math.abs(vehicle.course.l) >= profile.maxLateralExcursion)
        reason = 'chart-excursion';
    else if (fallDistance >= profile.maxFallDistance)
        reason = 'fall-distance';
    else if (state.unsupportedTime >= profile.maxUnsupportedTime)
        reason = 'unsupported-time';
    if (reason !== null) {
        recoverM5Vehicle(state, guide, height, surfaces, vehicle, reason, profile);
    }
    return reason;
}
export function recoverM5Vehicle(state, guide, height, surfaces, vehicle, reason = 'manual', profile = M5_RECOVERY_PROFILE) {
    const s = wrapPositive(state.lastSafeS - profile.backtrackDistance, guide.length);
    const plan = guideCourseToWorld(guide, s, 0);
    const speed = clamp(Math.max(0, vehicle.longitudinalSpeed) * profile.speedRetention, profile.minRecoverySpeed, profile.maxRecoverySpeed);
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
    vehicle.surfaceType = surface.type;
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
