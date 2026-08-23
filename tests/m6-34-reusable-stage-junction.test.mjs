import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createStageRoadView } from '../dist/course/stage-road-view.js';
import { compileStageJunction } from '../dist/runtime/stage-junction-compiler.js';
import { GROUND_COLORS } from '../dist/visual/ground-map.js';
import { sampleStageGroundMapRuntime } from '../dist/visual/stage-ground-map-view.js';

const CROSS_SECTION = Object.freeze({
  sWidenStart: 40,
  sMedianStart: 60,
  sSeparatedStart: 100,
  parentRoadWidth: 7,
  childRoadWidth: 6,
  finalMedianWidth: 4,
  shoulderWidth: 1,
});

function sourceRoadView(overrides = {}) {
  return createStageRoadView({
    id: 'SOURCE_STAGE_VIEW',
    sourceLateralOrigin: 7.5,
    groundLeft: 4.5,
    groundRight: 4.5,
    roadLeft: 3.5,
    roadRight: 3.5,
    shoulderWidth: 1,
    ...overrides,
  });
}

function setup() {
  return compileStageJunction({
    courseLength: 400,
    roadView: sourceRoadView(),
    groundProfile: {
      groundLeft: 4.5,
      groundRight: 4.5,
      roadLeft: 3.5,
      roadRight: 3.5,
      shoulderWidth: 1,
      roadCenterL: 7.5,
      chainageOffsetS: 100,
    },
  }, {
    roadViewId: 'SECOND_FORK_VIEW',
    surfaceSectionName: 'SECOND_FORK',
    crossSection: CROSS_SECTION,
    outerSurfaceType: 'GRASS',
  });
}

test('M6.34 compiler expands one stage corridor exactly enough for both child roads, median and shoulders', () => {
  const compiled = setup();
  assert.equal(compiled.requiredGroundHalfWidth, 9);
  assert.equal(compiled.roadView.groundLeft, 9);
  assert.equal(compiled.roadView.groundRight, 9);
  assert.equal(compiled.groundProfile.groundLeft, 9);
  assert.equal(compiled.groundProfile.groundRight, 9);
  assert.equal(compiled.roadView.sourceLateralOrigin, 7.5);
  assert.equal(compiled.roadView.roadLeft, 3.5);
  assert.equal(compiled.roadView.roadRight, 3.5);
});

test('M6.34 GroundMap junction is evaluated in stage-local l before source lateral rebasing', () => {
  const compiled = setup();
  const sample = (l) => sampleStageGroundMapRuntime(
    120,
    l,
    1,
    compiled.roadView,
    compiled.groundProfile,
  ).color;

  assert.ok([GROUND_COLORS.asphaltA, GROUND_COLORS.asphaltB].includes(sample(-4)));
  assert.ok([GROUND_COLORS.asphaltA, GROUND_COLORS.asphaltB].includes(sample(4)));
  assert.ok([GROUND_COLORS.grassA, GROUND_COLORS.grassB].includes(sample(0)));
  assert.equal(sample(8.5), GROUND_COLORS.shoulder);
  assert.throws(() => sample(9.1), /outside the local ground envelope/);
});

test('M6.34 SurfaceMap consumes the same stage-local junction cross-section', () => {
  const compiled = setup();
  assert.equal(compiled.surfaceMap.sample(20, 0).type, 'ASPHALT');
  assert.equal(compiled.surfaceMap.sample(20, 4).type, 'SHOULDER');
  assert.equal(compiled.surfaceMap.sample(20, 5).type, 'GRASS');

  assert.equal(compiled.surfaceMap.sample(120, -5).type, 'ASPHALT');
  assert.equal(compiled.surfaceMap.sample(120, 0).type, 'GRASS');
  assert.equal(compiled.surfaceMap.sample(120, 8.5).type, 'SHOULDER');
  assert.equal(compiled.surfaceMap.sample(120, 9.1).type, 'VOID');
});

test('M6.34 rejects a junction whose incoming width does not match the active stage road', () => {
  assert.throws(() => compileStageJunction({
    courseLength: 400,
    roadView: sourceRoadView({ roadLeft: 4.5, roadRight: 4.5, groundLeft: 6, groundRight: 6 }),
    groundProfile: {
      groundLeft: 6,
      groundRight: 6,
      roadLeft: 4.5,
      roadRight: 4.5,
      shoulderWidth: 1,
    },
  }, {
    roadViewId: 'BAD_VIEW',
    surfaceSectionName: 'BAD',
    crossSection: CROSS_SECTION,
  }), /incoming road width/);
});

test('M6.34 reusable junction layer adds no RouteDag, renderer, camera or vehicle-physics dependency', async () => {
  const [compilerSource, surfaceSource, groundSource] = await Promise.all([
    readFile(new URL('../src/runtime/stage-junction-compiler.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/stage-junction-surface-map.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/visual/stage-ground-map-view.ts', import.meta.url), 'utf8'),
  ]);
  const source = `${compilerSource}\n${surfaceSource}`;
  assert.doesNotMatch(source, /route-dag|route-boundary|route-stage-handoff|m5-renderer|camera|car-physics|motorcycle/i);
  assert.doesNotMatch(groundSource, /STAGE_2_[LR]|STAGE_3_[LR]|GOAL_[LR]|S[123][LR]_/);
});
