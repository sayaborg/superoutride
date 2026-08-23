import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { createM5DebugSurfaceMap } from '../dist/physics/surface-map.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';

test('M6.3 rival controller drives the ordinary M5 car physics forward without position snapping', () => {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const surfaces = createM5DebugSurfaceMap(guide.length);
  const rival = createM5Car(guide, height, surfaces, 95);
  const start = { x: rival.x, z: rival.z, s: rival.course.s };
  let maxAbsL = 0;

  for (let i = 0; i < 180; i += 1) {
    const input = sampleRivalDrivingInput(guide, rival);
    updateM5Car(guide, height, surfaces, rival, input, 1 / 60);
    maxAbsL = Math.max(maxAbsL, Math.abs(rival.course.l));
    assert.ok(Number.isFinite(rival.x) && Number.isFinite(rival.z) && Number.isFinite(rival.yaw));
  }

  assert.ok(Math.hypot(rival.x - start.x, rival.z - start.z) > 100);
  assert.ok(rival.course.s !== start.s);
  assert.ok(maxAbsL < guide.lMax);
  assert.equal(rival.supported, true);
});
