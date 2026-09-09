import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runHotPathProbe } from '../tools/hot-path-probe.mjs';
import { solveWheelOmega, wheelRequiredNetTorque, evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { limitWheelTorques } from '../dist/physics/torque-protection.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from '../dist/vehicle/vehicle-catalog.js';
import { createM93TsukubaCourse2000Runtime } from '../dist/dev/m9-3-tsukuba-circuit.js';
import { guideCourseToWorld, locateWorldOnGuideGlobal, locateWorldOnGuideLocal } from '../dist/core/guide-curve.js';

test('exact wheel and straight-drive/braking trace matches released b70f245 across nine profiles and three rates', async () => {
  const result = await runHotPathProbe();
  // libm/V8 rounding can differ across architectures. CI compares the immutable released
  // implementation on the SAME engine, never substitutes the candidate's hash as a baseline.
  if (process.env.CI) assert.ok(process.env.HOT_PATH_BASELINE_BUILD, 'CI requires the pinned baseline build');
  const reference = await runHotPathProbe(process.env.HOT_PATH_BASELINE_BUILD ?? 'dist');
  assert.equal(result.sha256, reference.sha256);
  assert.equal(result.wheelCases, 1152);
});

const tire = DEFAULT_VEHICLE_CATALOG_ENTRY.profile.frontStation.tire;
const input = { omegaPrevious: 10, inertia: 1, rollingRadius: .3, longitudinalVelocity: 3,
  lateralVelocity: 0, normalLoad: 3000, gripFactor: 1, rollingResistance: .01,
  driveTorque: 0, brakeTorque: 0, dt: 1 / 120, tire };

test('checked wheel/protection boundaries still reject every nonfinite numeric input', () => {
  for (const key of Object.keys(input).filter(key => key !== 'tire')) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const invalid = { ...input, [key]: value };
      assert.throws(() => solveWheelOmega(invalid), RangeError);
      assert.throws(() => wheelRequiredNetTorque(invalid, 0), RangeError);
      assert.throws(() => limitWheelTorques(invalid), RangeError);
    }
  }
  for (const key of ['muX', 'muY', 'kX', 'kY', 'rhoKnee', 'lowSpeedRegularization']) {
    const invalidTire = { ...tire, [key]: NaN };
    assert.throws(() => solveWheelOmega({ ...input, tire: invalidTire }), RangeError);
    assert.throws(() => evaluateTireForce(10, .3, 3, 0, 3000, 1, invalidTire), RangeError);
  }
  assert.equal(limitWheelTorques(input), input, 'no-op preserves immutable request identity');
});

test('range search preserves exact ascending-candidate tie handling on repeated geometry', () => {
  const guide = createM93TsukubaCourse2000Runtime().window.guide;
  for (const s of [0, 100, 2045, 2145, guide.length]) {
    const world = guideCourseToWorld(guide, s, 1);
    const candidates = guide.segments.map(segment => locateWorldOnGuideLocal(guide, world, segment.index, 0));
    const best = values => values.reduce((a, b) => b.distanceSquared < a.distanceSquared ? b : a);
    assert.deepEqual(locateWorldOnGuideGlobal(guide, world), best(candidates));
    const first = Math.max(0, world.segmentIndex - 5), last = Math.min(candidates.length - 1, world.segmentIndex + 5);
    assert.deepEqual(locateWorldOnGuideLocal(guide, world, world.segmentIndex, 5), best(candidates.slice(first, last + 1)));
  }
});

test('hot path retains one sample/body basis and no candidate index arrays', async () => {
  const read = path => readFile(new URL(path, import.meta.url), 'utf8');
  const guide = await read('../src/core/guide-curve.ts');
  assert.doesNotMatch(guide, /segmentIndices|Array\.from\(\{ length: last/);
  const dynamics = await read('../src/physics/vehicle-dynamics.ts');
  assert.doesNotMatch(dynamics, /sampleGuideCurve/);
  const integrator = await read('../src/physics/arcade-vehicle-physics.ts');
  assert.doesNotMatch(integrator, /bodyBeforeSteer|function locateSegmentIndex/);
  assert.match(integrator, /if \(step === VEHICLE_SUBSTEPS - 1\)/);
});
