import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createM613GroundMapProfile,
  createM613SurfaceMap,
  sampleM613RightBranchTargetL,
} from '../dist/dev/m6-13-visible-junction.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';

const ground = createM613GroundMapProfile();
const surfaces = createM613SurfaceMap();

test('M6.13 DEV junction fits exactly inside the existing +/-12m GroundMap envelope', () => {
  const separated = M6_13_JUNCTION.sample(530);
  assert.equal(separated.outerLeft, -12);
  assert.equal(separated.outerRight, 12);
  assert.equal(ground.groundLeft, 12);
  assert.equal(ground.groundRight, 12);
});

test('GroundMap visibly widens the single asphalt band before any median exists', () => {
  assert.equal(ground.sample(360, 4.6), 'SHOULDER');
  assert.equal(ground.sample(390, 4.6), 'ROAD');
  assert.equal(ground.sample(390, 7.2), 'SHOULDER');
  assert.equal(ground.sample(390, 8.2), 'GRASS');
});

test('GroundMap replaces the old centerline with a grassy median and two child-road markings', () => {
  assert.equal(ground.sample(480, 0), 'GRASS');
  assert.equal(ground.sample(480, -5.5), 'ROAD_MARKING');
  assert.equal(ground.sample(480, 5.5), 'ROAD_MARKING');
  assert.equal(ground.sample(530, -7.5), 'ROAD_MARKING');
  assert.equal(ground.sample(530, 7.5), 'ROAD_MARKING');
});

test('SurfaceMap uses the same junction cross-section for asphalt, median and outer shoulders', () => {
  assert.equal(surfaces.sample(360, 4.6).type, 'SHOULDER');
  assert.equal(surfaces.sample(390, 4.6).type, 'ASPHALT');
  assert.equal(surfaces.sample(480, 0).type, 'GRASS');
  assert.equal(surfaces.sample(480, -5.5).type, 'ASPHALT');
  assert.equal(surfaces.sample(480, 5.5).type, 'ASPHALT');
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
