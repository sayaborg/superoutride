import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';

test('M8.0 rival controller drives through the first crest/bend with causal release and recontact', () => {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const surfaces = createM5DebugSurfaceMap(guide.length);
  const rival = createM5Car(guide, height, surfaces, 95);
  const start = { x: rival.x, z: rival.z, s: rival.course.s };
  let maxAbsL = 0;
  let observedAirborne = false;
  let observedRecontact = false;

  // Three seconds crosses the authored crest and first bend transition. M8.0 derives contact
  // causally, so the crest releases the car before it recontacts; no recovery helper is used.
  for (let i = 0; i < 180; i += 1) {
    const input = sampleRivalDrivingInput(guide, rival);
    updateM5Car(guide, height, surfaces, rival, input, 1 / 60);
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
