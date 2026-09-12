import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_CAMERA_HEIGHT_METERS,
} from '../../dist/camera/current-camera-profile.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/courses/stadium-surface-authoring.js';
import { createCliffVisualProfile } from '../../dist/dev/fixtures/cliff-visual.js';
import { createHillDipHeightProfile } from '../../dist/dev/fixtures/hill-dip-height.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';
import { deriveGroundMapDensity } from '../../dist/groundmap/ground-map-lod.js';
import { generateTerrainLines } from '../../dist/road/terrain-line.js';
import { deg } from './assert.mjs';
import { renderPose, terrainCamera } from './render-fixture.mjs';

/** Fixed geometry fixture: these values are test inputs, not current player defaults. */
export function createStadiumScene() {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const visual = createCliffVisualProfile(guide.length);
  const cameraProfile = {
    dCam: 20,
    lCamMax: 12,
    height: 2,
    pitch: deg(8),
    focalLength: 200,
    centerX: 160,
    centerY: 120,
  };
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
  };
  const terrainProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
    groundLeft: groundProfile.groundLeft,
    groundRight: groundProfile.groundRight,
    roadLeft: groundProfile.roadLeft,
    roadRight: groundProfile.roadRight,
    height,
    visual,
  };
  return { guide, height, visual, cameraProfile, groundProfile, terrainProfile };
}

/** Current draw-envelope diagnostic; callers explicitly choose whether to supply the thin-span option. */
export function createFootprintScene(terrainOptions = {}) {
  const scene = createStadiumScene();
  Object.assign(scene.cameraProfile, {
    dCam: 5,
    height: CURRENT_CAMERA_HEIGHT_METERS,
    pitch: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  });
  Object.assign(
    scene.terrainProfile,
    { dMin: CURRENT_RENDER_NEAR_DEPTH_METERS, dMax: CURRENT_RENDER_FAR_DEPTH_METERS },
    terrainOptions,
  );
  const density = deriveGroundMapDensity({
    d0: 5,
    focalLength: 200,
    cameraHeight: scene.cameraProfile.height,
    pitchRadians: scene.cameraProfile.pitch,
  });
  function linesAt(s, yawOffset = 0) {
    const vehicle = renderPose(scene.guide, s);
    vehicle.yaw += yawOffset;
    const camera = terrainCamera(scene.guide, scene.height, vehicle, scene.cameraProfile);
    return generateTerrainLines(scene.guide, camera, scene.terrainProfile);
  }
  return { ...scene, density, linesAt };
}
