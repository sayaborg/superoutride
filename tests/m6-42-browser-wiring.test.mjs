import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('M6.42 browser runs one INDEPENDENT multi-actor route arbitration after both physics updates', () => {
  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(source, /createSharedRouteChoiceState\('INDEPENDENT'\)/);
  assert.match(source, /advanceLiveRouteMultiActorTick\(/);
  assert.match(source, /actorId:\s*'PLAYER'/);
  assert.match(source, /actorId:\s*'RIVAL'/);
  assert.match(source, /const playerTraveler = createLiveRouteTravelerState/);
  assert.match(source, /const routeState = playerTraveler\.routeState/);
  assert.match(source, /const routeHandoffState = playerTraveler\.handoffState/);

  const playerPhysics = source.indexOf('updateM5Car(\n        runtimeBefore.coordinateFrame');
  const rivalPhysics = source.indexOf('updateM5Car(\n      rivalRuntimeBefore.coordinateFrame');
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
