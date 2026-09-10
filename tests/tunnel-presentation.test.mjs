import { CENTER_DASH_MARKINGS } from '../dist/dev/m5-surface-authoring.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { summarizeRenderWorkloads } from '../dist/render/render-workload.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guidePathToWorld } from '../dist/core/guide-curve.js';
import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { CURRENT_RENDER_FAR_DEPTH_METERS, CURRENT_RENDER_NEAR_DEPTH_METERS } from '../dist/core/presentation-scale.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { renderDriving } from '../dist/render/renderer.js';
import { countOpaqueSpriteColors, SPRITE_TRANSPARENT } from '../dist/render/sprite.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { BakedGroundMapAsset } from '../dist/visual/baked-ground-map.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import {
  createTunnelPresentation,
  createTunnelWorldSprites,
  TUNNEL_ENTRY_S,
  TUNNEL_EXIT_S,
  selectTunnelBackground,
} from '../dist/dev/tunnel.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';
import { createM4DebugWorldSprites } from '../dist/dev/m4-debug-world.js';

const deg = (value) => (value * Math.PI) / 180;
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
const visual = new VisualProfile(guide.length, compiled.visualSections);
const surfaces = new SurfaceMap(guide.length, compiled.surfaceSections);
const outdoor = createFarBackground();
const tunnel = createTunnelPresentation(guide.length, 5);
const assets = createSpriteAssets();
const tunnelWorld = createTunnelWorldSprites(guide, height, tunnel);
const world = [...createM4DebugWorldSprites(guide, height, assets), ...tunnelWorld];
const metadata = JSON.parse(await readFile(new URL('../dist/assets/m5-ground-map.json', import.meta.url), 'utf8'));
const binary = await readFile(new URL('../dist/assets/m5-ground-map.bin', import.meta.url));
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

function placeCar(car, s, yawOffset = 0) {
  const p = guidePathToWorld(guide, s, 0);
  const surface = surfaces.sample(s, 0);
  car.x = p.x;
  car.z = p.z;
  car.y = height.samplePhysics(s) + 0.55;
  car.yaw = p.heading + yawOffset;
  car.velocityX = Math.sin(car.yaw) * 45;
  car.velocityY = 0;
  car.velocityZ = Math.cos(car.yaw) * 45;
  car.yawRate = 0;
  car.frontSteerAngle = 0;
  car.course = { s: p.s, l: 0, segmentIndex: p.segmentIndex, distanceSquared: 0 };
  car.surfaceType = surface.type;
  car.frontNormalLoad = surface.material.supported ? 1 : 0;
  car.rearNormalLoad = surface.material.supported ? 1 : 0;
}

function renderProbe(s, yawOffset = 0) {
  const car = createTestCar(guide, height, surfaces, s);
  placeCar(car, s, yawOffset);
  const camera = updateCamera(createCameraRig(), { guide, height }, car, cameraProfile, 1 / 60);
  const selected = selectTunnelBackground(camera.s, guide.length, outdoor, tunnel);
  const stats = renderDriving(
    new SoftwareSurface(320, 240),
    {
      background: selected.background,
      guide,
      camera,
      vehicle: car,
      terrainProfile,
      groundProfile,
      worldSprites: world,
      assets,
      playerKind: 'car',
    },
    { observeWorkload: true },
  );
  return { stats, backgroundKind: selected.kind, camera };
}

function tunnelStressSweep() {
  const samples = [];
  const positions = [108, 116, 122, 125, 128, 130, 134, 138, 142, 148, 156, 164, 168, 172, 176, 180, 184];
  for (const s of positions) {
    for (const yaw of [deg(-20), 0, deg(20)]) samples.push(renderProbe(s, yaw).stats);
  }
  return summarizeRenderWorkloads(samples);
}

