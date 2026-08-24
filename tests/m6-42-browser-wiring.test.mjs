import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('M6.42 browser runs one mode-selected multi-actor route arbitration after player and opponent physics', () => {
  const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(source, /createSharedRouteChoiceState\(M6_43_DEV_RACE_MODE\.sharedRouteChoiceMode\)/);
  assert.match(source, /createM643LiveOpponentRoster\(/);
  assert.match(source, /advanceLiveRouteMultiActorTick\(/);
  assert.match(source, /actorId:\s*'PLAYER'/);
  assert.match(source, /\.\.\.opponentTickStates\.map/);
  assert.match(source, /actorId:\s*opponent\.slot\.actorId/);
  assert.match(source, /const playerTraveler = createLiveRouteTravelerState/);
  assert.match(source, /const routeState = playerTraveler\.routeState/);
  assert.match(source, /const routeHandoffState = playerTraveler\.handoffState/);

  const playerPhysics = source.indexOf('updateM5Car(\n        runtimeBefore.coordinateFrame');
  const opponentPhysics = source.indexOf('updateM5Car(\n        opponentRuntimeBefore.coordinateFrame');
  const arbitration = source.indexOf('advanceLiveRouteMultiActorTick(');
  assert.ok(playerPhysics >= 0);
  assert.ok(opponentPhysics > playerPhysics);
  assert.ok(arbitration > opponentPhysics);

  assert.doesNotMatch(source, /actorId:\s*'RIVAL'/);
  assert.doesNotMatch(source, /const rival\s*=/);
  assert.doesNotMatch(source, /import \{ observeRouteBoundaryCrossing \}/);
  assert.doesNotMatch(source, /import \{ createRouteDagState, updateRouteDag/);
  assert.doesNotMatch(source, /advanceLiveRouteTraveler\(/);
  assert.doesNotMatch(source, /queueRouteStageHandoff\(/);
  assert.doesNotMatch(source, /commitRouteStageHandoff\(/);
});
