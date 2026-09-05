import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { setEngineTorqueMultiplier } from '../dist/physics/automatic-powertrain.js';
import { deriveContactObservation, VEHICLE_GRAVITY } from '../dist/physics/vehicle-dynamics.js';
import {
  evaluateTireForce,
  radialC1Magnitude,
  lateralPostPeakScale,
  rollingResistanceTorque,
  solveWheelOmega,
  tireLinearDemand,
  validateCompiledTireProfile,
} from '../dist/physics/tire-wheel.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE as profile } from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

const DEG = Math.PI / 180;
const tire = profile.rearStation.tire;
const staticLoad = profile.mass * VEHICLE_GRAVITY * profile.frontAxle / (profile.frontAxle + profile.rearAxle);
const calibration = (G = 3, P = 0.24, S = 1, t = tire) => ({
  referenceFrictionMultiplier: G / t.muRef,
  linearStiffnessMultiplier: (2 - t.rhoKnee) * G / (t.normalizedStiffness * P),
  slidingFrictionRatio: S / G,
});

function atSlip(sx, sy, N, grip = 1, c = calibration(), t = tire) {
  const vx = 30;
  const ref = Math.hypot(vx, t.lowSpeedRegularization);
  return evaluateTireForce((vx + sx * ref) / 0.331, 0.331, vx, -sy * ref, N, grip, t,
    c.referenceFrictionMultiplier, c.linearStiffnessMultiplier, c.slidingFrictionRatio);
}

