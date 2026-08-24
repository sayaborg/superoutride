import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM5CameraRig, updateM5Camera } from '../dist/dev/m5-camera.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM5Car } from '../dist/physics/car-physics.js';
import { createM5Bike } from '../dist/physics/motorcycle-physics.js';
import { CyclicSurfaceMap, SurfaceMap } from '../dist/physics/surface-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import {
  createM5TunnelPresentation,
  selectM5FarBackground,
} from '../dist/visual/m5-9-tunnel.js';
import { CyclicVisualProfile, VisualProfile } from '../dist/visual/visual-profile.js';

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const compiled = compileSurfaceRegions(
  guide.length,
  createM5DebugSurfaceRegionAuthoring(guide.length),
);

const cameraProfile = {
  dCam: 5,
  lCamMax: 12,
  height: 2.469902425419539,
  pitch: 8 * Math.PI / 180,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: 20 * Math.PI / 180,
  sDotMin: 8,
  tauLat: 0.18,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
  playerSafeXMin: 48,
  playerSafeXMax: 272,
};

test('M6.47 live parent stage constructs open VisualProfile and SurfaceMap instead of cyclic adapters', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /new VisualProfile\(guide\.length, compiledSurfaces\.visualSections\)/);
  assert.match(source, /new SurfaceMap\(guide\.length, compiledSurfaces\.surfaceSections, M6_13_JUNCTION\)/);
  assert.doesNotMatch(source, /CyclicVisualProfile/);
  assert.doesNotMatch(source, /CyclicSurfaceMap/);
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
  const outdoor = createM3FarBackground();
  const tunnel = createM5TunnelPresentation(guide.length, 5);

  assert.equal(selectM5FarBackground(tunnel.cameraTransitionStartS - 1e-6, guide.length, outdoor, tunnel).kind, 'OUTDOOR');
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionStartS, guide.length, outdoor, tunnel).kind, 'TUNNEL');
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionEndS - 1e-6, guide.length, outdoor, tunnel).kind, 'TUNNEL');
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionEndS, guide.length, outdoor, tunnel).kind, 'OUTDOOR');
  assert.throws(() => selectM5FarBackground(-1e-6, guide.length, outdoor, tunnel), RangeError);
  assert.throws(() => selectM5FarBackground(guide.length + 1e-6, guide.length, outdoor, tunnel), RangeError);
});

test('M6.47 ordinary car bike and M5 camera consume the open HeightProfile reader directly', () => {
  const surfaces = new SurfaceMap(guide.length, compiled.surfaceSections);
  const car = createM5Car(guide, height, surfaces, 45);
  const bike = createM5Bike(guide, height, surfaces, 45);
  const camera = updateM5Camera(createM5CameraRig(), guide, height, car, cameraProfile, 1 / 60);

  assert.equal(Number.isFinite(car.y), true);
  assert.equal(Number.isFinite(bike.y), true);
  assert.equal(camera.s, car.course.s - cameraProfile.dCam);
  assert.equal(Number.isFinite(camera.groundHeight), true);
});

test('M6.47 camera physics world and shared-runtime contracts no longer require cyclic height or surface types', async () => {
  const heightReaderFiles = [
    '../src/dev/m3-camera.ts',
    '../src/dev/m4-camera.ts',
    '../src/dev/m5-camera.ts',
    '../src/dev/m6-20-live-runtime-content.ts',
    '../src/physics/car-physics.ts',
    '../src/physics/motorcycle-physics.ts',
    '../src/world/m4-debug-world.ts',
    '../src/world/m5-9-tunnel-world.ts',
  ];
  for (const path of heightReaderFiles) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /CyclicHeightProfile/, path);
    assert.match(source, /HeightProfileReader/, path);
  }

  const sharedRuntime = await readFile(
    new URL('../src/dev/m6-20-live-runtime-content.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(sharedRuntime, /CyclicSurfaceMap/);
  assert.match(sharedRuntime, /surfaceMap: SurfaceMap/);
});

test('M6.47 tunnel presentation contains no implicit modulo or wrapPositive topology', async () => {
  const source = await readFile(new URL('../src/visual/m5-9-tunnel.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wrapPositive/);
  assert.doesNotMatch(source, /cyclicIntervalContains/);
  assert.match(source, /cameraS < 0 \|\| cameraS > courseLength/);
});

test('M6.47 explicit cyclic adapters remain available for a future upper-level CIRCUIT choice', () => {
  const visual = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaces = new CyclicSurfaceMap(guide.length, compiled.surfaceSections);
  const probe = 17.25;

  assert.deepEqual(visual.sample(probe), visual.sample(probe + guide.length));
  assert.deepEqual(surfaces.sample(probe, 0), surfaces.sample(probe + guide.length, 0));
});
