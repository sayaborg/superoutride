import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../../dist/core/presentation-scale.js';
import { createM2StadiumGuide } from '../../dist/dev/debug-course.js';
import { createM3DebugHeightProfile } from '../../dist/dev/m3-debug-height-profile.js';
import { createM3DebugVisualProfile } from '../../dist/dev/m3-debug-visual.js';
import { createM5DebugSurfaceMap } from '../../dist/dev/m5-debug-surface-map.js';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/m5-surface-authoring.js';

/** Fixed driving/recovery environment, independent of authored route-parent content. */
export function drivingEnvironment() {
  const deg = (v) => (v * Math.PI) / 180;
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const visual = createM3DebugVisualProfile(guide.length);
  const surfaces = createM5DebugSurfaceMap(guide.length);
  const cameraProfile = {
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    height: 2.469902425419539,
    baseDownPitch: deg(8),
    focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
    centerX: 160,
    centerY: 120,
    directionSpeedMin: 0.25,
    playerTargetY: 190,
    tauVertical: 0.22,
    deltaYMax: 4,
  };
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    roadMarkings: CENTER_DASH_MARKINGS,
  };
  const terrainProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    height,
    visual,
  };

  return { guide, height, visual, surfaces, cameraProfile, groundProfile, terrainProfile };
}
