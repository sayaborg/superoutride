import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION, sampleM613RightBranchTargetL } from '../dist/dev/m6-13-junction.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';

const guide = createM2StadiumGuide();
const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
  junction: M6_13_JUNCTION,
  logical: compiled.groundMap,
};
const surfaces = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);

function asphaltColor(s) {
  return Math.floor(s * 0.25) & 1 ? GROUND_COLORS.asphaltA : GROUND_COLORS.asphaltB;
}

test('M6.13 DEV junction fits exactly inside the existing +/-12m GroundMap envelope', () => {
  const section = M6_13_JUNCTION.sample(530);
  assert.equal(section.phase, 'SEPARATED');
  assert.equal(section.outerHalfWidth, 11);
  assert.equal(section.medianHalfWidth, 4);
  assert.deepEqual(section.asphaltBands, [
    { min: -11, max: -4 },
    { min: 4, max: 11 },
  ]);
  assert.deepEqual(section.shoulderBands, [
    { min: -12, max: -11 },
    { min: 11, max: 12 },
  ]);
  assert.deepEqual(section.childCenterL, { LEFT: -7.5, RIGHT: 7.5 });
});

test('GroundMap visibly widens the single asphalt band before any median exists', () => {
  assert.equal(M6_13_JUNCTION.sample(410).phase, 'WIDENING');
  assert.equal(sampleGroundMap(410, 5, groundProfile), asphaltColor(410));
  assert.equal(sampleGroundMap(389, 5, groundProfile), GROUND_COLORS.shoulder);
});

test('GroundMap replaces the old centerline with a grassy median and two child-road markings', () => {
  const s = 534; // dash-on chainage
  const section = M6_13_JUNCTION.sample(s);
  assert.equal(section.phase, 'SEPARATED');
  assert.ok(section.childCenterL);
  const medianColor = sampleGroundMap(s, 0, groundProfile);
  assert.ok(medianColor === GROUND_COLORS.grassA || medianColor === GROUND_COLORS.grassB);
  assert.equal(sampleGroundMap(s, section.childCenterL.LEFT, groundProfile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(s, section.childCenterL.RIGHT, groundProfile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(s, -5, groundProfile), asphaltColor(s));
  assert.equal(sampleGroundMap(s, 5, groundProfile), asphaltColor(s));
});

test('SurfaceMap uses the same junction cross-section for asphalt, median and outer shoulders', () => {
  assert.equal(surfaces.sample(410, 5).type, 'ASPHALT');
  assert.equal(surfaces.sample(534, -7.5).type, 'ASPHALT');
  assert.equal(surfaces.sample(534, 7.5).type, 'ASPHALT');
  assert.equal(surfaces.sample(534, 0).type, 'GRASS');
  assert.equal(surfaces.sample(534, -11.5).type, 'SHOULDER');
  assert.equal(surfaces.sample(534, 11.5).type, 'SHOULDER');
});

test('DEV rival branch target moves continuously outward instead of snapping world position', () => {
  assert.equal(sampleM613RightBranchTargetL(390), 0);
  assert.equal(sampleM613RightBranchTargetL(410), 1.75);
  assert.equal(sampleM613RightBranchTargetL(430), 3.5);
  assert.equal(sampleM613RightBranchTargetL(480), 5.5);
  assert.equal(sampleM613RightBranchTargetL(530), 7.5);
});

test('M6.13 GroundMap build and live runtime use the same junction authoring authority', () => {
  const buildSource = fs.readFileSync(new URL('../tools/build-ground-map.mjs', import.meta.url), 'utf8');
  const mainSource = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(buildSource, /M6_13_JUNCTION/);
  assert.match(mainSource, /junction: M6_13_JUNCTION/);
  assert.match(mainSource, /new SurfaceMap\(guide\.length, compiledSurfaces\.surfaceSections, M6_13_JUNCTION\)/);
});

test('visible junction remains chainage-driven source data and does not add a second renderer road path', () => {
  const rendererSource = fs.readFileSync(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8');
  const terrainSource = fs.readFileSync(new URL('../src/road/terrain-line.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(rendererSource, /M6_13_JUNCTION|JunctionCrossSection/);
  assert.doesNotMatch(terrainSource, /M6_13_JUNCTION|JunctionCrossSection/);
});
