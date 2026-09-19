import assert from 'node:assert/strict';
import test from 'node:test';
import { createStraightReferenceWorld } from '../../dist/dev/fixtures/straight-world.js';
import { createFarBackground } from '../../dist/visual/far-background.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { compileCourseSprite } from '../../dist/render/course-sprite.js';
import { createDynamicVehicleCourseSprite } from '../../dist/render/dynamic-vehicle-sprite.js';
import { renderDriving } from '../../dist/render/renderer.js';
import { renderPose, terrainCamera } from '../helpers/render-fixture.mjs';
import { createSpriteLodFixture } from '../../dist/dev/fixtures/sprite-lod.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { SoftwareSurface, rgba, unpackRgba } from '../../dist/graphics/software-surface.js';
import {
  createSpriteAsset,
  drawScaledSprite,
  readSpriteLodAsset,
  selectSpriteLevel,
} from '../../dist/graphics/sprite.js';

test('LOD storage rounds up each axis until both reach one; metric extent is owned by the master', () => {
  const asset = readSpriteLodAsset(createSpriteLodFixture());
  assert.deepEqual(
    asset.levels.map(({ width, height }) => [width, height]),
    [
      [80, 56],
      [40, 28],
      [20, 14],
      [10, 7],
      [5, 4],
      [3, 2],
      [2, 1],
      [1, 1],
    ],
  );
  assert.equal(asset.worldWidthMeters, 2);
  assert.equal(asset.anchorX, 39.5);
  assert.equal(asset.anchorY, 55);
  const thin = readSpriteLodAsset(createSpriteLodFixture(1, 65));
  assert.deepEqual(
    thin.levels.map(({ width, height }) => [width, height]),
    [
      [1, 65],
      [1, 33],
      [1, 17],
      [1, 9],
      [1, 5],
      [1, 3],
      [1, 2],
      [1, 1],
    ],
  );
});

test('geometric-mean LOD boundaries choose coarser at equality and clamp finite endpoints', () => {
  const asset = readSpriteLodAsset(createSpriteLodFixture());
  for (let k = 0; k < asset.levels.length - 1; k++) {
    const boundary = (40 * Math.SQRT1_2) / 2 ** k;
    assert.equal(selectSpriteLevel(asset, boundary * (1 + 1e-12)), k);
    assert.equal(selectSpriteLevel(asset, boundary), k + 1);
    assert.equal(selectSpriteLevel(asset, boundary * (1 - 1e-12)), k + 1);
  }
  for (const [ppm, level] of [
    [80, 0],
    [40, 0],
    [35, 0],
    [25, 1],
    [20, 1],
    [10, 2],
    [1e-10, 7],
  ])
    assert.equal(selectSpriteLevel(asset, ppm), level);
  for (const ppm of [0, -1, NaN, Infinity]) assert.throws(() => selectSpriteLevel(asset, ppm), /scale/);
  assert.equal(
    selectSpriteLevel(
      readSpriteLodAsset({ ...createSpriteLodFixture(), levels: createSpriteLodFixture().levels.slice(0, 2) }),
      1,
    ),
    1,
  );
});

test('odd storage edges never stretch the logical frame or move the shared anchor at transitions', () => {
  for (const [width, height] of [
    [80, 56],
    [81, 57],
    [1, 65],
    [65, 1],
    [1, 1],
  ]) {
    const source = createSpriteLodFixture(width, height);
    // Fractional and outside-canvas anchors are legitimate metric reference points.
    source.anchorX = width * 0.25 - 2.25;
    source.anchorY = height + 0.75;
    const asset = readSpriteLodAsset(source);
    const target = new SoftwareSurface(320, 240),
      reference = new SoftwareSurface(320, 240);
    for (const depth of [2.5, 5, 7.07106781185, 7.07106781188, 10, 20, 40, 56.56854249, 80, 160, 200]) {
      const ppm = 200 / depth;
      const k = selectSpriteLevel(asset, ppm),
        color = rgb555ToRgba(source.levels[k].paletteRgb555[0]);
      const solid = createSpriteAsset(
        'INDEPENDENT_LOGICAL_RECTANGLE',
        width,
        height,
        new Uint32Array(width * height).fill(color),
        source.anchorX,
        source.anchorY,
        width / 40,
      );
      for (const [x, y] of [
        [160, 200],
        [0.25, 50.75],
        [310.5, 239.5],
        [-200, -200],
      ]) {
        target.clear(0);
        reference.clear(0);
        const observed = { samples: 0, writes: 0 };
        const actual = drawScaledSprite(target, asset, x, y, ppm, (_, samples, writes) => {
          observed.samples += samples;
          observed.writes += writes;
        });
        const expected = drawScaledSprite(reference, solid, x, y, ppm);
        assert.deepEqual(target.pixels, reference.pixels, `${width}x${height}, depth ${depth}, level ${k}`);
        assert.deepEqual(actual, expected);
        assert.equal(observed.samples, actual.outputSamples);
        assert.equal(observed.writes, actual.writtenPixels);
      }
    }
  }
});

