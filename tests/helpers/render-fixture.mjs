/** Static poses for renderer geometry tests; no simulated vehicle or camera dynamics. */
import { guidePathToWorld, sampleGuidePath } from '../../dist/core/guide-curve.js';
import { clamp, wrapAngle } from '../../dist/core/math.js';

export function renderPose(guide, s = 45) {
  const p = guidePathToWorld(guide, s, 0);
  return {
    x: p.x,
    y: 0,
    z: p.z,
    yaw: p.heading,
    lateralAcceleration: 0,
    course: { s: p.s, l: 0, segmentIndex: p.segmentIndex, distanceSquared: 0 },
  };
}

export function terrainCamera(guide, height, pose, profile) {
  const heading = sampleGuidePath(guide, pose.course.s).heading;
  const delta = wrapAngle(pose.yaw - heading);
  const l = clamp(pose.course.l - profile.dCam * Math.sin(delta), -profile.lCamMax, profile.lCamMax);
  const s = pose.course.s - profile.dCam;
  const p = guidePathToWorld(guide, s, l);
  return {
    x: p.x,
    y: (height?.sampleCamera(s) ?? 0) + profile.height,
    z: p.z,
    s,
    l,
    yaw: pose.yaw,
    pitch: profile.pitch,
    focalLength: profile.focalLength,
    centerX: profile.centerX,
    centerY: profile.centerY,
  };
}
