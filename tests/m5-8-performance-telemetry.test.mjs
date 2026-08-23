import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { summarizeRenderBudgetObservations } from '../dist/compiler/render-budget-analysis.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { createM5CameraRig, updateM5Camera } from '../dist/dev/m5-camera.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM5Car } from '../dist/physics/car-physics.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { generateTerrainLines } from '../dist/road/terrain-line.js';
import { BakedGroundMapAsset } from '../dist/visual/baked-ground-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { createM4DebugWorldSprites } from '../dist/world/m4-debug-world.js';

const deg = (value) => value * Math.PI / 180;
const metadata = JSON.parse(await readFile(new URL('../dist/assets/m5-ground-map.json', import.meta.url), 'utf8'));
const binary = new Uint8Array(await readFile(new URL('../dist/assets/m5-ground-map.bin', import.meta.url)));
const baked = new BakedGroundMapAsset(metadata, binary);
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
const visual = new CyclicVisualProfile(guide.length, compiled.visualSections);
const surfaces = new CyclicSurfaceMap(guide.length, compiled.surfaceSections);
const assets = createM4SpriteAssets();
const worldSprites = createM4DebugWorldSprites(guide, height, assets);
const background = createM3FarBackground();
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
};
const cameraProfile = {
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  lCamMax: 12,
  height: 2.469902425419539,
  pitch: deg(8),
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: deg(20),
  sDotMin: 8,
  tauLat: 0.18,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
};

function placeCar(car, s, l = 0, yawOffset = 0, speed = 35) {
  const p = guideCourseToWorld(guide, s, l);
  car.x = p.x;
  car.z = p.z;
  car.y = height.samplePhysics(s);
  car.yaw = p.heading + yawOffset;
  car.longitudinalSpeed = speed;
  car.lateralSpeed = 0;
  car.yawRate = 0;
  car.speed = speed;
  car.course = { s: p.s, l, segmentIndex: p.segmentIndex, distanceSquared: 0 };
  car.verticalSpeed = 0;
  const surface = surfaces.sample(s, l);
  car.surfaceType = surface.type;
  car.supported = surface.material.supported;
}

function renderAt(s, yawOffset = 0, l = 0) {
  const car = createM5Car(guide, height, surfaces, s);
  placeCar(car, s, l, yawOffset);
  const camera = updateM5Camera(createM5CameraRig(), guide, height, car, cameraProfile, 1 / 60);
  const target = new SoftwareSurface(320, 240);
  const result = renderM5Driving(
    target,
    background,
    guide,
    camera,
    car,
    terrainProfile,
    groundProfile,
    worldSprites,
    assets,
    'car',
  );
  return { result, camera, car };
}

test('prepared GroundMap row path is exactly equivalent to ordinary baked sampling', () => {
  for (const level of [0, 1, 3, 6]) {
    for (const s of [0.01, 63.9, 127.1, 520.25, guide.length - 0.01]) {
      const row = baked.prepareRow(s, level);
      for (const l of [-11.75, -5, 0, 4.75, 11.8]) {
        const column = baked.lateralToSourceColumn(level, l);
        assert.equal(
          baked.samplePreparedColumn(row, column),
          baked.sampleAtLevel(s, l, level),
        );
      }
    }
  }
});

test('M5 renderer telemetry histograms preserve exact frame totals', () => {
  const { result, camera } = renderAt(125, deg(20));
  assert.equal(result.groundMapBaked, true);
  assert.equal(result.groundMapLevelLineCounts.reduce((a, b) => a + b, 0), result.terrainLineCount);
  assert.equal(result.groundMapLevelOutputPixels.reduce((a, b) => a + b, 0), result.terrainOutputPixels);
  assert.ok(result.terrainLinesMaxPerRow >= 1);
  assert.ok(result.terrainOutputPixelsMaxPerRow <= result.terrainLinesMaxPerRow * 320);
  assert.ok(result.spriteOutputSamplesMaxPerScanline <= result.spriteOutputSamples + result.playerOutputSamples);
  assert.ok(result.groundMapMaxLevel <= 6);

  // Telemetry must not change the Road Generator population used by the renderer.
  assert.equal(
    result.terrainLineCount,
    generateTerrainLines(guide, camera, terrainProfile).length,
  );
});

test('GroundMap LOD histogram shows actual multi-level use without lateral-driven promotion', () => {
  const { result } = renderAt(20, 0);
  const activeLevels = result.groundMapLevelLineCounts
    .map((count, level) => ({ count, level }))
    .filter(({ count }) => count > 0)
    .map(({ level }) => level);
  assert.ok(activeLevels.length >= 2);
  assert.ok(Math.max(...activeLevels) <= 6);
  assert.equal(Math.max(...activeLevels), result.groundMapMaxLevel);
});

test('current debug-course renderer sweep produces finite Core §67 observed maxima', () => {
  const observations = [];
  const yawOffsets = [deg(-40), 0, deg(40)];
  const positions = [20, 60, 100, 125, 180, 250, 300, 380, 450, 520, 600, 700];
  for (const s of positions) {
    for (const yawOffset of yawOffsets) {
      const { result } = renderAt(s, yawOffset);
      observations.push({
        label: `s=${s}/yaw=${Math.round(yawOffset * 180 / Math.PI)}`,
        result,
      });
    }
  }

  const summary = summarizeRenderBudgetObservations(observations);
  assert.equal(summary.frameCount, positions.length * yawOffsets.length);
  assert.ok(summary.maxTerrainLineCount > 100);
  assert.ok(summary.maxTerrainOutputPixelsPerFrame > 320 * 100);
  assert.ok(summary.maxTerrainOutputPixelsPerRow >= 320);
  assert.ok(summary.maxVisibleSpriteCount > 0);
  assert.ok(summary.maxSpriteOutputSamplesPerFrame > 0);
  assert.ok(summary.maxSpriteOutputSamplesPerScanline > 0);
  assert.ok(summary.maxGroundMapLevel > 0 && summary.maxGroundMapLevel <= 6);
  assert.equal(
    summary.groundMapLevelLineCounts.reduce((a, b) => a + b, 0),
    observations.reduce((sum, observation) => sum + observation.result.terrainLineCount, 0),
  );
  console.log('M5.8 OBSERVED RENDER BUDGET', JSON.stringify(summary));
});

test('render budget reducer rejects inconsistent per-level telemetry instead of hiding it', () => {
  const { result } = renderAt(100, 0);
  const broken = {
    ...result,
    groundMapLevelLineCounts: result.groundMapLevelLineCounts.map((value, index) => index === 0 ? value + 1 : value),
  };
  assert.throws(
    () => summarizeRenderBudgetObservations([{ label: 'broken', result: broken }]),
    /line-count histogram/,
  );
});