test('selected-level nearest sampling preserves transparent holes and opaque RGB555 black', () => {
  const source = createSpriteLodFixture(8, 8);
  source.levels[1] = { paletteRgb555: [0, 0x7fff], indices: [1, 0, 2, 0, 0, 2, 0, 1, 1, 0, 2, 0, 0, 2, 0, 1] };
  const asset = readSpriteLodAsset(source),
    bg = rgba(17, 25, 33),
    target = new SoftwareSurface(20, 20);
  target.clear(bg);
  const stats = drawScaledSprite(target, asset, 10, 10.25, 20);
  // Logical top-left boundary is (8,6.5); each L1 texel occupies one screen pixel.
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const index = source.levels[1].indices[y * 4 + x];
      assert.equal(
        target.getPixel(8 + x, 6 + y),
        index === 0 ? bg : rgb555ToRgba(source.levels[1].paletteRgb555[index - 1]),
      );
    }
  assert.equal(stats.outputSamples, 16);
  assert.equal(stats.writtenPixels, 8);
  for (const pixel of asset.levels[1].pixels) assert.ok([0, 255].includes(unpackRgba(pixel).a));
});

test('LOD reader rejects malformed metadata, palettes, indices and transform/scale authorities', () => {
  const cases = [
    (s) => {
      s.version = 2;
    },
    (s) => {
      s.format = 'other';
    },
    (s) => {
      s.name = '';
    },
    (s) => {
      s.width = 0;
    },
    (s) => {
      s.width = 1.5;
    },
    (s) => {
      s.height = Infinity;
    },
    (s) => {
      s.anchorY = NaN;
    },
    (s) => {
      delete s.anchorX;
    },
    (s) => {
      s.worldWidthMeters = 3;
    },
    (s) => {
      s.rotation = 0;
    },
    (s) => {
      s.levels = [];
    },
    (s) => {
      s.levels.push(s.levels.at(-1));
    },
    (s) => {
      s.levels[1].width = 40;
    },
    (s) => {
      s.levels[1].crop = [0, 0, 1, 1];
    },
    (s) => {
      s.levels[0].paletteRgb555 = Array.from({ length: 16 }, (_, i) => i);
    },
    (s) => {
      s.levels[0].paletteRgb555 = [1, 1];
    },
    (s) => {
      s.levels[0].paletteRgb555 = [32768];
    },
    (s) => {
      s.levels[0].paletteRgb555 = [-1];
    },
    (s) => {
      s.levels[0].indices[0] = 2;
    },
    (s) => {
      s.levels[0].indices[0] = 0.5;
    },
    (s) => {
      s.levels[0].indices.pop();
    },
  ];
  for (const modify of cases) {
    const source = createSpriteLodFixture();
    modify(source);
    assert.throws(() => readSpriteLodAsset(source), RangeError);
  }
  for (const value of [null, [], 'sprite']) assert.throws(() => readSpriteLodAsset(value), RangeError);
  for (const target of ['levels', 'paletteRgb555', 'indices']) {
    const sparse = createSpriteLodFixture();
    delete (target === 'levels' ? sparse.levels : sparse.levels[0][target])[0];
    assert.throws(() => readSpriteLodAsset(sparse), RangeError);
  }
  const transparent = createSpriteLodFixture(1, 1);
  transparent.levels = [{ paletteRgb555: [], indices: [0] }];
  assert.equal(readSpriteLodAsset(transparent).levels[0].pixels[0], 0);
});