function near(actual, expected, tolerance = 1e-10, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${message}: ${actual} versus ${expected}`);
}

test('M9.18 compiled tires own normalized stiffness, not a second static-load stiffness', () => {
  for (const { profile: p } of VEHICLE_CATALOG) {
    for (const station of [p.frontStation, p.rearStation]) {
      assert.deepEqual(Object.keys(station.tire).sort(),
        ['lowSpeedRegularization', 'muRef', 'normalizedStiffness', 'rhoKnee']);
      assert.equal(Object.isFrozen(station.tire), true);
      validateCompiledTireProfile(station.tire);
    }
  }
  for (const key of Object.keys(tire)) {
    for (const value of [NaN, Infinity, -Infinity, 0, -1]) {
      assert.throws(() => validateCompiledTireProfile({ ...tire, [key]: value }), RangeError);
    }
  }
});

test('M9.18 one-k linear demand uses current load in both directions and rejects missing load', () => {
  const c = calibration();
  const d = tireLinearDemand(110, 0.331, 30, -5, 7000, tire, c.linearStiffnessMultiplier);
  near(d.dx, tire.normalizedStiffness * 7000 * c.linearStiffnessMultiplier * d.sx);
  near(d.dy, tire.normalizedStiffness * 7000 * c.linearStiffnessMultiplier * d.sy);
  for (const N of [NaN, Infinity, -Infinity, undefined]) {
    assert.throws(() => tireLinearDemand(110, 0.331, 30, -5, N, tire), /normal load/);
  }
});

test('M9.18 force and demand scale linearly with load throughout grip shoulder and deep combined slip', () => {
  let count = 0;
  for (const G of [2, 3, 4]) for (const P of [0.20, 0.24, 0.60]) for (const S of [1, G]) {
    const c = calibration(G, P, S);
    for (const grip of [0.33, 0.78, 1]) for (const sx of [-1, 0, 0.1, 0.5, 2]) {
      for (const sy of [-1, 0, 0.05, 1.5 * P * grip, 3 * P * grip]) {
        const base = atSlip(sx, sy, staticLoad, grip, c);
        for (const factor of [0.1, 0.9, 1.1, 2]) {
          const f = atSlip(sx, sy, staticLoad * factor, grip, c);
          for (const key of ['dx', 'dy', 'fx', 'fy', 'fmax']) near(f[key], base[key] * factor);
          near(f.rho, base.rho);
          assert.ok(Math.hypot(f.fx, f.fy) <= f.fmax * (1 + 1e-12));
          assert.ok(f.fx * sx + f.fy * sy >= -1e-9);
          count++;
        }
      }
    }
  }
  assert.equal(count, 5400);
});

test('M9.18 load no longer shifts P or 2P and the retained surface factor still does', () => {
  for (const N of [1e-6, 100, staticLoad * 0.9, staticLoad, staticLoad * 1.1, 30000]) {
    for (const grip of [0.33, 0.78, 1]) {
      for (const [position, mu] of [[1, 3], [1.5, 2], [2, 1], [4, 1]]) {
        const f = atSlip(0, 0.24 * grip * position, N, grip);
        near(f.fy / (N * grip), mu);
      }
    }
  }
  const middle = atSlip(0, 0.36, staticLoad);
  near(atSlip(0, 0.36, staticLoad * 0.9).fy / middle.fy, 0.9);
  near(atSlip(0, 0.36, staticLoad * 1.1).fy / middle.fy, 1.1);
});

test('M9.18 preserves the old one-k force exactly at each station static reference load', () => {
  for (const { profile: p } of VEHICLE_CATALOG) {
    for (const station of [p.frontStation, p.rearStation]) {
      const N = p.mass * VEHICLE_GRAVITY
        * (station.id === 'FRONT' ? p.rearAxle : p.frontAxle) / (p.frontAxle + p.rearAxle);
      const t = station.tire;
      const c = calibration(3, 0.24, 1, t);
      for (const sx of [-1, 0, 0.1, 0.7]) for (const sy of [-1, 0, 0.1, 0.36, 0.8]) {
        // Independent old static-C formula, test-only; no old runtime or force path is retained.
        const dx = t.normalizedStiffness * N * c.linearStiffnessMultiplier * sx;
        const dy = t.normalizedStiffness * N * c.linearStiffnessMultiplier * sy;
        const mag = Math.hypot(dx, dy), cap = 3 * N;
        const scale = mag > 0 ? radialC1Magnitude(mag / cap, t.rhoKnee) * cap / mag
          * lateralPostPeakScale(Math.abs(dy) / cap, t.rhoKnee, 1 / 3) : 0;
        const f = atSlip(sx, sy, N, 1, c, t);
        near(f.fx, dx * scale);
        near(f.fy, dy * scale);
      }
    }
  }
});

test('M9.18 unloaded and separated tires release force without a stale stiffness floor', () => {
  for (const N of [0, -100]) {
    const f = atSlip(1, -0.8, N);
    for (const key of ['dx', 'dy', 'fx', 'fy', 'fmax', 'rho']) assert.equal(f[key] === 0, true);
    assert.ok(Number.isFinite(f.sx) && Number.isFinite(f.sy));
  }
  const free = solveWheelOmega({ omegaPrevious: 10, inertia: 3, rollingRadius: 0.331,
    longitudinalVelocity: 5, lateralVelocity: 4, normalLoad: 0, gripFactor: 1,
    rollingResistance: 0.015, driveTorque: 120, brakeTorque: 0, dt: 1 / 720, tire });
  near(free.omega, 10 + 120 / 3 / 720);
});

test('M9.18 wheel residual stays monotone finite and deterministic through load changes', () => {
  let count = 0;
  for (const N of [0, 1e-6, 100, 3000, 10000, 30000]) for (const vx of [-15, 0, 30]) {
    for (const vy of [0, 5, -20]) for (const drive of [-1000, 0, 5000]) {
      const input = { omegaPrevious: 50, inertia: 3.4, rollingRadius: 0.331,
        longitudinalVelocity: vx, lateralVelocity: vy, normalLoad: N, gripFactor: 1,
        ...calibration(), rollingResistance: 0.015, driveTorque: drive, brakeTorque: 0,
        dt: 1 / 720, tire };
      const out = solveWheelOmega(input);
      assert.deepEqual(out, solveWheelOmega(input));
      for (const value of [out.omega, out.omegaDot, out.tire.fx, out.tire.fy, out.tire.rho]) {
        assert.ok(Number.isFinite(value));
      }
      const residual = input.inertia * out.omegaDot - drive + 0.331 * out.tire.fx
        + rollingResistanceTorque(out.omega, 0.331, N, 0.015, tire.lowSpeedRegularization);
      near(residual, 0, 2e-7);
      let last = -Infinity;
      for (const omega of [-300, -100, 0, 30, 100, 300]) {
        const f = evaluateTireForce(omega, 0.331, vx, vy, N, 1, tire,
          input.referenceFrictionMultiplier, input.linearStiffnessMultiplier, input.slidingFrictionRatio);
        const r = input.inertia / input.dt * (omega - input.omegaPrevious) - drive + 0.331 * f.fx
          + rollingResistanceTorque(omega, 0.331, N, 0.015, tire.lowSpeedRegularization);
        assert.ok(r > last);
        assert.ok(f.fx * (vx - 0.331 * omega) + f.fy * vy <= 1e-8);
        last = r;
      }
      count++;
    }
  }
  assert.equal(count, 162);
});

// A seeded equilibrium is a test fixture, never a product target or a runtime input controller.
// The seed was solved at 60 Hz / 12 substeps. Only initial state is assigned; thereafter all
// motion, wheel speed, suspension load and automatic shifts evolve through the ordinary solver.
const seed25 = Object.freeze([13.59461680554975, -6.339273926110492, 0.7106107573665932,
  0.4807320702229874, 0, 0.011434568189762262, 0, 45.914584056710815, 53.8401713355938,
  -0.2852268411292135]);
const input25 = Object.freeze([0.7166641350501138, 0.24383527356825296]);
const input30 = Object.freeze([0.7299350919484503, 0.2795313608604636]);
const guide = compileGuidePath(compileRasterPath([{ x: 0, z: -10000 }, { x: 0, z: 10000 }]),
  { lMax: 5000, mMin: 0.25, dCam: 5 });
const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
const surface = new SurfaceMap(guide.length, [{ sStart: 0, name: 'M9.18 flat mechanics fixture',
  bands: [{ lMin: -5000, lMax: 5000, type: 'ASPHALT' }] }]);

function seededCar(perturbDegrees = 0) {
  const v = createArcadeVehicle(profile, guide, height, surface, 10000, 0, 15,
    { maxRoadWheelSteer: 60 * DEG, steeringOffsetMax: 12 * DEG,
      steeringActuatorResponse: { applyRate: 4, releaseRate: 4 } }, calibration());
  setEngineTorqueMultiplier(v.powertrain, 3);
  [v.velocityZ, v.velocityX, v.yawRate, v.y, v.velocityY, v.pitch, v.pitchRate,
    v.frontWheelOmega, v.rearWheelOmega, v.frontSteerAngle] = seed25;
  v.powertrain.gear = 2;
  if (perturbDegrees !== 0) {
    v.velocityZ = 15 * Math.cos((-25 + perturbDegrees) * DEG);
    v.velocityX = 15 * Math.sin((-25 + perturbDegrees) * DEG);
  }
  return v;
}

function beta(v) { return Math.atan2(v.lateralSpeed, v.longitudinalSpeed) / DEG; }
function drive(v, seconds, command = () => input25, dt = 1 / 60) {
  const rows = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const u = command(i * dt);
    updateArcadeVehicle(guide, height, surface, v,
      { steering: u[0], throttle: u[1], brake: 0, steeringApplyMode: 'DIRECT', pedalApplyMode: 'DIRECT' }, dt);
    assert.equal(v.surfaceType, 'ASPHALT');
    assert.equal(v.supported, true);
    assert.ok(Number.isFinite(v.speed) && Number.isFinite(v.yawRate));
    rows.push({ t: (i + 1) * dt, beta: beta(v), speed: v.speed, gear: v.powertrain.gear });
  }
  return rows;
}

function rearSlip(v) {
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const body = { position: { x: v.x, y: v.y, z: v.z },
    velocity: { x: v.velocityX, y: v.velocityY, z: v.velocityZ },
    right: { x: c, y: 0, z: -s }, forward: { x: s * cp, y: sp, z: c * cp },
    up: { x: -s * sp, y: cp, z: -c * sp },
    omegaWorld: { x: -c * v.pitchRate, y: v.yawRate, z: s * v.pitchRate } };
  const o = deriveContactObservation(guide, height, surface, body, profile.rearStation, 0, v.course.segmentIndex);
  return (o.effectiveRollingRadius * v.rearWheelOmega - o.longitudinalVelocity)
    / Math.hypot(o.longitudinalVelocity, tire.lowSpeedRegularization);
}

test('M9.18 ordinary solver sustains a seeded 54 km/h 25-degree power drift for 30 seconds', () => {
  const v = seededCar();
  const rows = drive(v, 30);
  for (const r of rows) {
    assert.ok(Math.abs(r.beta + 25) < 0.15);
    assert.ok(Math.abs(r.speed - 15) < 0.10);
    assert.equal(r.gear, 2);
  }
  assert.ok(rearSlip(v) > 0.20, 'sustained driven-wheel slip, not a shallow grip circle');
  assert.ok(v.powertrain.outputDriveTorque > 0);
});

test('M9.18 one-point throttle changes have opposite controllable short-horizon responses', () => {
  const angles = [-0.01, 0, 0.01].map((change) => {
    const v = seededCar();
    drive(v, 1, () => [input25[0], input25[1] + change]);
    return -beta(v);
  });
  assert.ok(angles[0] > 24 && angles[0] < 24.9);
  assert.ok(Math.abs(angles[1] - 25) < 0.05);
  assert.ok(angles[2] > 25.1 && angles[2] < 26);
  console.log('M9.18 THROTTLE RESPONSE', JSON.stringify(angles));
});

test('M9.18 small drift perturbations recover under unchanged player input', () => {
  for (const perturb of [-1, 1]) {
    const v = seededCar(perturb);
    drive(v, 30);
    assert.ok(Math.abs(beta(v) + 25) < 0.05);
    assert.ok(Math.abs(v.speed - 15) < 0.05);
    assert.ok(rearSlip(v) > 0.20);
  }
});

test('M9.18 input-only 25-to-30-to-25-degree transition preserves speed without feedback or resets', () => {
  const command = (t) => {
    const mix = t < 3 ? 0 : t < 9 ? (t - 3) / 6 : t < 19 ? 1 : t < 25 ? 1 - (t - 19) / 6 : 0;
    return input25.map((x, i) => x + (input30[i] - x) * mix);
  };
  const rows = drive(seededCar(), 40, command);
  for (const r of rows) {
    assert.ok(r.beta < -23 && r.beta > -32);
    assert.ok(r.speed > 14.5 && r.speed < 15.5);
    assert.equal(r.gear, 2);
  }
  const high = rows[19 * 60 - 1], last = rows.at(-1);
  assert.ok(Math.abs(high.beta + 30) < 0.1);
  assert.ok(Math.abs(last.beta + 25) < 0.1);
  assert.ok(Math.abs(last.speed - 15) < 0.05);
  console.log('M9.18 INPUT-ONLY TRANSITION', JSON.stringify({ high, last }));
});

test('M9.18 seeded hold and throttle direction survive time-step refinement', () => {
  const outcomes = [];
  for (const dt of [1 / 60, 1 / 120, 1 / 240]) {
    const v = seededCar();
    drive(v, 10, () => input25, dt);
    assert.ok(Math.abs(beta(v) + 25) < 0.25);
    assert.ok(Math.abs(v.speed - 15) < 0.15);
    const more = seededCar(), less = seededCar();
    drive(more, 1, () => [input25[0], input25[1] + 0.01], dt);
    drive(less, 1, () => [input25[0], input25[1] - 0.01], dt);
    assert.ok(beta(more) < beta(less) - 0.3);
    outcomes.push({ dt, beta: beta(v), speed: v.speed });
  }
  console.log('M9.18 STEP REFINEMENT', JSON.stringify(outcomes));
});

test('M9.18 normalization introduces no tire memory or second force/control authority', async () => {
  const [source, profiles] = await Promise.all([
    readFile(new URL('../src/physics/tire-wheel.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-profiles.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(source, /cornerStiffness|staticLoad|driftMode|driftAssist|targetSideslip|yawRate|betaTravel/);
  assert.doesNotMatch(profiles, /cornerStiffness/);
  assert.match(source, /tire\.normalizedStiffness \* Math\.max\(0, normalLoad\)/);
  assert.match(source, /const width = peak;/);
});
