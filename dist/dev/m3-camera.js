import { guideCourseToWorld, sampleGuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle, wrapPositive } from '../core/math.js';
export function computeM3Camera(guide, height, vehicle, profile) {
    const guideAtCar = sampleGuideCurve(guide, vehicle.course.s);
    const delta = wrapAngle(vehicle.yaw - guideAtCar.heading);
    const lTarget = vehicle.course.l - profile.dCam * Math.sin(delta);
    const lCamera = clamp(lTarget, -profile.lCamMax, profile.lCamMax);
    const sCamera = wrapPositive(vehicle.course.s - profile.dCam, guide.length);
    const plan = guideCourseToWorld(guide, sCamera, lCamera);
    const groundHeight = height.sampleCamera(sCamera);
    return {
        x: plan.x,
        y: groundHeight + profile.height,
        z: plan.z,
        yaw: vehicle.yaw,
        pitch: profile.pitch,
        s: sCamera,
        l: lCamera,
        focalLength: profile.focalLength,
        centerX: profile.centerX,
        centerY: profile.centerY,
        courseLength: guide.length,
        guideHeadingAtCar: guideAtCar.heading,
        vehicleGuideYawDelta: delta,
        groundHeight,
    };
}