test('compiled metadata and decoded pixels are detached from caller-owned source arrays', () => {
  const source = createSpriteLodFixture(),
    asset = readSpriteLodAsset(source);
  source.levels[0].indices.fill(0);
  source.anchorX = 999;
  assert.equal(asset.levels[0].pixels[0], rgb555ToRgba(0x03e0));
  assert.equal(asset.anchorX, 39.5);
  assert.ok(Object.isFrozen(asset));
  assert.ok(Object.isFrozen(asset.levels));
  assert.ok(Object.isFrozen(asset.levels[0]));
  const pixels = new Uint32Array([123]),
    single = createSpriteAsset('SINGLE', 1, 1, pixels, 0, 0, 1);
  pixels[0] = 0;
  assert.equal(single.levels[0].pixels[0], 123);
});

test('course sprites, dynamic rivals and player use the same LOD blitter inside the full Painter', () => {
  const runtime = createStraightReferenceWorld(),
    { guide, heightProfile: height } = runtime;
  const source = createSpriteLodFixture(81, 57),
    asset = readSpriteLodAsset(source);
  const set = { kind: 'car', yawVariants: 1, bankVariants: 1, assets: [[asset]] };
  const assets = { ...createSpriteAssets(), car: set },
    vehicle = renderPose(guide, 80);
  vehicle.y = height.samplePhysics(vehicle.course.s);
  const background = createFarBackground();
  for (const distance of [5, 10, 20, 40]) {
    const camera = terrainCamera(guide, height, vehicle, {
      dCam: distance,
      lCamMax: 12,
      height: 2,
      pitch: 0.1,
      focalLength: 200,
      centerX: 160,
      centerY: 120,
    });
    const rival = renderPose(guide, 100);
    rival.y = height.samplePhysics(rival.course.s);
    const sprites = [
      compileCourseSprite(guide, height, { name: 'STATIC', s: 110, l: -2, asset }),
      createDynamicVehicleCourseSprite('RIVAL', rival, camera.yaw, set, height),
    ];
    // Independently authored solid master images encode the expected selected color at each depth.
    const expectedAsset = (depth) => {
      const k = Math.min(source.levels.length - 1, Math.max(0, Math.floor(Math.log2(depth / 5) + 0.5)));
      return createSpriteAsset(
        'EXPECTED_COLOR',
        81,
        57,
        new Uint32Array(81 * 57).fill(rgb555ToRgba(source.levels[k].paletteRgb555[0])),
        asset.anchorX,
        asset.anchorY,
        asset.worldWidthMeters,
      );
    };
    const scene = {
      background,
      guide,
      camera,
      vehicle,
      terrainProfile: runtime.terrainProfile,
      groundProfile: runtime.groundProfile,
      worldSprites: sprites,
      assets,
      playerKind: 'car',
    };
    const options = {
      observeWorkload: true,
      ground: { kind: 'baked', kMax: 0, selectLevel: () => 0, sampleAtLevel: () => rgba(55, 55, 55) },
    };
    const target = new SoftwareSurface(320, 240),
      expected = new SoftwareSurface(320, 240);
    const actualStats = renderDriving(target, scene, options);
    const expectedStats = renderDriving(
      expected,
      {
        ...scene,
        worldSprites: sprites.map((sprite) => ({ ...sprite, asset: expectedAsset(sprite.sRender - camera.s) })),
        assets: { ...assets, car: { ...set, assets: [[expectedAsset(distance)]] } },
      },
      options,
    );
    assert.ok(actualStats.spriteWrittenPixels > 0);
    assert.ok(actualStats.playerWrittenPixels > 0);
    assert.equal(actualStats.visibleSpriteCount, 2);
    assert.deepEqual(target.pixels, expected.pixels, `Painter at player depth ${distance}`);
    assert.deepEqual(actualStats, expectedStats);
  }
});
