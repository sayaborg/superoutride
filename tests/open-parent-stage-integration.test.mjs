import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createTestBike, createTestCar } from './helpers/vehicle-fixture.mjs';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { createTunnelPresentation, selectTunnelBackground } from '../dist/dev/tunnel.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));

const cameraProfile = {
  dCam: 5,
  height: 2.469902425419539,
  baseDownPitch: (8 * Math.PI) / 180,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
};

test('M6.47 live parent stage constructs open VisualProfile and SurfaceMap instead of cyclic adapters', async () => {
  const [mainSource, fixtureSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m7-2-default-branching-highway.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(mainSource, /createM72DefaultBranchingParent/);
  assert.match(fixtureSource, /new VisualProfile\(guide\.length/);
  assert.match(fixtureSource, /new SurfaceMap\(/);
  assert.doesNotMatch(mainSource + fixtureSource, /CyclicVisualProfile/);
  assert.doesNotMatch(mainSource + fixtureSource, /CyclicSurfaceMap/);
});

test('M6.47 parent visual and surface sources own the real open [0,L] domain', () => {
  const visual = new VisualProfile(guide.length, compiled.visualSections);
  const surfaces = new SurfaceMap(guide.length, compiled.surfaceSections);

  assert.ok(visual.sample(0));
  assert.ok(visual.sample(guide.length));
  assert.ok(surfaces.sample(0, 0));
  assert.ok(surfaces.sample(guide.length, 0));

  assert.throws(() => visual.sample(-1e-6), RangeError);
  assert.throws(() => visual.sample(guide.length + 1e-6), RangeError);
  assert.throws(() => surfaces.sample(-1e-6, 0), RangeError);
  assert.throws(() => surfaces.sample(guide.length + 1e-6, 0), RangeError);
});

test('M6.47 M5.9 tunnel background is one ordinary open interval and never wraps endpoints', () => {
  const outdoor = createFarBackground();
  const tunnel = createTunnelPresentation(guide.length, 5);

  assert.equal(
    selectTunnelBackground(tunnel.cameraTransitionStartS - 1e-6, guide.length, outdoor, tunnel).kind,
    'OUTDOOR',
  );
  assert.equal(selectTunnelBackground(tunnel.cameraTransitionStartS, guide.length, outdoor, tunnel).kind, 'TUNNEL');
  assert.equal(
    selectTunnelBackground(tunnel.cameraTransitionEndS - 1e-6, guide.length, outdoor, tunnel).kind,
    'TUNNEL',
  );
  assert.equal(selectTunnelBackground(tunnel.cameraTransitionEndS, guide.length, outdoor, tunnel).kind, 'OUTDOOR');
  assert.throws(() => selectTunnelBackground(-1e-6, guide.length, outdoor, tunnel), RangeError);
  assert.throws(() => selectTunnelBackground(guide.length + 1e-6, guide.length, outdoor, tunnel), RangeError);
});

test('M6.47 ordinary car bike and M5 camera consume the open HeightProfile reader directly', () => {
  const surfaces = new SurfaceMap(guide.length, compiled.surfaceSections);
  const car = createTestCar(guide, height, surfaces, 45);
  const bike = createTestBike(guide, height, surfaces, 45);
  const camera = updateCamera(createCameraRig(), { guide, height }, car, cameraProfile, 1 / 60);

  assert.equal(Number.isFinite(car.y), true);
  assert.equal(Number.isFinite(bike.y), true);
  assert.equal(camera.s, car.course.s - cameraProfile.dCam);
  assert.equal(Number.isFinite(camera.groundHeight), true);
});

test('M6.47 camera physics world and shared-runtime contracts no longer require cyclic height or surface types', async () => {
  const heightReaderFiles = [
    '../src/camera/camera.ts',
    '../src/physics/vehicle-contract.ts',
    '../src/dev/shared-runtime-content.ts',
    '../src/physics/arcade-vehicle-physics.ts',
    '../src/dev/m4-debug-world.ts',
    '../src/dev/tunnel.ts',
  ];
  for (const path of heightReaderFiles) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /CyclicHeightProfile/, path);
    assert.match(source, /HeightProfileReader|VehicleWorld/, path);
  }

  const sharedRuntime = await readFile(new URL('../src/dev/shared-runtime-content.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sharedRuntime, /CyclicSurfaceMap/);
  assert.match(sharedRuntime, /surfaceMap: SurfaceMap/);
});

test('M6.47 tunnel presentation contains no implicit modulo or wrapPositive topology', async () => {
  const source = await readFile(new URL('../src/dev/tunnel.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wrapPositive/);
  assert.doesNotMatch(source, /cyclicIntervalContains/);
  assert.match(source, /cameraS < 0 \|\| cameraS > courseLength/);
});
