import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM627LiveRouteRuntime } from '../dist/dev/m6-27-live-route-runtime.js';
import { M6_43_DEV_RACE_MODE } from '../dist/dev/m6-43-dev-race-mode.js';
import {
  createM643LiveOpponentRoster,
  opponentSpawnS,
} from '../dist/dev/m6-43-opponent-roster.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM6DebugRaceRules } from '../dist/gameplay/race-progress.js';
import {
  CURRENT_RIVAL_COUNT_CAP,
  compileRaceMode,
} from '../dist/gameplay/race-mode.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

function createFixture() {
  const guide = createM2StadiumGuide();
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  const live = createM627LiveRouteRuntime(
    guide,
    {
      heightProfile,
      surfaceMap,
      groundProfile,
      terrainProfile: {
        screenHeight: 240,
        dMin: 2.5,
        dMax: 150,
        groundLeft: 12,
        groundRight: 12,
        roadLeft: 4.5,
        roadRight: 4.5,
        height: heightProfile,
        visual: visualProfile,
        thinSpanScreenRows: 1,
      },
      selectFarBackground: () => createM3FarBackground(),
      worldSprites: [],
    },
    createM4SpriteAssets(),
  );
  return { guide, heightProfile, surfaceMap, live, raceRules: createM6DebugRaceRules(guide) };
}

test('M6.43 game mode compiler owns current 0..16 rival cardinality and deterministic actor ids', () => {
  assert.equal(CURRENT_RIVAL_COUNT_CAP, 16);

  const solo = compileRaceMode({
    id: 'TEST_SOLO',
    rivalCount: 0,
    sharedRouteChoiceMode: 'INDEPENDENT',
  });
  assert.equal(solo.opponents.length, 0);

  const full = compileRaceMode({
    id: 'TEST_FULL',
    rivalCount: CURRENT_RIVAL_COUNT_CAP,
    sharedRouteChoiceMode: 'INDEPENDENT',
  });
  assert.equal(full.opponents.length, 16);
  assert.deepEqual(
    full.opponents.map((entry) => entry.actorId),
    Array.from({ length: 16 }, (_, index) => `RIVAL_${String(index + 1).padStart(2, '0')}`),
  );
  assert.deepEqual(full.opponents.map((entry) => entry.rosterIndex), Array.from({ length: 16 }, (_, index) => index));
});

test('M6.43 game mode rejects invalid field sizes without leaking the cap into route/runtime code', () => {
  for (const rivalCount of [-1, 17, 1.5, Number.NaN]) {
    assert.throws(
      () => compileRaceMode({ id: 'BAD', rivalCount, sharedRouteChoiceMode: 'INDEPENDENT' }),
      /rivalCount/,
    );
  }
});

test('M6.43 mode preserves shared-route policy independently from field cardinality', () => {
  const shared = compileRaceMode({
    id: 'SHARED_FIELD',
    rivalCount: 7,
    sharedRouteChoiceMode: 'FIRST_PHYSICAL_CROSSING_LOCKS',
  });
  assert.equal(shared.rivalCount, 7);
  assert.equal(shared.sharedRouteChoiceMode, 'FIRST_PHYSICAL_CROSSING_LOCKS');
  assert.equal(shared.opponents.length, 7);
});

test('M6.43 current DEV mode deliberately preserves one opponent but no longer defines runtime cardinality', () => {
  assert.equal(M6_43_DEV_RACE_MODE.id, 'DEV_CURRENT');
  assert.equal(M6_43_DEV_RACE_MODE.rivalCount, 1);
  assert.equal(M6_43_DEV_RACE_MODE.sharedRouteChoiceMode, 'INDEPENDENT');
  assert.equal(M6_43_DEV_RACE_MODE.opponents[0]?.actorId, 'RIVAL_01');
});

test('M6.43 live roster factory instantiates independent runtime bundles at both 0 and 16 rival extremes', () => {
  for (const rivalCount of [0, 16]) {
    const fixture = createFixture();
    const mode = compileRaceMode({
      id: `FIELD_${rivalCount}`,
      rivalCount,
      sharedRouteChoiceMode: 'INDEPENDENT',
    });
    const roster = createM643LiveOpponentRoster(
      mode,
      fixture.live,
      fixture.guide,
      fixture.heightProfile,
      fixture.surfaceMap,
      fixture.raceRules,
    );
    assert.equal(roster.length, rivalCount);
    assert.equal(new Set(roster.map((entry) => entry.slot.actorId)).size, rivalCount);
    assert.equal(new Set(roster.map((entry) => entry.vehicle)).size, rivalCount);
    assert.equal(new Set(roster.map((entry) => entry.traveler)).size, rivalCount);
    assert.equal(new Set(roster.map((entry) => entry.recovery)).size, rivalCount);
    assert.equal(new Set(roster.map((entry) => entry.raceProgress)).size, rivalCount);
    assert.equal(new Set(roster.map((entry) => entry.raceSession)).size, rivalCount);
  }
});

