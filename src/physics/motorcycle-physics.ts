import type { DrivingInput } from '../input/driving-input.js';
import { guideCourseToWorld, locateWorldOnGuideLocal, type GuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { CyclicHeightProfile } from '../visual/height-profile.js';
import type { M5CarState } from './car-physics.js';
import type { SurfaceMapReader, SurfaceType } from './surface-map.js';

const G = 9.80665;

export interface MotorcyclePhysicsProfile {
  mass: number;
  wheelbase: number;
  maxBank: number;
  bankTau: number;
  yawTau: number;
  maxDriveForce: number;
  maxBrakeForce: number;
  topSpeed: number;
  aeroDrag: number;
  maxFallSpeed: number;
}

export const M5_BIKE_PROFILE: Readonly<MotorcyclePhysicsProfile> = {
  mass: 285,
  wheelbase: 1.52,
  maxBank: 52 * Math.PI / 180,
  bankTau: 0.20,
  yawTau: 0.13,
  maxDriveForce: 3300,
  maxBrakeForce: 5200,
  topSpeed: 90,
  aeroDrag: 0.24,
  maxFallSpeed: 55,
};

export interface M5BikeState extends M5CarState {
  bankAngle: number;
  bankRate: number;
}

export function createM5Bike(
  guide: GuideCurve,
  height: CyclicHeightProfile,
  surfaces: SurfaceMapReader,
  s = 45,
): M5BikeState {
  const p = guideCourseToWorld(guide, s, 0);
  const surface = surfaces.sample(p.s, 0);
  const speed = 45;
  return {
    x: p.x,
    y: height.samplePhysics(p.s),
    z: p.z,
    yaw: p.heading,
    speed,
    sprungRoll: 0,
    course: { s: p.s, l: 0, segmentIndex: p.segmentIndex, distanceSquared: 0 },
    verticalSpeed: 0,
    longitudinalSpeed: speed,
    lateralSpeed: 0,
    yawRate: 0,
    steerAngle: 0,
    supported: surface.material.supported,
    surfaceType: surface.type,
    lateralAcceleration: 0,
    bankAngle: 0,
    bankRate: 0,
  };
}

export function updateM5Bike(
  guide: GuideCurve,
  height: CyclicHeightProfile,
  surfaces: SurfaceMapReader,
  bike: M5BikeState,
  input: DrivingInput,
  dt: number,
  profile: MotorcyclePhysicsProfile = M5_BIKE_PROFILE,
): void {
  const before = surfaces.sample(bike.course.s, bike.course.l);
  bike.surfaceType = before.type;
  bike.supported = before.material.supported;

  const speed = Math.max(0, bike.longitudinalSpeed);
  const speedRatio = clamp(speed / profile.topSpeed, 0, 1);

  if (bike.supported) {
    const gripBankLimit = Math.atan(before.material.friction * 0.95);
    const availableBank = Math.min(profile.maxBank, gripBankLimit);
    const lowSpeedBankScale = clamp(speed / 12, 0.25, 1);
    const bankTarget = input.steering * availableBank * lowSpeedBankScale;
    const bankAlpha = 1 - Math.exp(-dt / Math.max(profile.bankTau, 1e-4));
    const previousBank = bike.bankAngle;
    bike.bankAngle += (bankTarget - bike.bankAngle) * bankAlpha;
    bike.bankRate = (bike.bankAngle - previousBank) / Math.max(dt, 1e-6);

    const drive = input.throttle
      ? profile.maxDriveForce * before.material.driveScale * Math.max(0, 1 - speedRatio * speedRatio)
      : 0;
    const brake = input.brake ? profile.maxBrakeForce : 0;
    const drag = profile.aeroDrag * speed * speed;
    const rolling = before.material.rollingResistance * profile.mass * G;
    const traction = before.material.friction * profile.mass * G;
    const fx = clamp(drive - brake - drag - rolling, -traction, traction);
    bike.longitudinalSpeed = Math.max(0, bike.longitudinalSpeed + (fx / profile.mass) * dt);

    const gripLat = before.material.friction * G * 0.95;
    const bankLat = G * Math.tan(bike.bankAngle);
    bike.lateralAcceleration = clamp(bankLat, -gripLat, gripLat);
    const yawTarget = bike.lateralAcceleration / Math.max(bike.longitudinalSpeed, 3);
    const yawAlpha = 1 - Math.exp(-dt / Math.max(profile.yawTau, 1e-4));
    bike.yawRate += (yawTarget - bike.yawRate) * yawAlpha;

    // Small residual sideslip remains possible on loose surfaces; it is not the steering mechanism.
    const loose = 1 - clamp(before.material.friction / 1.05, 0, 1);
    const lateralTarget = -input.steering * loose * bike.longitudinalSpeed * 0.06;
    const slipAlpha = 1 - Math.exp(-dt / 0.20);
    bike.lateralSpeed += (lateralTarget - bike.lateralSpeed) * slipAlpha;
    bike.steerAngle = Math.atan(profile.wheelbase * bike.yawRate / Math.max(bike.longitudinalSpeed, 3));
  } else {
    const bankAlpha = 1 - Math.exp(-dt / 0.45);
    const previousBank = bike.bankAngle;
    bike.bankAngle += (0 - bike.bankAngle) * bankAlpha;
    bike.bankRate = (bike.bankAngle - previousBank) / Math.max(dt, 1e-6);
    bike.longitudinalSpeed -= Math.sign(bike.longitudinalSpeed)
      * (profile.aeroDrag * bike.longitudinalSpeed * Math.abs(bike.longitudinalSpeed) / profile.mass) * dt;
    bike.yawRate *= Math.exp(-dt * 0.08);
    bike.lateralSpeed *= Math.exp(-dt * 0.05);
    bike.lateralAcceleration = 0;
  }

  const sin = Math.sin(bike.yaw);
  const cos = Math.cos(bike.yaw);
  bike.x += (sin * bike.longitudinalSpeed + cos * bike.lateralSpeed) * dt;
  bike.z += (cos * bike.longitudinalSpeed - sin * bike.lateralSpeed) * dt;
  bike.yaw = wrapAngle(bike.yaw + bike.yawRate * dt);

  bike.course = locateWorldOnGuideLocal(
    guide,
    { x: bike.x, z: bike.z },
    bike.course.segmentIndex,
    3,
    false,
  );

  const after = surfaces.sample(bike.course.s, bike.course.l);
  const groundY = height.samplePhysics(bike.course.s);
  if (after.material.supported) {
    if (!bike.supported) {
      if (bike.y <= groundY || bike.verticalSpeed <= 0) {
        bike.y = groundY;
        bike.verticalSpeed = 0;
        bike.supported = true;
      }
    } else {
      bike.y = groundY;
      bike.verticalSpeed = 0;
      bike.supported = true;
    }
  } else {
    bike.supported = false;
    bike.verticalSpeed = Math.max(bike.verticalSpeed - G * dt, -profile.maxFallSpeed);
    bike.y += bike.verticalSpeed * dt;
  }

  bike.surfaceType = after.type;
  bike.speed = Math.hypot(bike.longitudinalSpeed, bike.lateralSpeed);
  bike.sprungRoll = clamp(bike.bankAngle / profile.maxBank, -1, 1) * 0.55;
}

export function adoptM5BikeKinematics(target: M5BikeState, source: M5CarState): void {
  copyCommon(target, source);
  target.bankAngle = clamp(source.sprungRoll / 0.55, -1, 1) * M5_BIKE_PROFILE.maxBank;
  target.bankRate = 0;
}

export function adoptM5CarKinematics(target: M5CarState, source: M5BikeState): void {
  copyCommon(target, source);
  target.sprungRoll = source.sprungRoll;
}

function copyCommon(target: M5CarState, source: M5CarState): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  target.yaw = source.yaw;
  target.speed = source.speed;
  target.sprungRoll = source.sprungRoll;
  target.course = { ...source.course };
  target.verticalSpeed = source.verticalSpeed;
  target.longitudinalSpeed = source.longitudinalSpeed;
  target.lateralSpeed = source.lateralSpeed;
  target.yawRate = source.yawRate;
  target.steerAngle = source.steerAngle;
  target.supported = source.supported;
  target.surfaceType = source.surfaceType as SurfaceType;
  target.lateralAcceleration = source.lateralAcceleration;
}
