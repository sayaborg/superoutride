import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { pseudoDepth } from '../dist/core/projection.js';
import { createM4CameraRig, updateM4Camera } from '../dist/dev/m4-camera.js';
import { createM2Vehicle, updateM2Vehicle } from '../dist/dev/m2-vehicle.js';
import { mergeTerrainAndSprites } from '../dist/render/painter-merge.js';
import { createSpriteAsset, countOpaqueSpriteColors, drawScaledSprite } from '../dist/render/sprite.js';
import { renderM4SuperScaler } from '../dist/render/m4-renderer.js';
import { SoftwareSurface, rgba } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile } from '../dist/visual/m3-debug-visual.js';
import {
  createM4SpriteAssets,
  selectBankVariant,
  selectVehicleSprite,
  selectYawVariant,
} from '../dist/visual/m4-sprite-assets.js';
import { compileCourseSprite, collectVisibleCourseSprites } from '../dist/world/course-sprite.js';
import { createM4DebugWorldSprites } from '../dist/world/m4-debug-world.js';

const deg = (value) => value * Math.PI / 180;
const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
const assets = createM4SpriteAssets();
const background = createM3FarBackground();
const cameraProfile = {
  dCam: 20,
  lCamMax: 12,
  height: 2,
  pitch: deg(8),
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: deg(20),
  sDotMin: 8,
  tauLat: 0.18,
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

test('programmer-art sprite assets obey <=15 opaque colors plus transparent', () => {
  const all = [assets.tree, assets.sign, assets.guardrail, assets.building];
  for (const yawRow of assets.car.assets) all.push(...yawRow);
  for (const yawRow of assets.bike.assets) all.push(...yawRow);
  for (const asset of all) {
    assert.ok(countOpaqueSpriteColors(asset) <= 15, `${asset.name} exceeds 15 opaque colors`);
    assert.ok([...asset.pixels].some((pixel) => pixel === 0), `${asset.name} has no transparent texel`);
  }
});


test('vehicle yaw/bank variants keep a consistent bitmap anchor semantic', () => {
  for (const set of [assets.car, assets.bike]) {
    const first = set.assets[0][0];
    for (const row of set.assets) {
      for (const asset of row) {
        assert.equal(asset.width, first.width);
        assert.equal(asset.height, first.height);
        near(asset.anchorX, first.anchorX);
        near(asset.anchorY, first.anchorY);
      }
    }
  }
});

test('scaled sprite blitter uses texel-center anchor and preserves transparent pixels', () => {
  const bg = rgba(1, 2, 3);
  const fg = rgba(240, 20, 30);
  const pixels = new Uint32Array(9);
  pixels[2 * 3 + 1] = fg; // anchor texel only
  const asset = createSpriteAsset('ANCHOR_PROBE', 3, 3, pixels, 1, 2);
  const surface = new SoftwareSurface(10, 10);
  surface.clear(bg);
  const stats = drawScaledSprite(surface, asset, 4.5, 5.5, 1);
  assert.equal(surface.getPixel(4, 5), fg);
  assert.equal(surface.getPixel(3, 5), bg);
  assert.equal(surface.getPixel(4, 4), bg);
  assert.equal(stats.writtenPixels, 1);
});

test('Painter merge is far-to-near and terrain wins the equal-depth tie before sprite', () => {
  const terrain = [{ d: 10, id: 'T10' }, { d: 5, id: 'T5' }];
  const sprites = [{ d: 10, id: 'S10' }, { d: 7, id: 'S7' }];
  const order = [];
  mergeTerrainAndSprites(
    terrain,
    sprites,
    (item) => order.push(item.id),
    (item) => order.push(item.id),
  );
  assert.deepEqual(order, ['T10', 'S10', 'S7', 'T5']);
});

test('course-attached sprite compiler snaps ground anchor to Y_render and keeps s_render', () => {
  const source = { name: 'PROBE', s: 125, l: 7, groundOffset: 1.25, asset: assets.sign };
  const compiled = compileCourseSprite(guide, height, source);
  near(compiled.sRender, 125);
  near(compiled.y, height.sampleRender(125).y + 1.25);
});

test('visible world sprites use shared chainage pseudo-depth and sort far-to-near', () => {
  const vehicle = createM2Vehicle(guide, 420);
  const rig = createM4CameraRig();
  const camera = updateM4Camera(rig, guide, height, vehicle, cameraProfile, 1 / 60);
  const world = createM4DebugWorldSprites(guide, height, assets);
  const visible = collectVisibleCourseSprites(world, camera, 2.5, 150);
  assert.ok(visible.length > 0);
  for (let i = 1; i < visible.length; i += 1) assert.ok(visible[i].d <= visible[i - 1].d + 1e-9);
  for (const sprite of visible) near(sprite.d, pseudoDepth(sprite.sRender, camera.s, guide.length));
});

test('yaw and bank selectors cover wrapped yaw and discrete bike bank variants', () => {
  assert.equal(selectYawVariant(0, 24), 0);
  assert.equal(selectYawVariant(Math.PI, 24), 12);
  assert.equal(selectYawVariant(-Math.PI, 24), 12);
  assert.equal(selectBankVariant(-1, 5), 0);
  assert.equal(selectBankVariant(0, 5), 2);
  assert.equal(selectBankVariant(1, 5), 4);
  assert.equal(selectVehicleSprite(assets.bike, 0, 1).bankIndex, 4);
  assert.equal(selectVehicleSprite(assets.car, deg(20), 1).bankIndex, 0);
});

test('M4 camera creates bounded vehicle-relative yaw lag while preserving exact longitudinal D_cam', () => {
  const vehicle = createM2Vehicle(guide, 70);
  const rig = createM4CameraRig();
  let camera = updateM4Camera(rig, guide, height, vehicle, cameraProfile, 1 / 60);
  for (let i = 0; i < 40; i += 1) {
    updateM2Vehicle(guide, vehicle, { steering: 1, throttle: true, brake: false }, 1 / 60);
    camera = updateM4Camera(rig, guide, height, vehicle, cameraProfile, 1 / 60);
  }
  const relative = Math.abs(camera.cameraVehicleYawDelta);
  assert.ok(relative > deg(1));
  assert.ok(relative <= cameraProfile.thetaLagMax + 1e-9);
  near(pseudoDepth(vehicle.course.s, camera.s, guide.length), cameraProfile.dCam, 1e-9);
});

test('M4 renderer draws merged world sprites and a yaw-variant player into the software framebuffer', () => {
  const vehicle = createM2Vehicle(guide, 420);
  const rig = createM4CameraRig();
  let camera = updateM4Camera(rig, guide, height, vehicle, cameraProfile, 1 / 60);
  for (let i = 0; i < 40; i += 1) {
    updateM2Vehicle(guide, vehicle, { steering: 1, throttle: true, brake: false }, 1 / 60);
    camera = updateM4Camera(rig, guide, height, vehicle, cameraProfile, 1 / 60);
  }
  const world = createM4DebugWorldSprites(guide, height, assets);
  const surface = new SoftwareSurface(320, 240);
  const stats = renderM4SuperScaler(
    surface,
    background,
    guide,
    camera,
    vehicle,
    terrainProfile,
    groundProfile,
    world,
    assets,
    'car',
  );
  assert.ok(stats.visibleSpriteCount > 0);
  assert.ok(stats.spriteWrittenPixels > 0);
  assert.ok(stats.playerWrittenPixels > 0);
  assert.ok(stats.playerYawVariant !== 0, 'camera yaw lag should select a non-center car variant in this probe');
});

test('bike player path selects yaw x bank variant without runtime bitmap rotation', () => {
  const selectedLeft = selectVehicleSprite(assets.bike, deg(-18), -1);
  const selectedCenter = selectVehicleSprite(assets.bike, 0, 0);
  const selectedRight = selectVehicleSprite(assets.bike, deg(18), 1);
  assert.notEqual(selectedLeft.asset.name, selectedCenter.asset.name);
  assert.notEqual(selectedCenter.asset.name, selectedRight.asset.name);
  assert.equal(assets.bike.assets.length, 24);
  assert.ok(assets.bike.assets.every((row) => row.length === 5));
});
