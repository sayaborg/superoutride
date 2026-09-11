import assert from 'node:assert/strict';
import test from 'node:test';

import { createHillDipHeightProfile } from '../dist/dev/fixtures/hill-dip-height.js';
import { createMaterialTransitionSurfaceMap } from '../dist/dev/fixtures/material-transitions.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';

test('rival controller drives through the first crest/bend with causal release and recontact', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const surfaces = createMaterialTransitionSurfaceMap(guide.length);
  const rival = createTestCar(guide, height, surfaces, 95);
  const start = { x: rival.x, z: rival.z, s: rival.course.s };
  let maxAbsL = 0;
  let observedAirborne = false;
  let observedRecontact = false;

  // Three seconds crosses the authored crest and first bend transition. derives contact
  // causally, so the crest releases the car before it recontacts; no recovery helper is used.
  for (let i = 0; i < 180; i += 1) {
    const input = sampleRivalDrivingInput(guide, rival);
    updateTestVehicle(guide, height, surfaces, rival, input, 1 / 60);
    maxAbsL = Math.max(maxAbsL, Math.abs(rival.course.l));
    assert.ok(Number.isFinite(rival.x) && Number.isFinite(rival.z) && Number.isFinite(rival.yaw));
    if (!rival.supported) observedAirborne = true;
    else if (observedAirborne) observedRecontact = true;
  }

  assert.ok(Math.hypot(rival.x - start.x, rival.z - start.z) > 100);
  assert.ok(rival.course.s !== start.s);
  assert.equal(observedAirborne, true);
  assert.equal(observedRecontact, true);
  assert.ok(maxAbsL < 10.5, `max |l|=${maxAbsL}`);
});
