import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRoadCrossSection, classifyRoadCrossSection } from '../dist/course/road-cross-section.js';
import { JunctionCrossSectionProfile } from '../dist/course/junction-cross-section.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/groundmap/ground-map.js';
import { roadSurfaceBands } from '../dist/physics/road-surface-bands.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';

function scene(road) {
  const geometry = compileRoadCrossSection(road);
  const ground = { ...geometry, groundLeft: 12, groundRight: 12 };
  const surface = new SurfaceMap(100, [
    {
      sStart: 0,
      name: 'ROAD',
      bands: roadSurfaceBands(geometry, {
        left: 10,
        right: 10,
        leftType: 'DIRT',
        rightType: 'SAND',
      }),
    },
  ]);
  return { geometry, ground, surface };
}

test('one authored width change moves both visible and physical road boundaries', () => {
  const narrow = scene({ roadLeft: 2, roadRight: 2, shoulderWidth: 1 });
  const wide = scene({ roadLeft: 4, roadRight: 4, shoulderWidth: 1 });
  for (const l of [-2.5, 2.5]) {
    assert.equal(sampleGroundMap(10, l, narrow.ground), GROUND_COLORS.shoulder);
    assert.equal(narrow.surface.sample(10, l).type, 'SHOULDER');
    assert.notEqual(sampleGroundMap(10, l, wide.ground), GROUND_COLORS.shoulder);
    assert.equal(wide.surface.sample(10, l).type, 'ASPHALT');
  }
  for (const value of [narrow, wide]) {
    const junction = new JunctionCrossSectionProfile({
      sWidenStart: 20,
      sMedianStart: 40,
      sSeparatedStart: 60,
      parent: value.geometry,
      childRoadWidth: 7,
      finalMedianWidth: 8,
    });
    for (const l of [-8, -4.5, -2.5, 0, 2.5, 4.5, 8]) {
      const expected = classifyRoadCrossSection(value.geometry, l);
      assert.equal(junction.classify(10, l), expected === 'ROAD' ? 'ASPHALT_SINGLE' : expected);
    }
    for (const s of [NaN, Infinity, -Infinity]) assert.throws(() => junction.classify(s, 0), RangeError);
  }
});

test('asymmetric geometry preserves independent outside support and explicit shared-edge priorities', () => {
  const { geometry, ground, surface } = scene({ roadLeft: 3, roadRight: 4, shoulderWidth: 1 });
  assert.equal(classifyRoadCrossSection(geometry, -3), 'ROAD');
  assert.equal(surface.sample(10, -3).type, 'SHOULDER');
  assert.equal(classifyRoadCrossSection(geometry, 4), 'ROAD');
  assert.equal(surface.sample(10, 4).type, 'ASPHALT');
  assert.equal(surface.sample(10, -4).type, 'DIRT');
  assert.equal(surface.sample(10, 5).type, 'SHOULDER');
  assert.equal(surface.sample(10, 11).type, 'VOID');
  assert.notEqual(sampleGroundMap(10, 11, ground), undefined);
  assert.equal(classifyRoadCrossSection(geometry, 11), 'OUTSIDE');
});

test('compiled geometry freezes authored dimensions and rejects invalid domains before use', () => {
  const authored = { roadLeft: 3, roadRight: 4, shoulderWidth: 1 };
  const compiled = compileRoadCrossSection(authored);
  authored.roadLeft = 99;
  assert.equal(compiled.roadLeft, 3);
  assert.ok(Object.isFrozen(compiled));
  for (const key of ['roadLeft', 'roadRight', 'shoulderWidth']) {
    for (const value of [NaN, Infinity, -1]) {
      assert.throws(() => compileRoadCrossSection({ ...compiled, [key]: value }), RangeError);
    }
  }
  assert.throws(() => compileRoadCrossSection({ ...compiled, roadLeft: 0 }), RangeError);
  assert.throws(
    () => roadSurfaceBands(compiled, { left: 2, right: 8, leftType: 'DIRT', rightType: 'GRASS' }),
    RangeError,
  );
});
