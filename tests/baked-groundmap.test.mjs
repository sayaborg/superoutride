import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';

import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { CURRENT_RENDER_FAR_DEPTH_METERS, CURRENT_RENDER_NEAR_DEPTH_METERS } from '../dist/core/presentation-scale.js';
import { createRoadsideSprites } from '../dist/dev/courses/roadside-scenery.js';
import { STADIUM_JUNCTION } from '../dist/dev/courses/stadium-junction.js';
import { createStadiumSurfaceRegionAuthoring } from '../dist/dev/courses/stadium-surface-authoring.js';
import { createCliffVisualProfile } from '../dist/dev/fixtures/cliff-visual.js';
import { createHillDipHeightProfile } from '../dist/dev/fixtures/hill-dip-height.js';
import { createMaterialTransitionSurfaceMap } from '../dist/dev/fixtures/material-transitions.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { SoftwareSurface } from '../dist/graphics/software-surface.js';
import { BakedGroundMapAsset } from '../dist/groundmap/baked-ground-map.js';
import { sampleGroundMap } from '../dist/groundmap/ground-map.js';
import { renderDriving } from '../dist/render/renderer.js';
import { compileSurfaceRegions } from '../dist/runtime/surface-region-compiler.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';

const metadata = JSON.parse(await readFile(new URL('../dist/assets/stadium-ground-map.json', import.meta.url), 'utf8'));
const binary = new Uint8Array(await readFile(new URL('../dist/assets/stadium-ground-map.bin', import.meta.url)));
const baked = new BakedGroundMapAsset(metadata, binary);
const guide = createStadiumGuide();
const height = createHillDipHeightProfile(guide.length);
const visual = createCliffVisualProfile(guide.length);
const compiledSurfaces = compileSurfaceRegions(guide.length, createStadiumSurfaceRegionAuthoring(guide.length));
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  roadMarkings: CENTER_DASH_MARKINGS,
  junctionMarkings: CENTER_DASH_MARKINGS,
  shoulderWidth: 1,
  junction: STADIUM_JUNCTION,
  logical: compiledSurfaces.groundMap,
  baked,
};

test('current baked asset keeps base density at least as fine as authority and reaches kMax=7', () => {
  assert.equal(baked.kMax, 7);
  assert.ok(metadata.actualBaseQL <= metadata.qLAuthority + 1e-12);
  assert.ok(metadata.actualBaseQS <= metadata.qSAuthority + 1e-12);
  assert.equal(metadata.levels.length, 8);
  for (let k = 1; k <= 7; k += 1) {
    assert.equal(metadata.levels[k].lateralTexels, metadata.levels[k - 1].lateralTexels / 2);
    assert.equal(metadata.levels[k].chainageTexels, metadata.levels[k - 1].chainageTexels / 4);
  }
  assert.ok(metadata.levels[6].qSActual < 197.5);
  assert.ok(metadata.levels[7].qSActual >= 197.5);
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

test('runtime GroundMap level selection is chainage-only and reaches level 7 for the proven far footprint', () => {
  assert.equal(baked.selectLevel(metadata.qSAuthority), 0);
  assert.equal(baked.selectLevel(197.5), 7);
  const sample = baked.sample(100, 0, 197.5);
  assert.equal(sample.level, 7);
  assert.ok(Number.isInteger(sample.color));
});

test('baked GroundMap general asset owns an open chainage domain', () => {
  for (let k = 0; k <= baked.kMax; k += 1) {
    assert.doesNotThrow(() => baked.sampleAtLevel(0, 2.25, k));
    assert.doesNotThrow(() => baked.sampleAtLevel(guide.length, 2.25, k));
    assert.throws(() => baked.sampleAtLevel(-0.001, 2.25, k), RangeError);
    assert.throws(() => baked.sampleAtLevel(guide.length + 0.001, 2.25, k), RangeError);
  }
});

test('chunked palette/RGB555 binary stays substantially below raw RGBA pyramid size', () => {
  const chunkRefs = metadata.levels.reduce((sum, level) => sum + level.chunks.length, 0);
  assert.ok(chunkRefs > 7);
  assert.ok(metadata.payloads.length <= chunkRefs);
  assert.equal(metadata.binaryBytes, binary.byteLength);
  assert.ok(metadata.binaryBytes < metadata.uncompressedRgbaBytes * 0.35);
  assert.equal(metadata.levels[0].format, 'palette8');
  for (let k = 1; k <= 7; k += 1) assert.equal(metadata.levels[k].format, 'rgb555le');
});

test('renderer consumes baked per-TerrainLine LOD rather than procedural GroundMap', () => {
  const surfaces = createMaterialTransitionSurfaceMap(guide.length);
  const car = createTestCar(guide, height, surfaces, 45);
  const camera = updateCamera(createCameraRig(), { guide, height }, car, CURRENT_CAMERA_PROFILE, 1 / 60);
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
  };
  const assets = createSpriteAssets();
  const world = createRoadsideSprites(guide, height, assets);
  const stats = renderDriving(
    new SoftwareSurface(320, 240),
    {
      background: createFarBackground(),
      guide,
      camera,
      vehicle: car,
      terrainProfile,
      groundProfile,
      worldSprites: world,
      assets,
      playerKind: 'car',
    },
    {},
  );
  assert.equal(stats.groundMapBaked, true);
  assert.ok(stats.groundMapMaxLevel > 0);
  assert.ok(stats.groundMapMaxLevel <= 6);
});

test('baked asset owns an immutable metadata and byte snapshot after validation', () => {
  const input = structuredClone(metadata);
  const bytes = Uint8Array.from(binary);
  const asset = new BakedGroundMapAsset(input, bytes);
  const expected = asset.sampleAtLevel(0, 0, 0);
  input.courseLength = 1;
  input.levels[0].chunks[0].payloadId = -1;
  input.paletteRgba.fill(0);
  bytes.fill(0);
  assert.equal(asset.sampleAtLevel(0, 0, 0), expected);
  assert.throws(() => {
    asset.metadata.levels[0].chunks[0].payloadId = -1;
  }, TypeError);
});

test('baked payload offsets and formats are rejected before runtime reads', () => {
  for (const offset of [NaN, Infinity, -1, 0.5]) {
    const input = structuredClone(metadata);
    input.payloads[0].offsetBytes = offset;
    assert.throws(() => new BakedGroundMapAsset(input, binary), /outside binary/);
  }
  const input = structuredClone(metadata);
  input.levels.forEach((level) => {
    level.format = 'unknown';
  });
  input.payloads.forEach((payload) => {
    payload.format = 'unknown';
  });
  assert.throws(() => new BakedGroundMapAsset(input, binary), /unsupported.*format/);
});

test('baked texel metrics and sampling reject non-finite coordinates and fractional indices', () => {
  for (const bad of [NaN, Infinity, -Infinity, 0.5]) {
    assert.throws(() => baked.texelCenter(0, bad, 0), /texel/);
    assert.throws(() => baked.texelCenter(0, 0, bad), /texel/);
    if (!Number.isFinite(bad)) assert.throws(() => baked.sampleAtLevel(0, bad, 0), /finite/);
  }
});
