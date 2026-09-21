import { createTestBackground } from '../helpers/tile-background.mjs';
import { createTestSpriteAssets } from '../helpers/sprite-assets.mjs';
import { createStadiumScene } from '../helpers/stadium-scene.mjs';
import { deg } from '../helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { renderPose, terrainCamera } from '../helpers/render-fixture.mjs';

import { createRoadsideSprites } from '../../dist/dev/fixtures/projection-scenery.js';

import { SoftwareSurface } from '../../dist/graphics/software-surface.js';

import { renderSourceGround as renderDriving } from '../../dist/dev/diagnostics/source-ground-render.js';

describe('sprite presentation', () => {
  const { guide, height, cameraProfile, groundProfile, terrainProfile } = createStadiumScene();

  const assets = createTestSpriteAssets();

  const background = createTestBackground();

  test('current renderer draws merged world sprites and a yaw-variant player into the software framebuffer', () => {
    const vehicle = renderPose(guide, 420);
    const camera = terrainCamera(guide, height, vehicle, cameraProfile);
    vehicle.y = height.samplePhysics(vehicle.course.s);
    vehicle.yaw += deg(20);
    const world = createRoadsideSprites(guide, height, assets);
    const surface = new SoftwareSurface(320, 240);
    const stats = renderDriving(
      surface,
      {
        background,
        guide,
        camera,
        vehicle,
        terrainProfile,
        groundProfile,
        worldSprites: world,
        assets,
        playerKind: 'car',
      },
      {},
    );
    assert.ok(stats.visibleSpriteCount > 0);
    assert.ok(stats.spriteWrittenPixels > 0);
    assert.ok(stats.playerWrittenPixels > 0);
    assert.ok(stats.playerYawVariant !== 0, 'explicit relative yaw selects a non-center car variant');
  });
});
