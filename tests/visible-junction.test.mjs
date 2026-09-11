import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';

import { sampleStadiumRightBranchTargetL, STADIUM_JUNCTION } from '../dist/dev/courses/stadium-junction.js';
import { createStadiumSurfaceRegionAuthoring } from '../dist/dev/courses/stadium-surface-authoring.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/groundmap/ground-map.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { compileSurfaceRegions } from '../dist/runtime/surface-region-compiler.js';

const guide = createStadiumGuide();
const compiled = compileSurfaceRegions(guide.length, createStadiumSurfaceRegionAuthoring(guide.length));
const groundProfile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  roadMarkings: CENTER_DASH_MARKINGS,
  junctionMarkings: CENTER_DASH_MARKINGS,
  shoulderWidth: 1,
  junction: STADIUM_JUNCTION,
  logical: compiled.groundMap,
};
const surfaces = new SurfaceMap(guide.length, compiled.surfaceSections, STADIUM_JUNCTION);

function asphaltColor(s) {
  return Math.floor(s * 0.25) & 1 ? GROUND_COLORS.asphaltA : GROUND_COLORS.asphaltB;
}

test('DEV junction fits exactly inside the existing +/-12m GroundMap envelope', () => {
  const section = STADIUM_JUNCTION.sample(530);
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
  assert.equal(STADIUM_JUNCTION.sample(410).phase, 'WIDENING');
  assert.equal(sampleGroundMap(410, 5, groundProfile), asphaltColor(410));
  assert.equal(sampleGroundMap(389, 5, groundProfile), GROUND_COLORS.shoulder);
});

test('GroundMap replaces the old centerline with a grassy median and two child-road markings', () => {
  const s = 534; // dash-on chainage
  const section = STADIUM_JUNCTION.sample(s);
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
  assert.equal(sampleStadiumRightBranchTargetL(390), 0);
  assert.equal(sampleStadiumRightBranchTargetL(410), 1.75);
  assert.equal(sampleStadiumRightBranchTargetL(430), 3.5);
  assert.equal(sampleStadiumRightBranchTargetL(480), 5.5);
  assert.equal(sampleStadiumRightBranchTargetL(530), 7.5);
});

test('baked fixture remains historical while current live runtime selects the junction authority', () => {
  const buildSource = fs.readFileSync(new URL('../tools/build-ground-map.mjs', import.meta.url), 'utf8');
  const mainSource = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(buildSource, /STADIUM_JUNCTION/);
  assert.match(mainSource, /createDefaultBranchingParent/);
  assert.match(mainSource, /BRANCHING_DEFAULT_BRANCHING_FORK/);
  assert.doesNotMatch(mainSource, /STADIUM_JUNCTION/);
});

test('visible junction remains chainage-driven source data and does not add a second renderer road path', () => {
  const rendererSource = fs.readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
  const terrainSource = fs.readFileSync(new URL('../src/road/terrain-line.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(rendererSource, /STADIUM_JUNCTION|JunctionCrossSection/);
  assert.doesNotMatch(terrainSource, /STADIUM_JUNCTION|JunctionCrossSection/);
});
