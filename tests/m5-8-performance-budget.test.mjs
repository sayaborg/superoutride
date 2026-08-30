import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  deriveProvisionalRenderBudget,
  M5_8_DEBUG_HEADROOM_FACTOR,
  M5_8_DEBUG_OBSERVED_BASELINE,
  M5_8_DEBUG_TARGET_BUDGET,
  summarizeRenderWorkloads,
  validateRenderWorkload,
} from '../dist/compiler/render-budget.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../dist/core/presentation-scale.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { drawScaledSprite } from '../dist/render/sprite.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { BakedGroundMapAsset } from '../dist/visual/baked-ground-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { createM4DebugWorldSprites } from '../dist/dev/m4-debug-world.js';

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
  dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
  dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  height,
  visual,
  thinSpanScreenRows: 1,
};
const cameraProfile = CURRENT_M5_CAMERA_PROFILE;

function placeCar(car, s, l, yawOffset) {
  const p = guideCourseToWorld(guide, s, l);
  const surface = surfaces.sample(s, l);
  car.x = p.x;
  car.z = p.z;
  car.y = height.samplePhysics(s) + 0.55;
  car.yaw = p.heading + yawOffset;
  car.velocityX = Math.sin(car.yaw) * 45;
  car.velocityY = 0;
  car.velocityZ = Math.cos(car.yaw) * 45;
  car.yawRate = 0;
  car.frontSteerAngle = 0;
  car.course = { s: p.s, l, segmentIndex: p.segmentIndex, distanceSquared: 0 };
  car.surfaceType = surface.type;
  car.frontNormalLoad = surface.material.supported ? 1 : 0;
  car.rearNormalLoad = surface.material.supported ? 1 : 0;
}

function renderProbe(s, l, yawOffset) {
  const car = createTestCar(guide, height, surfaces, s);
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

function currentStressSweep() {
  const samples = [];
  const yawOffsets = [deg(-60), 0, deg(60)];
  for (let s = 10; s < guide.length; s += 40) {
    for (const yawOffset of yawOffsets) samples.push(renderProbe(s, 0, yawOffset));
  }
  for (const s of [470, 510, 550, 590, 620]) {
    samples.push(renderProbe(s, -5, 0), renderProbe(s, 5, 0));
  }
  return summarizeRenderWorkloads(samples);
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

test('current debug content sweep remains inside the explicit M5.8 provisional target budget', () => {
  const observed = currentStressSweep();
  assert.ok(observed.frameCount >= 60);
  assert.equal(observed.maxGroundMapLevelUsed, 6);
  assert.deepEqual(observed, M5_8_DEBUG_OBSERVED_BASELINE);
  assert.deepEqual(validateRenderWorkload(observed, M5_8_DEBUG_TARGET_BUDGET), []);
  console.log('M5.8 OBSERVED RENDER WORKLOAD', JSON.stringify(observed));
  console.log('M5.8 PROVISIONAL DEBUG BUDGET', JSON.stringify(M5_8_DEBUG_TARGET_BUDGET));
});

test('M5.8 provisional budget is mechanically derived from the recorded baseline and one explicit 25% margin', () => {
  assert.equal(M5_8_DEBUG_HEADROOM_FACTOR, 1.25);
  assert.deepEqual(
    deriveProvisionalRenderBudget(M5_8_DEBUG_OBSERVED_BASELINE, M5_8_DEBUG_HEADROOM_FACTOR),
    M5_8_DEBUG_TARGET_BUDGET,
  );
  const tooSmall = {
    ...M5_8_DEBUG_TARGET_BUDGET,
    terrainOutputPixelsPerFrameMax: M5_8_DEBUG_OBSERVED_BASELINE.maxTerrainOutputPixelsPerFrame - 1,
  };
  const violations = validateRenderWorkload(M5_8_DEBUG_OBSERVED_BASELINE, tooSmall);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].metric, 'terrainOutputPixelsPerFrameMax');
});
