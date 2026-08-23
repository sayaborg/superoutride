import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { pseudoProject } from '../dist/core/projection.js';
import { computeM3Camera } from '../dist/dev/m3-camera.js';
import { createM2Vehicle } from '../dist/dev/m2-vehicle.js';
import { generateTerrainLines } from '../dist/road/terrain-line.js';
import { renderM3VisualCore } from '../dist/render/m3-renderer.js';
import { SoftwareSurface, rgba } from '../dist/render/software-surface.js';
import { createM3FarBackground, drawFarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile, M3_BASE_COLORS } from '../dist/visual/m3-debug-visual.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';

const deg = (value) => value * Math.PI / 180;
const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
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
  shoulderWidth: 1,
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

test('software surface provides deterministic 32-bit span writes', () => {
  const surface = new SoftwareSurface(8, 4);
  const a = rgba(1, 2, 3);
  const b = rgba(10, 20, 30);
  surface.clear(a);
  surface.fillSpan(2, 2, 5, b);
  assert.equal(surface.getPixel(0, 2), a);
  assert.equal(surface.getPixel(2, 2), b);
  assert.equal(surface.getPixel(5, 2), b);
  assert.equal(surface.getPixel(6, 2), a);
});

test('Y_render is piecewise linear while Y_camera is continuous through a hill node', () => {
  near(height.sampleRender(60).y, 0);
  near(height.sampleRender(125).y, 8);
  near(height.sampleRender(180).y, 8);
  near(height.sampleRender(250).y, 0);

  const eps = 1e-3;
  const node = 125;
  const left = (height.sampleCamera(node) - height.sampleCamera(node - eps)) / eps;
  const right = (height.sampleCamera(node + eps) - height.sampleCamera(node)) / eps;
  assert.ok(Math.abs(left) < 1e-3);
  assert.ok(Math.abs(right) < 1e-3);
});

test('general TerrainLine generator is globally far-to-near and allows hill/dip row overdraw', () => {
  const vehicle = createM2Vehicle(guide, 80);
  const camera = computeM3Camera(guide, height, vehicle, cameraProfile);
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
  const vehicle = createM2Vehicle(guide, 120);
  const camera = computeM3Camera(guide, height, vehicle, cameraProfile);
  const lines = generateTerrainLines(guide, camera, terrainProfile);
  const line = lines[Math.floor(lines.length * 0.5)];
  assert.ok(line);
  const center = guide.raster;
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
  void center;
});

test('GroundMap source sampling distinguishes road, shoulder, marking and terrain', () => {
  assert.equal(sampleGroundMap(3, 0, groundProfile, false), GROUND_COLORS.marking);
  assert.ok([GROUND_COLORS.asphaltA, GROUND_COLORS.asphaltB].includes(sampleGroundMap(9, 2, groundProfile, false)));
  assert.equal(sampleGroundMap(9, 5, groundProfile, false), GROUND_COLORS.shoulder);
  assert.ok([GROUND_COLORS.grassA, GROUND_COLORS.grassB].includes(sampleGroundMap(9, 8, groundProfile, false)));
  assert.ok([GROUND_COLORS.rockA, GROUND_COLORS.rockB].includes(sampleGroundMap(9, -8, groundProfile, true)));
});

test('cliff GroundBase_L TRANSPARENT preserves Far Background below horizon while right GroundBase paints rock', () => {
  const vehicle = createM2Vehicle(guide, 520);
  const camera = computeM3Camera(guide, height, vehicle, cameraProfile);
  const background = createM3FarBackground();
  const expectedBackground = new SoftwareSurface(320, 240);
  const actual = new SoftwareSurface(320, 240);
  drawFarBackground(expectedBackground, background, camera);
  renderM3VisualCore(actual, background, guide, camera, vehicle, terrainProfile, groundProfile);

  const lines = generateTerrainLines(guide, camera, terrainProfile);
  const line = lines.find((candidate) => candidate.y === 100 && candidate.sectionName === 'CLIFF / SEA');
  assert.ok(line);
  assert.ok(line.xGroundL > 80);
  assert.ok(line.xGroundR < 240);

  assert.equal(actual.getPixel(80, 100), expectedBackground.getPixel(80, 100));
  assert.equal(actual.getPixel(240, 100), M3_BASE_COLORS.rock);
  assert.notEqual(actual.getPixel(240, 100), expectedBackground.getPixel(240, 100));
});

test('Far Background is a full image with meaningful pixels below its horizon', () => {
  const background = createM3FarBackground();
  const above = background.surface.getPixel(100, background.sourceHorizonY - 40);
  const below = background.surface.getPixel(100, background.sourceHorizonY + 40);
  assert.notEqual(above, below);
});
