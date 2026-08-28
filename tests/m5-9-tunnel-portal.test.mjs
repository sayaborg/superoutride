import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  M5_8_DEBUG_TARGET_BUDGET,
  M5_9_COMBINED_OBSERVED_BASELINE,
  M5_9_TARGET_BUDGET,
  M5_9_TUNNEL_STRESS_BASELINE,
  summarizeRenderWorkloads,
  validateRenderWorkload,
} from '../dist/compiler/render-budget.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM5Car } from '../dist/physics/car-physics.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { countOpaqueSpriteColors, SPRITE_TRANSPARENT } from '../dist/render/sprite.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { BakedGroundMapAsset } from '../dist/visual/baked-ground-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import {
  createM5TunnelPresentation,
  M5_9_TUNNEL_ENTRY_S,
  M5_9_TUNNEL_EXIT_S,
  selectM5FarBackground,
  tunnelPortalApertureIsTransparent,
} from '../dist/visual/m5-9-tunnel.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { createM4DebugWorldSprites } from '../dist/dev/m4-debug-world.js';
import { createM5TunnelWorldSprites } from '../dist/world/m5-9-tunnel-world.js';

const deg = (value) => value * Math.PI / 180;
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
const visual = new CyclicVisualProfile(guide.length, compiled.visualSections);
const surfaces = new CyclicSurfaceMap(guide.length, compiled.surfaceSections);
const outdoor = createM3FarBackground();
const tunnel = createM5TunnelPresentation(guide.length, 5);
const assets = createM4SpriteAssets();
const tunnelWorld = createM5TunnelWorldSprites(guide, height, tunnel);
const world = [...createM4DebugWorldSprites(guide, height, assets), ...tunnelWorld];
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

function placeCar(car, s, yawOffset = 0) {
  const p = guideCourseToWorld(guide, s, 0);
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
  const car = createM5Car(guide, height, surfaces, s);
  placeCar(car, s, yawOffset);
  const camera = updateM5Camera(createM5CameraRig(), guide, height, car, cameraProfile, 1 / 60);
  const selected = selectM5FarBackground(camera.s, guide.length, outdoor, tunnel);
  const stats = renderM5Driving(
    new SoftwareSurface(320, 240),
    selected.background,
    guide,
    camera,
    car,
    terrainProfile,
    groundProfile,
    world,
    assets,
    'car',
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
  assert.equal(tunnelPortalApertureIsTransparent(tunnel.portalAsset), true);
  assert.ok(countOpaqueSpriteColors(tunnel.portalAsset) <= 15);
  assert.ok(countOpaqueSpriteColors(tunnel.ribAsset) <= 15);
  const center = Math.floor(tunnel.portalAsset.width / 2);
  assert.equal(tunnel.portalAsset.pixels[(tunnel.portalAsset.height - 2) * tunnel.portalAsset.width + center], SPRITE_TRANSPARENT);
});

test('M5.9 Far Background transition is aligned to player portal crossing by D_cam', () => {
  assert.equal(tunnel.cameraTransitionStartS, M5_9_TUNNEL_ENTRY_S - 5);
  assert.equal(tunnel.cameraTransitionEndS, M5_9_TUNNEL_EXIT_S - 5);
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionStartS - 1e-4, guide.length, outdoor, tunnel).kind, 'OUTDOOR');
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionStartS, guide.length, outdoor, tunnel).kind, 'TUNNEL');
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionEndS - 1e-4, guide.length, outdoor, tunnel).kind, 'TUNNEL');
  assert.equal(selectM5FarBackground(tunnel.cameraTransitionEndS, guide.length, outdoor, tunnel).kind, 'OUTDOOR');
});

test('M5.9 tunnel world keeps only two portals and two near ribs in the existing world-sprite path', () => {
  assert.deepEqual(tunnelWorld.map((sprite) => sprite.sRender), [130, 142, 168, 180]);
  assert.equal(tunnelWorld.filter((sprite) => sprite.asset === tunnel.portalAsset).length, 2);
  assert.equal(tunnelWorld.filter((sprite) => sprite.asset === tunnel.ribAsset).length, 2);
});

test('portal is screen-filling at the metric player crossing without a special projection scale', () => {
  const pixelsPerMeter = 200 / 5;
  const projectedWidth = tunnel.portalAsset.worldWidthMeters * pixelsPerMeter;
  const projectedHeight = tunnel.portalAsset.height / tunnel.portalAsset.width * projectedWidth;
  assert.ok(projectedWidth > 320);
  assert.ok(projectedHeight > 240);
  assert.equal(projectedWidth, 480);
  assert.equal(projectedHeight, 360);
});

test('M5.9 close portal/interior sweep is a real sprite-budget stress case and matches the recorded baseline', () => {
  const observed = tunnelStressSweep();
  const oldViolations = validateRenderWorkload(observed, M5_8_DEBUG_TARGET_BUDGET);
  assert.deepEqual(observed, M5_9_TUNNEL_STRESS_BASELINE);
  assert.ok(oldViolations.some((entry) => entry.metric === 'spriteOutputSamplesPerFrameMax'));
  assert.ok(oldViolations.some((entry) => entry.metric === 'spriteOutputSamplesPerScanlineMax'));
  assert.deepEqual(validateRenderWorkload(observed, M5_9_TARGET_BUDGET), []);
  console.log('M5.9 TUNNEL STRESS WORKLOAD', JSON.stringify(observed));
  console.log('M5.9 VIOLATIONS OF M5.8 PROVISIONAL BUDGET', JSON.stringify(oldViolations));
});

test('M5.9 combined target retains stronger normal terrain maxima and rebases the tunnel sprite limits with 25% headroom', () => {
  assert.equal(M5_9_COMBINED_OBSERVED_BASELINE.frameCount, 121);
  assert.equal(M5_9_COMBINED_OBSERVED_BASELINE.maxTerrainLineCount, 171);
  assert.equal(M5_9_COMBINED_OBSERVED_BASELINE.maxTerrainOutputPixelsPerFrame, 54720);
  assert.equal(M5_9_COMBINED_OBSERVED_BASELINE.maxVisibleSpriteCount, 17);
  assert.equal(M5_9_COMBINED_OBSERVED_BASELINE.maxSpriteOutputSamplesPerFrame, 83655);
  assert.equal(M5_9_COMBINED_OBSERVED_BASELINE.maxSpriteOutputSamplesPerScanline, 605);
  assert.equal(M5_9_TARGET_BUDGET.terrainLineCountMax, 214);
  assert.equal(M5_9_TARGET_BUDGET.terrainOutputPixelsPerFrameMax, 68400);
  assert.equal(M5_9_TARGET_BUDGET.spriteOutputSamplesPerFrameMax, 104569);
  assert.equal(M5_9_TARGET_BUDGET.spriteOutputSamplesPerScanlineMax, 757);
  assert.deepEqual(validateRenderWorkload(M5_9_COMBINED_OBSERVED_BASELINE, M5_9_TARGET_BUDGET), []);
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