test('M5.9 portal uses 0/1 transparent aperture and sprite palette remains Core-sized', () => {
  assert.equal(tunnel.portalAsset.worldWidthMeters, 12);
  const portal = tunnel.portalAsset;
  const apertureX = Math.floor(portal.width * 0.5);
  assert.notEqual(portal.pixels[Math.floor(portal.height * 0.15) * portal.width + apertureX], SPRITE_TRANSPARENT);
  assert.equal(portal.pixels[Math.floor(portal.height * 0.75) * portal.width + apertureX], SPRITE_TRANSPARENT);
  assert.ok(countOpaqueSpriteColors(tunnel.portalAsset) <= 15);
  assert.ok(countOpaqueSpriteColors(tunnel.ribAsset) <= 15);
  const center = Math.floor(tunnel.portalAsset.width / 2);
  assert.equal(
    tunnel.portalAsset.pixels[(tunnel.portalAsset.height - 2) * tunnel.portalAsset.width + center],
    SPRITE_TRANSPARENT,
  );
});

test('M5.9 Far Background transition is aligned to player portal crossing by D_cam', () => {
  assert.equal(tunnel.cameraTransitionStartS, TUNNEL_ENTRY_S - 5);
  assert.equal(tunnel.cameraTransitionEndS, TUNNEL_EXIT_S - 5);
  assert.equal(
    selectTunnelBackground(tunnel.cameraTransitionStartS - 1e-4, guide.length, outdoor, tunnel).kind,
    'OUTDOOR',
  );
  assert.equal(selectTunnelBackground(tunnel.cameraTransitionStartS, guide.length, outdoor, tunnel).kind, 'TUNNEL');
  assert.equal(
    selectTunnelBackground(tunnel.cameraTransitionEndS - 1e-4, guide.length, outdoor, tunnel).kind,
    'TUNNEL',
  );
  assert.equal(selectTunnelBackground(tunnel.cameraTransitionEndS, guide.length, outdoor, tunnel).kind, 'OUTDOOR');
});

test('M5.9 tunnel world keeps only two portals and two near ribs in the existing world-sprite path', () => {
  assert.deepEqual(
    tunnelWorld.map((sprite) => sprite.sRender),
    [130, 142, 168, 180],
  );
  assert.equal(tunnelWorld.filter((sprite) => sprite.asset === tunnel.portalAsset).length, 2);
  assert.equal(tunnelWorld.filter((sprite) => sprite.asset === tunnel.ribAsset).length, 2);
});

test('portal is screen-filling at the metric player crossing without a special projection scale', () => {
  const pixelsPerMeter = 200 / 5;
  const projectedWidth = tunnel.portalAsset.worldWidthMeters * pixelsPerMeter;
  const projectedHeight = (tunnel.portalAsset.height / tunnel.portalAsset.width) * projectedWidth;
  assert.ok(projectedWidth > 320);
  assert.ok(projectedHeight > 240);
  assert.equal(projectedWidth, 480);
  assert.equal(projectedHeight, 360);
});

test('close portal/interior sweep counts clipped blitter work and writes', () => {
  const observed = tunnelStressSweep();
  assert.equal(observed.frameCount, 51);
  assert.ok(observed.maxTerrainOutputPixelsPerFrame <= observed.maxTerrainLineCount * 320);
  assert.ok(observed.maxSpriteOutputSamplesPerFrame > 320 * 240, 'overlapping portal sprites exercise overdraw');
  assert.ok(observed.maxSpriteWrittenPixelsPerFrame <= observed.maxSpriteOutputSamplesPerFrame);
  assert.ok(observed.maxSpriteWrittenPixelsPerScanline <= observed.maxSpriteOutputSamplesPerScanline);
});

test('background actually changes through the tunnel while renderer still uses the same M5 Painter function', () => {
  const before = renderProbe(120);
  const inside = renderProbe(150);
  const after = renderProbe(185);
  assert.equal(before.backgroundKind, 'OUTDOOR');
  assert.equal(inside.backgroundKind, 'TUNNEL');
  assert.equal(after.backgroundKind, 'OUTDOOR');
  assert.ok(inside.stats.visibleSpriteCount > 0);
  assert.equal(inside.stats.groundMapBaked, true);
});
