import assert from 'node:assert/strict';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../../dist/dev/courses/road-markings.js';

import { createStadiumEnvironment } from '../../dist/dev/fixtures/stadium-environment.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';
import { createSpriteAsset } from '../../dist/graphics/sprite.js';
import { GROUND_COLORS, sampleGroundMap } from '../../dist/groundmap/ground-map.js';
import { validateSurfaceGuideEnvelope } from '../../dist/physics/surface-guide-envelope.js';
import { SurfaceMap } from '../../dist/physics/surface-map.js';

const guide = createStadiumGuide();
const compiled = createStadiumEnvironment(guide.length);

test('fixture attributes retain independent authored change points', () => {
  assert.deepEqual(
    compiled.groundMap.sections.map((section) => section.sStart),
    [0, 455, 625],
  );
  assert.deepEqual(
    compiled.visualSections.map((section) => section.sStart),
    [0, 455, 625],
  );
  assert.deepEqual(
    compiled.surfaceSections.map((section) => section.sStart),
    [0, 280, 360, 455, 625],
  );
});

test('compiled SurfaceMap preserves sand, cliff verge and implicit VOID semantics', () => {
  const map = new SurfaceMap(guide.length, compiled.surfaceSections);
  assert.equal(map.sample(300, 7).type, 'SAND');
  assert.equal(map.sample(500, -6).type, 'DIRT');
  assert.equal(map.sample(500, -8).type, 'VOID');
  assert.equal(map.sample(500, 7).type, 'GRASS');
});

test('compiled GroundMap logical material is independent from GroundBase transparency', () => {
  const profile = {
    groundLeft: 12,
    groundRight: 12,
    road: { roadLeft: 4.5, roadRight: 4.5, shoulderWidth: 1 },

    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,

    logical: compiled.groundMap,
  };
  const left = sampleGroundMap(500, -9, profile);
  const right = sampleGroundMap(500, 9, profile);
  assert.ok(left === GROUND_COLORS.rockA || left === GROUND_COLORS.rockB);
  assert.ok(right === GROUND_COLORS.grassA || right === GROUND_COLORS.grassB);
  assert.equal(compiled.visualSections[1].groundBaseLeft.kind, 'transparent');
});

test('physical profile rejects overlapping bands', () => {
  const bad = [
    {
      ...compiled.surfaceSections[0],
      bands: [
        { lMin: -5, lMax: 1, type: 'ASPHALT' },
        { lMin: 0, lMax: 5, type: 'GRASS' },
      ],
    },
  ];
  assert.throws(() => new SurfaceMap(guide.length, bad), /must not overlap/);
});

test('compiled support stays strictly inside the Guide chart', () => {
  const map = new SurfaceMap(guide.length, compiled.surfaceSections);
  assert.equal(map.maxSupportedAbsL, 10.5);
  validateSurfaceGuideEnvelope(guide, map);
  assert.throws(() => validateSurfaceGuideEnvelope({ ...guide, lMax: 10.5 }, map), /must remain inside Guide chart/);
});

test('sprite assets require positive physical width and have only physical scale authority', () => {
  const pixels = new Uint32Array(80 * 56);
  const asset = createSpriteAsset('CAR_REAR', 80, 56, pixels, undefined, undefined, 2);
  assert.equal(asset.worldWidthMeters, 2);
  assert.equal('visualScale' in asset, false);
  assert.ok(Object.isFrozen(asset));
  for (const width of [undefined, 0, -1, NaN, Infinity]) {
    assert.throws(() => createSpriteAsset('BAD', 80, 56, pixels, undefined, undefined, width), /worldWidthMeters/);
  }
  assert.throws(() => {
    asset.visualScale = 0.5;
  }, TypeError);
});
