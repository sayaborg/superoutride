import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM5CameraRig, updateM5Camera } from '../dist/dev/m5-camera.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM5Car } from '../dist/physics/car-physics.js';
import { createM5DebugSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { BakedGroundMapAsset } from '../dist/visual/baked-ground-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { sampleGroundMap } from '../dist/visual/ground-map.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile } from '../dist/visual/m3-debug-visual.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createM4DebugWorldSprites } from '../dist/world/m4-debug-world.js';

const metadata = JSON.parse(await readFile(new URL('../dist/assets/m5-ground-map.json', import.meta.url), 'utf8'));
const binary = new Uint8Array(await readFile(new URL('../dist/assets/m5-ground-map.bin', import.meta.url)));
const baked = new BakedGroundMapAsset(metadata, binary);
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
const compiledSurfaces = compileSurfaceRegions(
  guide.length,
  createM5DebugSurfaceRegionAuthoring(guide.length),
);
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
  junction: M6_13_JUNCTION,
  logical: compiledSurfaces.groundMap,
  baked,
};

const deg = (value) => value * Math.PI / 180;

test('M5.7 baked asset keeps base density at least as fine as M5.4 authority and reaches kMax=6', () => {
  assert.equal(baked.kMax, 6);
  assert.ok(metadata.actualBaseQL <= metadata.qLAuthority + 1e-12);
  assert.ok(metadata.actualBaseQS <= metadata.qSAuthority + 1e-12);
  assert.equal(metadata.levels.length, 7);
  for (let k = 1; k <= 6; k += 1) {
    assert.equal(metadata.levels[k].lateralTexels, metadata.levels[k - 1].lateralTexels / 2);
    assert.equal(metadata.levels[k].chainageTexels, metadata.levels[k - 1].chainageTexels / 4);
  }
  assert.ok(metadata.levels[5].qSActual < 141.01635292107866);
  assert.ok(metadata.levels[6].qSActual >= 147.5);
});

test('level-0 baked texel centers are exactly semantically equivalent to the procedural authoring source', () => {
  const level = metadata.levels[0];
  const rows = [0, 1, 137, Math.floor(level.chainageTexels / 2), level.chainageTexels - 1];
  const columns = [0, 100, 299, Math.floor(level.lateralTexels / 2), 660, level.lateralTexels - 1];
  for (const row of rows) {
    for (const column of columns) {
      const { s, l } = baked.texelCenter(0, row, column);
      assert.equal(baked.sampleAtLevel(s, l, 0), sampleGroundMap(s, l, groundProfile));
    }
  }
});

test('runtime GroundMap level selection is chainage-only and reaches level 6 for the proven far footprint', () => {
  assert.equal(baked.selectLevel(metadata.qSAuthority), 0);
  assert.equal(baked.selectLevel(141.01635292107866), 6);
  const sample = baked.sample(100, 0, 141.01635292107866);
  assert.equal(sample.level, 6);
  assert.ok(Number.isInteger(sample.color));
});

test('baked GroundMap preserves cyclic course addressing at every pyramid level', () => {
  for (let k = 0; k <= baked.kMax; k += 1) {
    const a = baked.sampleAtLevel(123.456, 2.25, k);
    const b = baked.sampleAtLevel(123.456 + guide.length, 2.25, k);
    const c = baked.sampleAtLevel(123.456 - guide.length, 2.25, k);
    assert.equal(a, b);
    assert.equal(a, c);
  }
});

test('chunked palette/RGB555 binary stays substantially below raw RGBA pyramid size', () => {
  const chunkRefs = metadata.levels.reduce((sum, level) => sum + level.chunks.length, 0);
  assert.ok(chunkRefs > 7);
  assert.ok(metadata.payloads.length <= chunkRefs);
  assert.equal(metadata.binaryBytes, binary.byteLength);
  assert.ok(metadata.binaryBytes < metadata.uncompressedRgbaBytes * 0.35);
  assert.equal(metadata.levels[0].format, 'palette8');
  for (let k = 1; k <= 6; k += 1) assert.equal(metadata.levels[k].format, 'rgb555le');
});

test('M5 renderer consumes baked per-TerrainLine LOD rather than procedural GroundMap', () => {
  const surfaces = createM5DebugSurfaceMap(guide.length);
  const car = createM5Car(guide, height, surfaces, 45);
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
  const camera = updateM5Camera(createM5CameraRig(), guide, height, car, cameraProfile, 1 / 60);
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
  const assets = createM4SpriteAssets();
  const world = createM4DebugWorldSprites(guide, height, assets);
  const stats = renderM5Driving(
    new SoftwareSurface(320, 240),
    createM3FarBackground(),
    guide,
    camera,
    car,
    terrainProfile,
    groundProfile,
    world,
    assets,
    'car',
  );
  assert.equal(stats.groundMapBaked, true);
  assert.ok(stats.groundMapMaxLevel > 0);
  assert.ok(stats.groundMapMaxLevel <= 6);
});
