import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('M6.42 browser keeps one post-physics multi-actor arbitration while later mode/roster layers choose policy and cardinality', () => {
  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(source, /advanceLiveRouteMultiActorTick\(/);
  assert.match(source, /actorId:\s*'PLAYER'/);
  assert.match(source, /\.\.\.rivalFrames\.map/);
  assert.match(source, /const playerTraveler = createLiveRouteTravelerState/);
  assert.match(source, /const routeState = playerTraveler\.routeState/);
  assert.match(source, /const routeHandoffState = playerTraveler\.handoffState/);
  assert.match(source, /createSharedRouteChoiceState\(M8_3_BRANCHING_COURSE_MODE\.sharedRouteChoiceMode\)/);

  const playerPhysics = source.indexOf('updateM5Car(\n        runtimeBefore.coordinateFrame');
  const rivalPhysics = source.indexOf('updateM5Car(\n        rivalRuntimeBefore.coordinateFrame');
  const arbitration = source.indexOf('advanceLiveRouteMultiActorTick(');
  assert.ok(playerPhysics >= 0);
  assert.ok(rivalPhysics > playerPhysics);
  assert.ok(arbitration > rivalPhysics);

  assert.doesNotMatch(source, /import \{ observeRouteBoundaryCrossing \}/);
  assert.doesNotMatch(source, /import \{ createRouteDagState, updateRouteDag/);
  assert.doesNotMatch(source, /advanceLiveRouteTraveler\(/);
  assert.doesNotMatch(source, /queueRouteStageHandoff\(/);
  assert.doesNotMatch(source, /commitRouteStageHandoff\(/);
});
