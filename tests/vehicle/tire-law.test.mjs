import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brushForce,
  brushSlipAtForce,
  compileTireCharacteristics,
  slidingFall,
  tirePeakSlip,
} from '../../src/vehicle/physics/tire-friction-calibration.js';
import {
  createTireForceScratch,
  createWheelSolveResult,
  solveWheelOmega,
  wheelRequiredNetTorque,
} from '../../src/vehicle/physics/tire-wheel.js';

// The brush tire law (K, 2026-11-16) and the wheel solve that reads it.
const TIRE = compileTireCharacteristics({ grip: 2.5, stiffness: 40, slidingRatio: 1 });
const FALLING = compileTireCharacteristics({ grip: 2.5, stiffness: 40, slidingRatio: 0.85 });
const LOAD = 4000;
const RADIUS = 0.3;
const residual = new Float64Array(1);

/** A wheel at `vx` (m/s) and `vy`, its previous speed `omegaPrevious`, on `gripFactor`. */
function wheel(tire, { vx = 30, vy = 0, gripFactor = 1, load = LOAD, omegaPrevious = vx / RADIUS } = {}) {
  return {
    omegaPrevious,
    inertia: 1.2,
    rollingRadius: RADIUS,
    longitudinalVelocity: vx,
    lateralVelocity: vy,
    normalLoad: load,
    gripFactor,
    characteristics: tire,
    rollingResistance: 0,
    driveTorque: 0,
    brakeTorque: 0,
    dt: 1 / 720,
  };
}

/** The tire's force at wheel speed `omega`, its fall taken at the same speed: the scratch the evaluation leaves. */
function force(tire, options, omega) {
  const input = wheel(tire, { ...options, omegaPrevious: omega });
  const scratch = createTireForceScratch();
  wheelRequiredNetTorque(input, omega, scratch, residual);
  return { ...scratch };
}
const U = (vx) => Math.hypot(vx, 1);
/** The wheel speed at longitudinal slip `sx` for a wheel at `vx`. */
const omegaAt = (sx, vx = 30) => (vx + sx * U(vx)) / RADIUS;

test('H rises monotonically to 1 at the peak with zero slope there, and its inverse returns its slip', () => {
  let previous = 0;
  for (let k = 1; k <= 1000; k++) {
    const theta = k / 1000;
    const h = brushForce(theta);
    assert.ok(h > previous, `H(${theta})`);
    previous = h;
    assert.ok(Math.abs(brushSlipAtForce(h) - theta) < 1e-9, `inverse at ${theta}`);
  }
  assert.equal(brushForce(1), 1);
  assert.equal(brushForce(2), 1);
  const e = 1e-6;
  assert.ok((brushForce(1) - brushForce(1 - e)) / e < 1e-5, 'slope at the peak');
  assert.ok(Math.abs(brushForce(e) / e - 3) < 1e-5, 'slope at zero slip');
});

test('small slip gives the force Ne*c*sigma on any surface, and the peak slip follows the surface', () => {
  for (const gripFactor of [1, 0.43, 0.25]) {
    for (const [sx, vy] of [
      [1e-7, 0],
      [0, -1e-7 * U(30)],
      [6e-8, -8e-8 * U(30)],
    ]) {
      const f = force(TIRE, { gripFactor, vy }, omegaAt(sx));
      const sigma = Math.hypot(f.sx, f.sy);
      assert.ok(Math.abs(Math.hypot(f.fx, f.fy) / (LOAD * TIRE.stiffness * sigma) - 1) < 1e-5, `${gripFactor}`);
    }
    const peak = tirePeakSlip(TIRE, gripFactor);
    assert.ok(Math.abs(peak - (gripFactor * 3 * TIRE.grip) / TIRE.stiffness) < 1e-15);
    const atPeak = force(TIRE, { gripFactor }, omegaAt(peak));
    assert.ok(Math.abs(atPeak.theta - 1) < 1e-9);
    assert.ok(Math.abs(atPeak.fx / (LOAD * gripFactor * TIRE.grip) - 1) < 1e-9);
  }
});

test('the force opposes the slip, keeps within its bound and does no work against the slip', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let k = 0; k < 2000; k++) {
    const vx = 40 * random(),
      vy = 10 * random();
    const gripFactor = Math.abs(random()) + 0.05;
    for (const tire of [TIRE, FALLING]) {
      const f = force(tire, { vx, vy, gripFactor }, (vx + 3 * random()) / RADIUS);
      assert.ok(Math.hypot(f.fx, f.fy) <= LOAD * gripFactor * tire.grip * (1 + 1e-12));
      assert.ok(Math.abs(f.fx * f.sy - f.fy * f.sx) <= 1e-9 * Math.hypot(f.fx, f.fy) * Math.hypot(f.sx, f.sy));
      assert.ok(f.fx * f.sx + f.fy * f.sy >= 0);
    }
  }
});

test('past the peak the force holds with sliding ratio 1, and falls from it with zero slope toward s below 1', () => {
  const peak = tirePeakSlip(TIRE, 1);
  for (const theta of [1, 1.5, 3, 10]) {
    const f = force(TIRE, {}, omegaAt(theta * peak));
    assert.ok(Math.abs(f.fx / (LOAD * TIRE.grip) - 1) < 1e-9, `${theta}`);
  }
  const e = 1e-5;
  assert.equal(slidingFall(1, 0.85), 1);
  assert.ok((1 - slidingFall(1 + e, 0.85)) / e < 1e-4, 'zero slope at the peak');
  let previous = 1;
  for (let theta = 1.1; theta < 50; theta += 0.1) {
    const d = slidingFall(theta, 0.85);
    assert.ok(d < previous && d > 0.85);
    previous = d;
  }
  assert.ok(Math.abs(slidingFall(1000, 0.85) - 0.85) < 1e-6);
  const far = force(FALLING, {}, omegaAt(40 * peak));
  assert.ok(Math.abs(far.fx / (LOAD * FALLING.grip) - slidingFall(40, 0.85)) < 1e-6);
});

test('the wheel residual rises with wheel speed and its root is unique, with the fall and at low speed under load', () => {
  for (const tire of [TIRE, FALLING]) {
    for (const [vx, vy, load] of [
      [30, 0, LOAD],
      [2, 0.5, 4 * LOAD],
      [0.3, -0.2, 6 * LOAD],
      [-5, 1, LOAD],
    ]) {
      for (const sx of [-2, -0.3, 0, 0.1, 0.5]) {
        const input = wheel(tire, { vx, vy, load, omegaPrevious: omegaAt(sx, vx) });
        const scratch = createTireForceScratch();
        let previous = -Infinity;
        for (let k = -400; k <= 400; k++) {
          const omega = input.omegaPrevious + k * 0.25;
          const value = wheelRequiredNetTorque(input, omega, scratch, residual);
          assert.ok(value > previous, `residual at ${omega} for ${vx}, ${vy}, ${load}`);
          previous = value;
        }
        for (const driveTorque of [-3000, 0, 800, 5000]) {
          const solved = solveWheelOmega(
            { ...input, driveTorque },
            createWheelSolveResult(),
            residual,
            createTireForceScratch(),
          );
          const net = wheelRequiredNetTorque(input, solved.omega, scratch, residual);
          assert.ok(Math.abs(net - driveTorque) < 1e-6, `root for ${driveTorque}`);
        }
      }
    }
  }
});
