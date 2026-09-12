import { createStadiumScene } from './helpers/stadium-scene.mjs';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { renderPose, terrainCamera } from './helpers/render-fixture.mjs';

import { CLIFF_BASE_COLORS } from '../dist/dev/fixtures/cliff-visual.js';

import { SoftwareSurface } from '../dist/graphics/software-surface.js';

import { renderDriving } from '../dist/render/renderer.js';
import { generateTerrainLines } from '../dist/road/terrain-line.js';
import { createFarBackground, drawFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

describe('hill and cliff scenery', () => {
  const { guide, height, cameraProfile, groundProfile, terrainProfile } = createStadiumScene();

  test('cliff GroundBase_L TRANSPARENT preserves Far Background below horizon while right GroundBase paints rock', () => {
    const vehicle = renderPose(guide, 520);
    const camera = terrainCamera(guide, height, vehicle, cameraProfile);
    const background = createFarBackground();
    const expectedBackground = new SoftwareSurface(320, 240);
    const actual = new SoftwareSurface(320, 240);
    drawFarBackground(expectedBackground, background, camera);
    vehicle.y = height.samplePhysics(vehicle.course.s);
    renderDriving(
      actual,
      {
        background,
        guide,
        camera,
        vehicle,
        terrainProfile,
        groundProfile,
        worldSprites: [],
        assets: createSpriteAssets(),
        playerKind: 'car',
      },
      {},
    );

    const lines = generateTerrainLines(guide, camera, terrainProfile);
    const line = lines.find((candidate) => candidate.y === 100 && candidate.sectionName === 'CLIFF / SEA');
    assert.ok(line);
    assert.ok(line.xGroundL > 80);
    assert.ok(line.xGroundR < 240);

    assert.equal(actual.getPixel(80, 100), expectedBackground.getPixel(80, 100));
    assert.equal(actual.getPixel(240, 100), CLIFF_BASE_COLORS.rock);
    assert.notEqual(actual.getPixel(240, 100), expectedBackground.getPixel(240, 100));
  });

  test('Far Background is a full image with meaningful pixels below its horizon', () => {
    const background = createFarBackground();
    const above = background.surface.getPixel(100, background.sourceHorizonY - 40);
    const below = background.surface.getPixel(100, background.sourceHorizonY + 40);
    assert.notEqual(above, below);
  });
});
