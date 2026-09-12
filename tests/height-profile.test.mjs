import { createStadiumScene } from './helpers/stadium-scene.mjs';
import { near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

describe('hill and cliff scenery', () => {
  const { height } = createStadiumScene();

  test('Y_render is piecewise linear while Y_camera is continuous through a hill node', () => {
    near(height.sampleRender(60).y, 0, 1e-7);
    near(height.sampleRender(125).y, 8, 1e-7);
    near(height.sampleRender(180).y, 8, 1e-7);
    near(height.sampleRender(250).y, 0, 1e-7);

    const eps = 1e-3;
    const node = 125;
    const left = (height.sampleCamera(node) - height.sampleCamera(node - eps)) / eps;
    const right = (height.sampleCamera(node + eps) - height.sampleCamera(node)) / eps;
    assert.ok(Math.abs(left) < 1e-3);
    assert.ok(Math.abs(right) < 1e-3);
  });
});