test('M6.43 DEV opponent starting grid is deterministic, unique and inside the current pre-fork course region', () => {
  const fixture = createFixture();
  const mode = compileRaceMode({
    id: 'FULL_GRID',
    rivalCount: 16,
    sharedRouteChoiceMode: 'INDEPENDENT',
  });
  const roster = createM643LiveOpponentRoster(
    mode,
    fixture.live,
    fixture.guide,
    fixture.heightProfile,
    fixture.surfaceMap,
    fixture.raceRules,
  );
  for (let index = 0; index < roster.length; index += 1) {
    assert.ok(Math.abs(roster[index].vehicle.course.s - opponentSpawnS(index)) <= 1e-9);
  }
  assert.ok(roster.every((entry) => entry.vehicle.course.s < 390));
  assert.ok(roster.every((entry) => entry.vehicle.supported));
});

test('M6.43 one opponent state mutation cannot alias another opponent state bundle', () => {
  const fixture = createFixture();
  const mode = compileRaceMode({ id: 'PAIR', rivalCount: 2, sharedRouteChoiceMode: 'INDEPENDENT' });
  const roster = createM643LiveOpponentRoster(
    mode,
    fixture.live,
    fixture.guide,
    fixture.heightProfile,
    fixture.surfaceMap,
    fixture.raceRules,
  );
  const before = JSON.stringify(roster[1]);
  roster[0].vehicle.longitudinalSpeed += 10;
  roster[0].traveler.previousWorldPoint.x += 1;
  roster[0].recovery.recoveries += 1;
  assert.equal(JSON.stringify(roster[1]), before);
});

test('M6.43 mode/roster layers keep renderer cardinality-agnostic', () => {
  const modeSource = fs.readFileSync(new URL('../src/gameplay/race-mode.ts', import.meta.url), 'utf8');
  const rosterSource = fs.readFileSync(new URL('../src/dev/m6-43-opponent-roster.ts', import.meta.url), 'utf8');
  const rendererSource = fs.readFileSync(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8');
  const routeTickSource = fs.readFileSync(new URL('../src/runtime/live-route-multi-actor-tick.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(modeSource, /render\/|physics\/|camera|CourseSprite/);
  assert.doesNotMatch(rosterSource, /render\/|camera|CourseSprite/);
  assert.doesNotMatch(rendererSource, /CURRENT_RIVAL_COUNT_CAP|rivalCount|DEV_CURRENT|M6_43/);
  assert.doesNotMatch(routeTickSource, /CURRENT_RIVAL_COUNT_CAP|rivalCount|\b16\b|M6_43/);
});

test('M6.43 browser iterates the mode roster instead of owning one special rival', () => {
  const mainSource = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(mainSource, /const opponents = createM643LiveOpponentRoster\(/);
  assert.match(mainSource, /createSharedRouteChoiceState\(M6_43_DEV_RACE_MODE\.sharedRouteChoiceMode\)/);
  assert.match(mainSource, /const opponentTickStates = opponents\.map/);
  assert.match(mainSource, /\.\.\.opponentTickStates\.map/);
  assert.match(mainSource, /for \(let index = 0; index < opponentTickStates\.length; index \+= 1\)/);
  assert.match(mainSource, /const opponentSprites = opponents\.flatMap/);
  assert.match(mainSource, /opponent\.slot\.actorId/);
  assert.doesNotMatch(mainSource, /const rival\s*=/);
  assert.doesNotMatch(mainSource, /const rivalTraveler|const rivalRoutePlan|const rivalRecovery|const rivalRaceProgress/);
  assert.doesNotMatch(mainSource, /CURRENT_RIVAL_COUNT_CAP|\b16\b/);
});

test('M6.43 browser renders only package-compatible opponents and disables old local-chainage standings after route divergence', () => {
  const mainSource = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(mainSource, /liveRouteTravelersShareRuntimePackage\(runtime, opponentRuntime\)/);
  assert.match(mainSource, /createDynamicVehicleCourseSprite\(\s*opponent\.slot\.actorId/);
  assert.match(mainSource, /const parentFieldDiagnostic = isParentRaceDiagnostic\(runtime\)/);
  assert.match(mainSource, /opponents\.every\(\(opponent\) => isParentRaceDiagnostic/);
  assert.match(mainSource, /const standings = parentFieldDiagnostic\s*\? rankRaceProgress/);
  assert.match(mainSource, /const positionText = playerStanding === null \? `--\/\$\{fieldSize\}`/);
});
