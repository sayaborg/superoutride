import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  deriveProvisionalRenderBudget,
  summarizeRenderWorkloads,
  validateRenderWorkload,
} from '../dist/compiler/render-budget.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { createM5CameraRig, updateM5Camera } from '../dist/dev/m5-camera.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM5Car } from '../dist/physics/car-physics.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { drawScaledSprite } from '../dist/render/sprite.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { BakedGroundMapAsset } from '../dist/visual/baked-ground-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { createM4DebugWorldSprites } from '../dist/world/m4-debug-world.js';

const deg = (value) => value * Math.PI / 180;
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
const visual = new CyclicVisualProfile(guide.length, compiled.visualSections);
const surfaces = new CyclicSurfaceMap(guide.length, compiled.surfaceSections);
const assets = createM4SpriteAssets();
const world = createM4DebugWorldSprites(guide, height, assets);
const background = createM3FarBackground();
const metadata = JSON.parse(await readFile(new URL('../dist/assets/m5-ground-map.json', import.meta.url), 'utf8'));
const binary = await readFile(new URL('../dist/assets/m5-ground-map.bin', import.meta.url));
const baked = new BakedGroundMapAsset(metadata, new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength));
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
  logical: compiled.groundMap,
  baked,
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
  thinSpanScreenRows: 1,
};
const cameraProfile = {
  dCam: 5,
  lCamMax: 12,
  height: 2.469902425419539,
  pitch: deg(8),
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: deg(20),
  sDotMin: 8,
  tauLat: 0.18,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
  playerSafeXMin: 48,
  playerSafeXMax: 272,
};

function placeCar(car, s, l, yawOffset) {
  const p = guideCourseToWorld(guide, s, l);
  const surface = surfaces.sample(s, l);
  car.x = p.x;
  car.z = p.z;
  car.y = height.samplePhysics(s);
  car.yaw = p.heading + yawOffset;
  car.speed = 45;
  car.longitudinalSpeed = 45;
  car.lateralSpeed = 0;
  car.yawRate = 0;
  car.steerAngle = 0;
  car.course = { s: p.s, l, segmentIndex: p.segmentIndex, distanceSquared: 0 };
  car.verticalSpeed = 0;
  car.surfaceType = surface.type;
  car.supported = surface.material.supported;
}

function renderProbe(s, l, yawOffset) {
  const car = createM5Car(guide, height, surfaces, s);
  placeCar(car, s, l, yawOffset);
  const camera = updateM5Camera(createM5CameraRig(), guide, height, car, cameraProfile, 1 / 60);
  return renderM5Driving(
    new SoftwareSurface(320, 240),
    background,
    guide,
    camera,
    car,
    terrainProfile,
    groundProfile,
    world,
    assets,
    'car',
  );
}

test('sprite scanline observer accounts exactly for the blitter work it observes', () => {
  const target = new SoftwareSurface(320, 240);
  const perLineSamples = new Uint32Array(240);
  const perLineWrites = new Uint32Array(240);
  const stats = drawScaledSprite(target, assets.car.assets[0], 160, 190, 40, (y, samples, writes) => {
    perLineSamples[y] += samples;
    perLineWrites[y] += writes;
  });
  assert.equal(perLineSamples.reduce((a, b) => a + b, 0), stats.outputSamples);
  assert.equal(perLineWrites.reduce((a, b) => a + b, 0), stats.writtenPixels);
});

test('M5 renderer workload telemetry is internally consistent and does not drop generated terrain', () => {
  const stats = renderProbe(120, 0, 0);
  assert.ok(stats.terrainLineCount > 0);
  assert.ok(stats.terrainLineCountPerScreenRowMax >= 1);
  assert.ok(stats.terrainOutputPixelsPerScreenRowMax <= stats.terrainOutputPixels);
  assert.equal(stats.spriteOutputSamplesIncludingPlayer, stats.spriteOutputSamples + stats.playerOutputSamples);
  assert.equal(stats.spriteWrittenPixelsIncludingPlayer, stats.spriteWrittenPixels + stats.playerWrittenPixels);
  assert.equal(stats.groundMapLevelHistogram.reduce((a, b) => a + b, 0), stats.terrainLineCount);
  assert.ok(stats.spriteOutputSamplesPerScanlineMax <= stats.spriteOutputSamplesIncludingPlayer);
});

test('current debug content sweep reports actual terrain/sprite frame and scanline workload maxima', () => {
  const samples = [];
  const yawOffsets = [deg(-60), 0, deg(60)];
  for (let s = 10; s < guide.length; s += 40) {
    for (const yawOffset of yawOffsets) samples.push(renderProbe(s, 0, yawOffset));
  }
  // Add lateral road-edge probes around the dense cliff/rail region.
  for (const s of [470, 510, 550, 590, 620]) {
    samples.push(renderProbe(s, -5, 0), renderProbe(s, 5, 0));
  }
  const observed = summarizeRenderWorkloads(samples);
  assert.ok(observed.frameCount >= 60);
  assert.ok(observed.maxTerrainLineCount > 100);
  assert.ok(observed.maxTerrainOutputPixelsPerFrame > 320 * 100);
  assert.ok(observed.maxTerrainOutputPixelsPerScreenRow >= 320);
  assert.ok(observed.maxSpriteOutputSamplesPerFrame > 0);
  assert.ok(observed.maxSpriteOutputSamplesPerScanline > 0);
  assert.equal(observed.maxGroundMapLevelUsed, 6);
  console.log('M5.8 OBSERVED RENDER WORKLOAD', JSON.stringify(observed));
});

test('provisional budget derivation exposes one explicit headroom factor and validator reports real violations', () => {
  const observed = summarizeRenderWorkloads([
    renderProbe(510, 0, 0),
    renderProbe(590, 0, deg(40)),
  ]);
  const budget = deriveProvisionalRenderBudget(observed, 1.25);
  assert.equal(budget.headroomFactor, 1.25);
  assert.deepEqual(validateRenderWorkload(observed, budget), []);
  const tooSmall = { ...budget, terrainOutputPixelsPerFrameMax: observed.maxTerrainOutputPixelsPerFrame - 1 };
  const violations = validateRenderWorkload(observed, tooSmall);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].metric, 'terrainOutputPixelsPerFrameMax');
});
