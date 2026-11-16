import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brushSlipAtForce,
  compileTireCharacteristics,
  tirePeakSlip,
} from '../../src/vehicle/physics/tire-friction-calibration.js';
import { createTireForceScratch, wheelRequiredNetTorque } from '../../src/vehicle/physics/tire-wheel.js';
import { steeringForceFraction } from '../../src/vehicle/physics/vehicle-physics.js';

// A steering input asks the front tire for a force at its static load (K, 2026-11-16).
const TIRE = compileTireCharacteristics({ grip: 2.5, stiffness: 40, slidingRatio: 1 });
const STATIC = 5000;
const X = 0.95;

/** The front tire's lateral force under input `u` at load `load`, its slip set as the steering rule sets it. */
function lateralForce(u, load, gripFactor = 1) {
  const f = steeringForceFraction(u, X, STATIC / load);
  const slip = tirePeakSlip(TIRE, gripFactor) * brushSlipAtForce(f);
  // Rolling without longitudinal slip at 30 m/s, sliding sideways at the slip the rule asks.
  const vx = 30,
    U = Math.hypot(vx, 1);
  const input = {
    omegaPrevious: vx / 0.3,
    inertia: 1,
    rollingRadius: 0.3,
    longitudinalVelocity: vx,
    lateralVelocity: -slip * U,
    normalLoad: load,
    gripFactor,
    characteristics: TIRE,
    rollingResistance: 0,
    driveTorque: 0,
    brakeTorque: 0,
    dt: 1 / 720,
  };
  const scratch = createTireForceScratch();
  wheelRequiredNetTorque(input, vx / 0.3, scratch, new Float64Array(1));
  return { force: Math.hypot(scratch.fx, scratch.fy), bound: load * gripFactor * TIRE.grip, f };
}

test('at the static load an input asks the part |u|X of the bound, as before, and full input gives the same limit', () => {
  for (const u of [0, 0.25, 0.5, 1, -0.7]) assert.equal(steeringForceFraction(u, X, 1), Math.abs(u) * X);
  assert.equal(steeringForceFraction(1, X, 1), X);
});

test('a load 1.3 times the static load leaves the front tire the force the same input asks at the static load', () => {
  for (const u of [0.3, 0.6, 1]) {
    for (const gripFactor of [1, 0.43]) {
      const atStatic = lateralForce(u, STATIC, gripFactor).force;
      const loaded = lateralForce(u, 1.3 * STATIC, gripFactor).force;
      assert.ok(Math.abs(loaded / atStatic - 1) < 0.01, `${u} on ${gripFactor}: ${loaded} against ${atStatic}`);
    }
  }
});

test('a load 0.7 times the static load uses the front tire at X of the bound it has', () => {
  const { force, bound, f } = lateralForce(1, 0.7 * STATIC);
  assert.equal(f, X);
  assert.ok(Math.abs(force / bound - X) < 1e-9);
  // A small input is still asked at the static load: within X of the bound now.
  const small = lateralForce(0.5, 0.7 * STATIC);
  assert.ok(Math.abs(small.force / (0.5 * X * STATIC * TIRE.grip) - 1) < 1e-9);
});
