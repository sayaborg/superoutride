import { guideCourseToWorld, sampleGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { PseudoCamera } from '../core/projection.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { M2VehicleState } from './m2-vehicle.js';

export interface M4CameraProfile {
  dCam: number;
  lCamMax: number;
  height: number;
  pitch: number;
  focalLength: number;
  centerX: number;
  centerY: number;
  kPsi: number;
  thetaLagMax: number;
  sDotMin: number;
  tauLat: number;
}

export interface M4CameraRig {
  yaw: number;
  lateral: number;
  initialized: boolean;
}

export interface M4CameraState extends PseudoCamera {
  l: number;
  guideHeadingAtCar: number;
  vehicleGuideYawDelta: number;
  cameraVehicleYawDelta: number;
  groundHeight: number;
  estimatedSDot: number;
}

export function createM4CameraRig(): M4CameraRig {
  return { yaw: 0, lateral: 0, initialized: false };
}

export function updateM4Camera(
  rig: M4CameraRig,
  guide: GuideCurve,
  height: HeightProfileReader,
  vehicle: M2VehicleState,
  profile: M4CameraProfile,
  dt: number,
): M4CameraState {
  const guideAtCar = sampleGuideCurve(guide, vehicle.course.s);
  const vehicleGuideYawDelta = wrapAngle(vehicle.yaw - guideAtCar.heading);
  const estimatedSDot = vehicle.speed * Math.cos(vehicleGuideYawDelta);

  if (!rig.initialized) {
    rig.yaw = vehicle.yaw;
    rig.lateral = vehicle.course.l - profile.dCam * Math.sin(vehicleGuideYawDelta);
    rig.initialized = true;
  }

  const tauPsi = profile.kPsi * profile.dCam / Math.max(Math.abs(estimatedSDot), profile.sDotMin);
  const yawAlpha = 1 - Math.exp(-dt / Math.max(tauPsi, 1e-4));
  rig.yaw = wrapAngle(rig.yaw + wrapAngle(vehicle.yaw - rig.yaw) * yawAlpha);
  const lag = clamp(wrapAngle(rig.yaw - vehicle.yaw), -profile.thetaLagMax, profile.thetaLagMax);
  rig.yaw = wrapAngle(vehicle.yaw + lag);

  const lTarget = vehicle.course.l - profile.dCam * Math.sin(vehicleGuideYawDelta);
  const latAlpha = 1 - Math.exp(-dt / Math.max(profile.tauLat, 1e-4));
  rig.lateral += (lTarget - rig.lateral) * latAlpha;
  rig.lateral = clamp(rig.lateral, -profile.lCamMax, profile.lCamMax);

  const sCamera = vehicle.course.s - profile.dCam;
  const plan = guideCourseToWorld(guide, sCamera, rig.lateral);
  const groundHeight = height.sampleCamera(sCamera);

  return {
    x: plan.x,
    y: groundHeight + profile.height,
    z: plan.z,
    yaw: rig.yaw,
    pitch: profile.pitch,
    s: sCamera,
    l: rig.lateral,
    focalLength: profile.focalLength,
    centerX: profile.centerX,
    centerY: profile.centerY,
    guideHeadingAtCar: guideAtCar.heading,
    vehicleGuideYawDelta,
    cameraVehicleYawDelta: wrapAngle(vehicle.yaw - rig.yaw),
    groundHeight,
    estimatedSDot,
  };
}
