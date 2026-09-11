import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';

import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { guidePathToWorld } from '../dist/core/guide-curve.js';
import { CURRENT_RENDER_FAR_DEPTH_METERS, CURRENT_RENDER_NEAR_DEPTH_METERS } from '../dist/core/presentation-scale.js';
import { createRoadsideSprites } from '../dist/dev/courses/roadside-scenery.js';
import { createStadiumSurfaceRegionAuthoring } from '../dist/dev/courses/stadium-surface-authoring.js';
import { createHillDipHeightProfile } from '../dist/dev/fixtures/hill-dip-height.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { SoftwareSurface } from '../dist/graphics/software-surface.js';
import { drawScaledSprite } from '../dist/graphics/sprite.js';
import { BakedGroundMapAsset } from '../dist/groundmap/baked-ground-map.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { summarizeRenderWorkloads } from '../dist/render/render-workload.js';
import { renderDriving } from '../dist/render/renderer.js';
import { compileSurfaceRegions } from '../dist/runtime/surface-region-compiler.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';

const deg = (value) => (value * Math.PI) / 180;
const guide = createStadiumGuide();
const height = createHillDipHeightProfile(guide.length);
const compiled = compileSurfaceRegions(guide.length, createStadiumSurfaceRegionAuthoring(guide.length));
const visual = new VisualProfile(guide.length, compiled.visualSections);
const surfaces = new SurfaceMap(guide.length, compiled.surfaceSections);
const assets = createSpriteAssets();
const world = createRoadsideSprites(guide, height, assets);
const background = createFarBackground();
const metadata = JSON.parse(await readFile(new URL('../dist/assets/stadium-ground-map.json', import.meta.url), 'utf8'));
const binary = await readFile(new URL('../dist/assets/stadium-ground-map.bin', import.meta.url));
const baked = new BakedGroundMapAsset(metadata, new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength));
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  roadMarkings: CENTER_DASH_MARKINGS,
  junctionMarkings: CENTER_DASH_MARKINGS,
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
const cameraProfile = CURRENT_CAMERA_PROFILE;

function placeCar(car, s, l, yawOffset) {
  const p = guidePathToWorld(guide, s, l);
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

function renderProbe(
  s,
  l,
  yawOffset,
  observeWorkload = true,
  target = new SoftwareSurface(320, 240),
  renderer = renderDriving,
) {
  const car = createTestCar(guide, height, surfaces, s);
  placeCar(car, s, l, yawOffset);
  const camera = updateCamera(createCameraRig(), { guide, height }, car, cameraProfile, 1 / 60);
  return renderer(
    target,
    {
      background,
      guide,
      camera,
      vehicle: car,
      terrainProfile,
      groundProfile,
      worldSprites: world,
      assets,
      playerKind: 'car',
    },
    { observeWorkload },
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
  assert.equal(
    perLineSamples.reduce((a, b) => a + b, 0),
    stats.outputSamples,
  );
  assert.equal(
    perLineWrites.reduce((a, b) => a + b, 0),
    stats.writtenPixels,
  );
});

test('renderer workload telemetry is internally consistent and does not drop generated terrain', () => {
  const stats = renderProbe(120, 0, 0);
  assert.ok(stats.terrainLineCount > 0);
  assert.ok(stats.workload.terrainLineCountPerScreenRowMax >= 1);
  assert.ok(stats.workload.terrainOutputPixelsPerScreenRowMax <= stats.terrainOutputPixels);
  assert.equal(stats.spriteOutputSamplesIncludingPlayer, stats.spriteOutputSamples + stats.playerOutputSamples);
  assert.equal(stats.spriteWrittenPixelsIncludingPlayer, stats.spriteWrittenPixels + stats.playerWrittenPixels);
  assert.equal(
    stats.workload.groundMapLevelHistogram.reduce((a, b) => a + b, 0),
    stats.terrainLineCount,
  );
  assert.ok(stats.workload.spriteOutputSamplesPerScanlineMax <= stats.spriteOutputSamplesIncludingPlayer);
});

test('optional diagnostics preserve exact pixels and ordinary results across the stress course', async () => {
  let baseline;
  if (process.env.HOT_PATH_BASELINE_BUILD) {
    const build = process.env.HOT_PATH_BASELINE_BUILD;
    const currentApi = existsSync(resolve(build, 'render/renderer.js'));
    const module = await import(
      pathToFileURL(resolve(build, currentApi ? 'render/renderer.js' : 'render/m5-renderer.js')).href
    );
    baseline = currentApi
      ? module.renderDriving
      : (target, scene, options) =>
          module.renderM5Driving(
            target,
            scene.background,
            scene.guide,
            scene.camera,
            scene.vehicle,
            scene.terrainProfile,
            scene.groundProfile,
            scene.worldSprites,
            scene.assets,
            scene.playerKind,
            options.roadView,
            options.observeWorkload,
          );
  }
  for (const s of [45, 120, 470, 550, 620]) {
    for (const yaw of [deg(-60), 0, deg(60)]) {
      const ordinary = new SoftwareSurface(320, 240);
      const observed = new SoftwareSurface(320, 240);
      const plain = renderProbe(s, 0, yaw, false, ordinary);
      const detailed = renderProbe(s, 0, yaw, true, observed);
      assert.deepEqual(ordinary.pixels, observed.pixels);
      assert.equal(plain.workload, undefined);
      assert.ok(detailed.workload);
      const { workload, ...result } = detailed;
      assert.deepEqual(plain, { ...result, workload: undefined });
      assert.throws(() => summarizeRenderWorkloads([plain]), /explicitly enabled/);
      if (baseline) {
        const reference = new SoftwareSurface(320, 240);
        const old = renderProbe(s, 0, yaw, true, reference, baseline);
        assert.deepEqual(ordinary.pixels, reference.pixels);
        assert.deepEqual(detailed, old);
      }
    }
  }
});

test('ordinary rendering allocates no diagnostic row arrays or scanline observer', async () => {
  const source = await readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
  assert.match(source, /const observation = observeWorkload\s*\? \{/);
  const allocation = source.slice(source.indexOf('const observation'), source.indexOf('let terrainOutputPixels'));
  assert.equal((allocation.match(/new Uint/g) ?? []).length, 5);
  assert.equal((source.match(/new Uint/g) ?? []).length, 5);
  assert.match(source, /spriteObserver: SpriteScanlineObserver \| undefined =\s*observation &&/);
  assert.match(source, /if \(observation\) \{[\s\S]*for \(let y = 0/);
});

test('live stress reduction reports observed work without an invented target budget', () => {
  const observed = currentStressSweep();
  assert.ok(observed.frameCount >= 60);
  assert.ok(observed.maxVisibleSpriteCount > 0);
  assert.ok(observed.maxGroundMapLevelUsed <= baked.kMax);
  assert.ok(observed.maxTerrainOutputPixelsPerFrame <= observed.maxTerrainLineCount * 320);
  assert.ok(observed.maxSpriteWrittenPixelsPerFrame <= observed.maxSpriteOutputSamplesPerFrame);
  assert.ok(observed.maxSpriteWrittenPixelsPerScanline <= observed.maxSpriteOutputSamplesPerScanline);
});
