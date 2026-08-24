import { guideCourseToWorld, sampleGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { PseudoCamera } from '../core/projection.js';
import type { M2VehicleState } from './m2-vehicle.js';

export interface M2CameraProfile {
  dCam: number;
  lCamMax: number;
  height: number;
  pitch: number;
  focalLength: number;
  centerX: number;
  centerY: number;
}

export interface M2CameraState extends PseudoCamera {
  l: number;
  guideHeadingAtCar: number;
  vehicleGuideYawDelta: number;
}

export function computeM2Camera(
  guide: GuideCurve,
  vehicle: M2VehicleState,
  profile: M2CameraProfile,
): M2CameraState {
  const guideAtCar = sampleGuideCurve(guide, vehicle.course.s);
  const delta = wrapAngle(vehicle.yaw - guideAtCar.heading);
  const lTarget = vehicle.course.l - profile.dCam * Math.sin(delta);
  const lCamera = clamp(lTarget, -profile.lCamMax, profile.lCamMax);
  const sCamera = vehicle.course.s - profile.dCam;
  const plan = guideCourseToWorld(guide, sCamera, lCamera);

  return {
    x: plan.x,
    y: profile.height,
    z: plan.z,
    yaw: vehicle.yaw,
    pitch: profile.pitch,
    s: sCamera,
    l: lCamera,
    focalLength: profile.focalLength,
    centerX: profile.centerX,
    centerY: profile.centerY,
    guideHeadingAtCar: guideAtCar.heading,
    vehicleGuideYawDelta: delta,
  };
}
