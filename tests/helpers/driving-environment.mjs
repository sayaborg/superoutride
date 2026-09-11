import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../../dist/core/presentation-scale.js';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/courses/stadium-surface-authoring.js';
import { createCliffVisualProfile } from '../../dist/dev/fixtures/cliff-visual.js';
import { createHillDipHeightProfile } from '../../dist/dev/fixtures/hill-dip-height.js';
import { createMaterialTransitionSurfaceMap } from '../../dist/dev/fixtures/material-transitions.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';

/** Fixed driving/recovery environment, independent of authored route-parent content. */
export function drivingEnvironment() {
  const deg = (v) => (v * Math.PI) / 180;
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const visual = createCliffVisualProfile(guide.length);
  const surfaces = createMaterialTransitionSurfaceMap(guide.length);
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
