import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('browser composes all actors into one shared post-physics route arbitration', () => {
  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const lifecycle = fs.readFileSync(new URL('../src/runtime/route-driving-tick.ts', import.meta.url), 'utf8');
  assert.match(source, /advanceRouteDrivingTick\(/);
  assert.match(source, /actorId:\s*'PLAYER'/);
  assert.match(source, /const drivingActors = \[playerActor, \.\.\.rivals\]/);
  assert.match(source, /createSharedRouteChoiceState\(\s*M8_3_BRANCHING_COURSE_MODE\.sharedRouteChoiceMode/);
  assert.match(lifecycle, /const frames = actors\.map/);
  assert.equal((lifecycle.match(/advanceLiveRouteMultiActorTick\(/g) ?? []).length, 1);
  assert.ok(lifecycle.indexOf('advanceVehicleWithRecovery(') < lifecycle.indexOf('advanceLiveRouteMultiActorTick('));
  assert.match(lifecycle, /tick\.actors\[actor\.actorId\]/);
  assert.doesNotMatch(
    source,
    /observeRouteBoundaryCrossing\(|advanceLiveRouteTraveler\(|queueRouteStageHandoff\(|commitRouteStageHandoff\(/,
  );
});
