import {
  createTireForceScratch,
  createWheelSolveResult,
  createTireForceResult,
} from '../../dist/physics/tire-wheel.js';
import { createPlanarCoordinateSample } from '../../dist/core/planar-sample.js';
import { createGuideProjectionWorkspace } from '../../dist/core/guide-curve.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { guidePathToWorld, locateWorldOnGuideGlobal, locateWorldOnGuideLocal } from '../../dist/core/guide-curve.js';
import { createRepeatedReferenceWorld } from '../helpers/repeated-world.mjs';
import { evaluateTireForce, solveWheelOmega, wheelRequiredNetTorque } from '../../dist/physics/tire-wheel.js';
import { limitWheelTorques } from '../../dist/physics/torque-protection.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from '../../dist/vehicle/vehicle-catalog.js';
import { runHotPathProbe } from '../../tools/performance/hot-path-probe.mjs';

test('wheel, turning and pedal traces match the released reference across nine profiles and three rates', async () => {
  const result = await runHotPathProbe('dist');
  // libm/V8 rounding can differ across architectures. CI compares the immutable released
  // implementation on the SAME engine, never substitutes the candidate's hash as a baseline.
  if (process.env.CI) assert.ok(process.env.HOT_PATH_BASELINE_BUILD, 'CI requires the pinned baseline build');
  const reference = await runHotPathProbe(process.env.HOT_PATH_BASELINE_BUILD ?? 'dist');
  assert.equal(result.sha256, reference.sha256);
  assert.equal(result.wheelCases, 1152);
});

const tire = DEFAULT_VEHICLE_CATALOG_ENTRY.profile.frontStation.tire;
const input = {
  omegaPrevious: 10,
  inertia: 1,
  rollingRadius: 0.3,
  longitudinalVelocity: 3,
  lateralVelocity: 0,
  normalLoad: 3000,
  gripFactor: 1,
  rollingResistance: 0.01,
  driveTorque: 0,
  brakeTorque: 0,
  dt: 1 / 120,
  tire,
};

test('checked wheel/protection boundaries still reject every nonfinite numeric input', () => {
  for (const key of Object.keys(input).filter((key) => key !== 'tire')) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const invalid = { ...input, [key]: value };
      assert.throws(
        () => solveWheelOmega(invalid, createWheelSolveResult(), new Float64Array(1), createTireForceScratch()),
        RangeError,
      );
      assert.throws(
        () => wheelRequiredNetTorque(invalid, 0, createTireForceScratch(), new Float64Array(1)),
        RangeError,
      );
      assert.throws(
        () => limitWheelTorques(invalid, { ...invalid }, createTireForceScratch(), new Float64Array(1)),
        RangeError,
      );
    }
  }
  for (const key of ['muX', 'muY', 'kX', 'kY', 'rhoKnee', 'lowSpeedRegularization']) {
    const invalidTire = { ...tire, [key]: NaN };
    assert.throws(
      () =>
        solveWheelOmega(
          { ...input, tire: invalidTire },
          createWheelSolveResult(),
          new Float64Array(1),
          createTireForceScratch(),
        ),
      RangeError,
    );
    assert.throws(
      () =>
        evaluateTireForce(
          10,
          0.3,
          3,
          0,
          3000,
          1,
          invalidTire,
          invalidTire,
          createTireForceResult(),
          createTireForceScratch(),
        ),
      RangeError,
    );
  }
  assert.equal(
    limitWheelTorques(input, { ...input }, createTireForceScratch(), new Float64Array(1)),
    input,
    'no-op preserves immutable request identity',
  );
});

test('negative rolling resistance cannot invalidate the bounded wheel equation', () => {
  const invalid = { ...input, rollingResistance: -100, driveTorque: 1000 };
  assert.throws(
    () => solveWheelOmega(invalid, createWheelSolveResult(), new Float64Array(1), createTireForceScratch()),
    /rolling resistance/,
  );
  assert.throws(
    () => wheelRequiredNetTorque(invalid, 0, createTireForceScratch(), new Float64Array(1)),
    /rolling resistance/,
  );
  assert.throws(
    () => limitWheelTorques(invalid, { ...invalid }, createTireForceScratch(), new Float64Array(1)),
    /rolling resistance/,
  );
});

test('range search preserves exact ascending-candidate tie handling on repeated geometry', () => {
  const guide = createRepeatedReferenceWorld().window.guide;
  for (const s of [0, 100, 2045, 2145, guide.length]) {
    const world = guidePathToWorld(guide, s, 1, createPlanarCoordinateSample());
    const candidates = guide.segments.map((segment) =>
      locateWorldOnGuideLocal(
        guide,
        world,
        segment.index,
        0,
        false,
        { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
        createGuideProjectionWorkspace(),
      ),
    );
    const best = (values) => values.reduce((a, b) => (b.distanceSquared < a.distanceSquared ? b : a));
    assert.deepEqual(
      locateWorldOnGuideGlobal(
        guide,
        world,
        false,
        { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
        createGuideProjectionWorkspace(),
      ),
      best(candidates),
    );
    const first = Math.max(0, world.segmentIndex - 5),
      last = Math.min(candidates.length - 1, world.segmentIndex + 5);
    assert.deepEqual(
      locateWorldOnGuideLocal(
        guide,
        world,
        world.segmentIndex,
        5,
        false,
        { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 },
        createGuideProjectionWorkspace(),
      ),
      best(candidates.slice(first, last + 1)),
    );
  }
});

test('independent consumers explicitly reuse their own tire and Guide outputs', () => {
  const a = createWheelSolveResult(),
    b = createWheelSolveResult();
  const scratch = createTireForceScratch(),
    residual = new Float64Array(1);
  assert.equal(solveWheelOmega(input, a, residual, scratch), a);
  const saved = structuredClone(a);
  assert.equal(solveWheelOmega({ ...input, driveTorque: 3000 }, b, residual, scratch), b);
  assert.deepEqual(a, saved);
  assert.equal(solveWheelOmega(input, b, residual, scratch), b);
  assert.deepEqual(b, a);
  const guide = createRepeatedReferenceWorld().window.guide;
  const pointA = createPlanarCoordinateSample(),
    pointB = createPlanarCoordinateSample();
  const projection = createGuideProjectionWorkspace();
  const coordinate = { s: 0, l: 0, segmentIndex: -1, distanceSquared: 0 };
  for (const s of [100, 2145, 2045, 0, guide.length]) {
    assert.equal(guidePathToWorld(guide, s, 1, pointA), pointA);
    const snapshot = { ...pointA };
    guidePathToWorld(guide, guide.length - s, -2, pointB);
    assert.deepEqual(pointA, snapshot);
    const expected = locateWorldOnGuideLocal(
      guide,
      pointA,
      pointA.segmentIndex,
      2,
      false,
      { ...coordinate },
      createGuideProjectionWorkspace(),
    );
    assert.equal(
      locateWorldOnGuideLocal(guide, pointA, pointA.segmentIndex, 2, false, coordinate, projection),
      coordinate,
    );
    assert.deepEqual(coordinate, expected);
  }
});
