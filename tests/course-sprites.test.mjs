import { createStadiumScene } from './helpers/stadium-scene.mjs';
import { near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { renderPose, terrainCamera } from './helpers/render-fixture.mjs';
import { pseudoDepth } from '../dist/core/projection.js';
import { createRoadsideSprites } from '../dist/dev/courses/roadside-scenery.js';

import { collectVisibleCourseSprites, compileCourseSprite } from '../dist/render/course-sprite.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

describe('sprite presentation', () => {
  const { guide, height, cameraProfile } = createStadiumScene();

  const assets = createSpriteAssets();

  test('course-attached sprite compiler snaps ground anchor to Y_render and keeps s_render', () => {
    const source = { name: 'PROBE', s: 125, l: 7, groundOffset: 1.25, asset: assets.sign };
    const compiled = compileCourseSprite(guide, height, source);
    near(compiled.sRender, 125, 1e-7);
    near(compiled.y, height.sampleRender(125).y + 1.25, 1e-7);
  });

  test('visible world sprites use shared chainage pseudo-depth and sort far-to-near', () => {
    const vehicle = renderPose(guide, 420);
    const camera = terrainCamera(guide, height, vehicle, cameraProfile);
    const world = createRoadsideSprites(guide, height, assets);
    const visible = collectVisibleCourseSprites(world, camera, 2.5, 150);
    assert.ok(visible.length > 0);
    for (let i = 1; i < visible.length; i += 1) assert.ok(visible[i].d <= visible[i - 1].d + 1e-9);
    for (const sprite of visible) near(sprite.d, pseudoDepth(sprite.sRender, camera.s), 1e-7);
  });
});
