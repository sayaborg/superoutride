import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCourseCompilerFoundation } from '../dist/compiler/course-validation.js';
import { validateSpritePhysicalMetadata } from '../dist/compiler/sprite-metadata.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';

const guide = createM2StadiumGuide();
const authored = createM5DebugSurfaceRegionAuthoring(guide.length);
const compiled = compileSurfaceRegions(guide.length, authored);

test('Surface Region authoring compiles and coalesces independent runtime profiles', () => {
  assert.deepEqual(compiled.groundMap.sections.map((section) => section.sStart), [0, 455, 625]);
  assert.deepEqual(compiled.visualSections.map((section) => section.sStart), [0, 455, 625]);
  assert.deepEqual(compiled.surfaceSections.map((section) => section.sStart), [0, 280, 360, 455, 625]);
});

test('compiled SurfaceMap preserves sand, cliff verge and implicit VOID semantics', () => {
  const map = new CyclicSurfaceMap(guide.length, compiled.surfaceSections);
  assert.equal(map.sample(300, 7).type, 'SAND');
  assert.equal(map.sample(500, -6).type, 'DIRT');
  assert.equal(map.sample(500, -8).type, 'VOID');
  assert.equal(map.sample(500, 7).type, 'GRASS');
});

test('compiled GroundMap logical material is independent from GroundBase transparency', () => {
  const profile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    logical: compiled.groundMap,
  };
  const left = sampleGroundMap(500, -9, profile, false);
  const right = sampleGroundMap(500, 9, profile, false);
  assert.ok(left === GROUND_COLORS.rockA || left === GROUND_COLORS.rockB);
  assert.ok(right === GROUND_COLORS.grassA || right === GROUND_COLORS.grassB);
  assert.equal(compiled.visualSections[1].groundBaseLeft.kind, 'transparent');
});

test('Surface Region compiler rejects overlapping physical bands', () => {
  const bad = [{
    ...authored[0],
    surfaceBands: [
      { lMin: -5, lMax: 1, type: 'ASPHALT' },
      { lMin: 0, lMax: 5, type: 'GRASS' },
    ],
  }];
  assert.throws(() => compileSurfaceRegions(guide.length, bad), /must not overlap/);
});

test('course compiler foundation validates draw distance and drivable Guide envelope', () => {
  const report = validateCourseCompilerFoundation(guide.length, authored, { dMax: 150, guideLateralLimit: 12 });
  assert.equal(report.maxSupportedAbsL, 10.5);
  assert.throws(
    () => validateCourseCompilerFoundation(guide.length, authored, { dMax: guide.length / 2, guideLateralLimit: 12 }),
    /dMax < Lcourse\/2/,
  );
  assert.throws(
    () => validateCourseCompilerFoundation(guide.length, authored, { dMax: 150, guideLateralLimit: 10.5 }),
    /must remain inside Guide chart/,
  );
});

test('sprite metadata validator accepts explicit physical width', () => {
  const metadata = validateSpritePhysicalMetadata({
    name: 'CAR_REAR',
    sourceWidthTexels: 80,
    sourceHeightTexels: 56,
    worldWidthMeters: 2,
  });
  assert.equal(metadata.worldWidthMeters, 2);
});

test('sprite metadata validator requires worldWidthMeters', () => {
  assert.throws(
    () => validateSpritePhysicalMetadata({ name: 'BAD', sourceWidthTexels: 80, sourceHeightTexels: 56 }),
    /worldWidthMeters is required/,
  );
});

test('sprite metadata validator forbids arbitrary visualScale', () => {
  assert.throws(
    () => validateSpritePhysicalMetadata({
      name: 'BAD_SCALE',
      sourceWidthTexels: 80,
      sourceHeightTexels: 56,
      worldWidthMeters: 2,
      visualScale: 0.5,
    }),
    /visualScale is forbidden/,
  );
});
