import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCourseSpriteObservation,
  reframeCourseSpriteObservation,
  collectVisibleCourseSprites,
} from '../../dist/render/course-sprite.js';
import {
  compilePlanarTransform,
  invertPlanarTransform,
  transformPlanarPoint,
} from '../../dist/core/planar-transform.js';
import { createSpriteAsset, drawScaledSprite } from '../../dist/graphics/sprite.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
const camera = () => ({ x: 1, y: 2, z: 3, yaw: 0.3, pitch: 0.1, s: 100, focalLength: 200, centerX: 160, centerY: 120 });
const asset = createSpriteAsset(
  'source',
  2,
  2,
  new Uint32Array([0xff0000ff, 0xff00ff00, 0xffff0000, 0xffffffff]),
  0.5,
  1,
  0.05,
);
const sprites = () => [
  { name: 'near', x: 2, y: 3, z: 4, sRender: 110, asset },
  { name: 'far', x: 3, y: 4, z: 8, sRender: 120, asset },
];

test('basis-only observation changes transform world positions while preserving depth, exact screen projection and borrowed images', () => {
  const inputs = sprites(),
    originalCamera = camera();
  const original = createCourseSpriteObservation(inputs, originalCamera, 2.5, 200);
  assert.deepEqual(original.sprites, collectVisibleCourseSprites(inputs, originalCamera, 2.5, 200));
  const transform = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 400, z: -200, heading: 1.234 });
  const changed = reframeCourseSpriteObservation(original, transform, 100, 50);
  assert.deepEqual({ x: changed.camera.x, z: changed.camera.z }, transformPlanarPoint(transform, original.camera));
  assert.equal(changed.camera.s, 50);
  for (let i = 0; i < original.sprites.length; i += 1) {
    const a = original.sprites[i],
      b = changed.sprites[i];
    assert.equal(b.projection, a.projection);
    assert.equal(b.d, a.d);
    assert.equal(b.asset, a.asset);
    assert.equal(b.sRender, a.sRender - 50);
    assert.deepEqual({ x: b.x, z: b.z }, transformPlanarPoint(transform, a));
    assert.ok(Object.isFrozen(b));
    assert.ok(Object.isFrozen(b.projection));
  }
  assert.equal(collectVisibleCourseSprites(changed, changed.camera, 2.5, 200), changed.sprites);
  const returned = reframeCourseSpriteObservation(changed, invertPlanarTransform(transform), 50, 100);
  for (let i = 0; i < original.sprites.length; i += 1)
    assert.equal(returned.sprites[i].projection, original.sprites[i].projection);
  const pixels = [new SoftwareSurface(320, 240), new SoftwareSurface(320, 240)];
  [original, changed].forEach((o, i) =>
    o.sprites.forEach((s) => drawScaledSprite(pixels[i], s.asset, s.projection.x, s.projection.y, s.projection.scale)),
  );
  assert.deepEqual(pixels[0].pixels, pixels[1].pixels);
  inputs[0].x = 500;
  originalCamera.yaw = 2;
  assert.equal(original.camera.yaw, 0.3);
  assert.equal(original.sprites[1].x, 2);
});

test('stale camera/depth, wrong API types and unrepresentable frame changes are rejected without a reprojection fallback', () => {
  const observed = createCourseSpriteObservation(sprites(), camera(), 2.5, 200);
  assert.throws(() => observed.visible({ ...observed.camera, x: 2 }, 2.5, 200), RangeError);
  assert.throws(() => observed.visible(observed.camera, 2.5, 201), RangeError);
  assert.throws(() => observed.visible(observed.camera, '2.5', 200), TypeError);
  assert.throws(() => createCourseSpriteObservation(null, camera(), 2.5, 200), TypeError);
  assert.throws(() => createCourseSpriteObservation(sprites(), { ...camera(), yaw: Infinity }, 2.5, 200), RangeError);
  assert.throws(() => createCourseSpriteObservation(sprites(), camera(), 0, 200), RangeError);
  const identity = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 });
  assert.throws(() => reframeCourseSpriteObservation(observed, identity, 100, Number.MAX_VALUE), RangeError);
  assert.equal(observed.visible(observed.camera, 2.5, 200), observed.sprites);
});
