import { deg, near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { renderPose, terrainCamera } from './helpers/render-fixture.mjs';
import { sampleGuidePath } from '../dist/core/guide-curve.js';
import { pseudoProject } from '../dist/core/projection.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import {
  computeForwardVisibleInterval,
  generateFlatTerrainLines,
  lateralToScreenX,
  screenXToLateral,
  generateTerrainLines,
} from '../dist/road/terrain-line.js';
import { createStadiumScene } from './helpers/stadium-scene.mjs';

describe('flat stadium geometry', () => {
  const cameraProfile = {
    dCam: 20,
    lCamMax: 12,
    height: 2,
    pitch: deg(8),
    focalLength: 200,
    centerX: 160,
    centerY: 120,
  };

  const roadProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
    groundY: 0,
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
  };

  test('open stadium debug source is long enough for the configured draw-distance envelope', () => {
    const guide = createStadiumGuide();
    assert.ok(guide.length > 2 * roadProfile.dMax);
  });

  test('flat TerrainLineGeometry generator emits far-to-near horizontal rows and valid affine spans', () => {
    const guide = createStadiumGuide();
    const vehicle = renderPose(guide, 80);
    const camera = terrainCamera(guide, null, vehicle, cameraProfile);
    const lines = generateFlatTerrainLines(guide, camera, roadProfile);

    assert.ok(lines.length > 100);
    for (let i = 1; i < lines.length; i += 1) {
      assert.ok(lines[i].y > lines[i - 1].y);
      assert.ok(lines[i].d < lines[i - 1].d);
    }
    for (const line of lines) {
      assert.ok(line.xGroundL < line.xGroundR);
      assert.ok(line.xGroundL < line.xRoadL);
      assert.ok(line.xRoadL < line.xRoadR);
      assert.ok(line.xRoadR < line.xGroundR);
    }
  });

  test('horizontal mapping is exactly affine and invertible on a non-degenerate TerrainLineGeometry', () => {
    const xL = 40;
    const xR = 280;
    const gL = 12;
    const gR = 12;
    const xCenter = lateralToScreenX(0, xL, xR, gL, gR);
    near(xCenter, 160, 1e-7);
    near(lateralToScreenX(-12, xL, xR, gL, gR), xL, 1e-7);
    near(lateralToScreenX(12, xL, xR, gL, gR), xR, 1e-7);
    near(screenXToLateral(xCenter, xL, xR, gL, gR), 0, 1e-7);
    near(screenXToLateral(xL, xL, xR, gL, gR), -12, 1e-7);
    near(screenXToLateral(xR, xL, xR, gL, gR), 12, 1e-7);
  });

  test('forward-only visibility becomes empty when camera faces more than 90 degrees away', () => {
    const guide = createStadiumGuide();
    const sCamera = 40;
    const road = sampleGuidePath(guide, sCamera + roadProfile.dMin);
    const visible = computeForwardVisibleInterval(
      guide,
      road.heading + deg(100),
      sCamera,
      roadProfile.dMin,
      roadProfile.dMax,
    );
    assert.equal(visible, null);
  });
});

describe('hill and cliff scenery', () => {
  const { guide, height, cameraProfile, terrainProfile } = createStadiumScene();

  test('general TerrainLine generator is globally far-to-near and allows hill/dip row overdraw', () => {
    const vehicle = renderPose(guide, 80);
    const camera = terrainCamera(guide, height, vehicle, cameraProfile);
    const lines = generateTerrainLines(guide, camera, terrainProfile);
    assert.ok(lines.length > 150);
    for (let i = 1; i < lines.length; i += 1) {
      assert.ok(lines[i].d <= lines[i - 1].d + 1e-9);
    }
    const counts = new Map();
    for (const line of lines) counts.set(line.y, (counts.get(line.y) ?? 0) + 1);
    assert.ok([...counts.values()].some((count) => count > 1));
  });

  test('TerrainLine row agrees with the single Core pseudo projection for its sampled chainage', () => {
    const vehicle = renderPose(guide, 120);
    const camera = terrainCamera(guide, height, vehicle, cameraProfile);
    const lines = generateTerrainLines(guide, camera, terrainProfile);
    const line = lines[Math.floor(lines.length * 0.5)];
    assert.ok(line);
    // Reconstruct the center anchor from the two projected ground edges by sampling l=0 through the existing raster helper path.
    // The terrain generator's y is a scanline center quantization, so compare to y+0.5 within half a pixel.
    const leftX = line.xGroundL;
    const rightX = line.xGroundR;
    assert.ok(rightX > leftX);
    const projectedY = pseudoProject(
      { x: vehicle.x, y: line.renderHeight, z: vehicle.z, s: line.s },
      { ...camera, x: vehicle.x, z: vehicle.z },
    ).y;
    // This auxiliary projection only checks the vertical formula, which is independent of X/Z at fixed s and height.
    near(projectedY, line.y + 0.5, 0.51);
  });
});
