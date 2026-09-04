import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createAutomaticPowertrainState,
  setEngineTorqueMultiplier,
  updateAutomaticPowertrain,
} from '../dist/physics/automatic-powertrain.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE, COMMON_SELECTABLE_VEHICLE_TIRE } from '../dist/physics/vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle, recoverM5VehicleToGuideCoordinate } from '../dist/gameplay/recovery.js';
import {
  BROWSER_ENGINE_POWER_MULTIPLIERS,
  BROWSER_ENGINE_POWER_CYCLE_CODE,
  nextEnginePowerMultiplier,
  formatEnginePowerSelector,
  mountBrowserEnginePowerControls,
} from '../dist/browser/engine-power-controls.js';
import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import { createVehicleDebugHudModel } from '../dist/browser/vehicle-debug-hud.js';

const profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE.powertrain;
const highway = createM72DefaultBranchingParent();
const guide = highway.guide;
const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
const surfaces = new SurfaceMap(guide.length, [{
  sStart: 0, name: 'ENGINE POWER PROBE',
  bands: [{ lMin: -1000, lMax: 1000, type: 'ASPHALT' }],
}]);
const neutral = { steering: 0, throttle: false, brake: false };
const wheelOmega = (rpm, gear, p = profile) => rpm * 2 * Math.PI / (60 * p.gearRatios[gear - 1] * p.finalDriveRatio);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const tireCalibration = (grip = 2, peak = 0.24, slide = grip) => ({
  referenceFrictionMultiplier: grip / COMMON_SELECTABLE_VEHICLE_TIRE.muRef,
  linearStiffnessMultiplier: (2 - COMMON_SELECTABLE_VEHICLE_TIRE.rhoKnee) * grip
    / (peak * COMMON_SELECTABLE_VEHICLE_TIRE.frontNormalizedStiffness),
  slidingFrictionRatio: slide / grip,
});
const makeVehicle = (p = FERRARI_TESTAROSSA_VEHICLE_PROFILE, tire = tireCalibration()) =>
  createArcadeVehicle(p, guide, height, surfaces, 800, 0, 25, undefined, tire);

function sampleCurve(p, rpm) {
  if (rpm <= p.torqueCurve[0].rpm) return p.torqueCurve[0].torqueNewtonMeters;
  for (let i = 1; i < p.torqueCurve.length; i += 1) {
    const b = p.torqueCurve[i];
    const a = p.torqueCurve[i - 1];
    if (rpm <= b.rpm) return a.torqueNewtonMeters + (b.torqueNewtonMeters - a.torqueNewtonMeters) * (rpm - a.rpm) / (b.rpm - a.rpm);
  }
  return p.torqueCurve.at(-1).torqueNewtonMeters;
}

test('M9.16 engine selector has one exact diagnostic domain, default and deterministic cycle', () => {
  assert.deepEqual(BROWSER_ENGINE_POWER_MULTIPLIERS, [1, 1.5, 2, 3, 4]);
  assert.equal(BROWSER_ENGINE_POWER_CYCLE_CODE, 'KeyK');
  assert.equal(createAutomaticPowertrainState(profile).engineTorqueMultiplier, 1);
  let value = 1;
  for (const expected of [1.5, 2, 3, 4, 1]) {
    value = nextEnginePowerMultiplier(value);
    assert.equal(value, expected);
  }
  assert.equal(formatEnginePowerSelector(1.5), 'ENG [K] x1.5');
});

test('M9.16 1x retains the unscaled torque equation and every choice scales output at identical RPM and state', () => {
  for (const { profile: vehicleProfile } of VEHICLE_CATALOG) {
    const p = vehicleProfile.powertrain;
    const curveBefore = JSON.stringify(p);
    const omega = wheelOmega((p.downshiftRpm + p.upshiftRpm) / 2, 1, p);
    const base = createAutomaticPowertrainState(p, omega);
    const states = BROWSER_ENGINE_POWER_MULTIPLIERS.map((m) => createAutomaticPowertrainState(p, omega, m));
    for (const pedal of [0, 0.25, 0.75, 1, 0]) {
      updateAutomaticPowertrain(base, p, omega, pedal, 1 / 60);
      const sampled = sampleCurve(p, base.engineRpm);
      near(base.engineTorqueNewtonMeters, sampled);
      const redlineScale = Math.max(0, Math.min(1, (p.redlineRpm - base.engineRpm) / (p.redlineRpm - p.upshiftRpm)));
      near(base.outputDriveTorque, pedal * sampled * p.gearRatios[base.gear - 1] * p.finalDriveRatio * p.efficiency * (base.shiftTimer > 0 ? 0 : 1) * redlineScale);
      for (const state of states) {
        updateAutomaticPowertrain(state, p, omega, pedal, 1 / 60);
        assert.equal(state.engineRpm, base.engineRpm);
        assert.equal(state.gear, base.gear);
        assert.equal(state.shiftTimer, base.shiftTimer);
        assert.equal(state.shiftDirection, base.shiftDirection);
        near(state.engineTorqueNewtonMeters, base.engineTorqueNewtonMeters * state.engineTorqueMultiplier);
        near(state.outputDriveTorque, base.outputDriveTorque * state.engineTorqueMultiplier);
      }
    }
    assert.equal(JSON.stringify(p), curveBefore, vehicleProfile.id);
  }
});

test('M9.16 multiplier does not bypass zero throttle, shift cutoff or redline cutoff', () => {
  for (const multiplier of BROWSER_ENGINE_POWER_MULTIPLIERS) {
    const state = createAutomaticPowertrainState(profile, wheelOmega(4000, 2), multiplier);
    state.gear = 2;
    state.engineRpm = 4000;
    assert.equal(updateAutomaticPowertrain(state, profile, wheelOmega(4000, 2), 0, 1 / 60), 0);
    state.shiftTimer = 0.1;
    assert.equal(updateAutomaticPowertrain(state, profile, wheelOmega(4000, 2), 1, 1 / 60), 0);
    state.shiftTimer = 0;
    state.gear = profile.gearRatios.length;
    state.engineRpm = profile.redlineRpm;
    assert.equal(updateAutomaticPowertrain(state, profile, wheelOmega(profile.redlineRpm, state.gear), 1, 1 / 60), 0);
  }
});

test('M9.16 calibration mutation is isolated and invalid values cannot partially mutate state', () => {
  const vehicle = makeVehicle();
  const rival = makeVehicle();
  const before = JSON.stringify(vehicle);
  const stateBefore = { ...vehicle.powertrain };
  setEngineTorqueMultiplier(vehicle.powertrain, 3);
  assert.deepEqual(vehicle.powertrain, { ...stateBefore, engineTorqueMultiplier: 3 });
  const snapshot = JSON.parse(before);
  snapshot.powertrain.engineTorqueMultiplier = 3;
  assert.deepEqual(JSON.parse(JSON.stringify(vehicle)), snapshot);
  assert.equal(rival.powertrain.engineTorqueMultiplier, 1);
  for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
    const current = { ...vehicle.powertrain };
    assert.throws(() => setEngineTorqueMultiplier(vehicle.powertrain, bad), RangeError);
    assert.deepEqual(vehicle.powertrain, current);
    assert.throws(() => createAutomaticPowertrainState(profile, 0, bad), RangeError);
  }
});

test('M9.16 manual and explicit route recovery preserve calibration while resetting dynamic drive state', () => {
  const vehicle = makeVehicle();
  const recovery = createM5RecoveryState(vehicle);
  setEngineTorqueMultiplier(vehicle.powertrain, 4);
  updateArcadeVehicle(guide, height, surfaces, vehicle, { steering: 0, throttle: true, brake: false }, 1 / 60);
  recoverM5Vehicle(recovery, guide, height, surfaces, vehicle);
  assert.equal(vehicle.powertrain.engineTorqueMultiplier, 4);
  assert.equal(vehicle.powertrain.outputDriveTorque, 0);
  assert.equal(vehicle.actuator.throttle, 0);
  recoverM5VehicleToGuideCoordinate(recovery, guide, height, surfaces, vehicle, { s: 800, l: 0 }, 'wrong-course');
  assert.equal(vehicle.powertrain.engineTorqueMultiplier, 4);
  assert.equal(vehicle.powertrain.shiftTimer, 0);
  assert.deepEqual(vehicle.tireFrictionCalibration, tireCalibration());
});

class FakeElement {
  children = [];
  listeners = new Map();
  attributes = new Map();
  textContent = '';
  classList = { toggle() {} };
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  replaceChildren(...children) { this.children = children; }
  appendChild(child) { this.children.push(child); return child; }
  click() { this.listeners.get('click')?.(); }
}
const fakeDocument = { createElement: () => new FakeElement() };

test('M9.16 touch and keyboard share current engine authority without disturbing tire controls', () => {
  let vehicle = makeVehicle();
  const host = new FakeElement();
  const tireControls = mountBrowserTireFrictionControls(host, () => vehicle, fakeDocument);
  const originalButtons = [...host.children];
  const controls = mountBrowserEnginePowerControls(host, () => vehicle, fakeDocument);
  assert.equal(host.children.length, 4);
  assert.deepEqual(host.children.slice(0, 3), originalButtons);
  const button = host.children[3];
  assert.equal(button.textContent, 'ENG x1.0');
  const tiresBefore = { ...vehicle.tireFrictionCalibration };
  button.click();
  assert.equal(vehicle.powertrain.engineTorqueMultiplier, 1.5);
  assert.equal(button.textContent, 'ENG x1.5');
  assert.deepEqual(vehicle.tireFrictionCalibration, tiresBefore);
  assert.equal(controls.handleKey('KeyH'), false);
  assert.equal(controls.handleKey('KeyK'), true);
  assert.equal(vehicle.powertrain.engineTorqueMultiplier, 2);
  tireControls.handleKey('KeyH');
  assert.equal(host.children[3], button);
  assert.equal(vehicle.powertrain.engineTorqueMultiplier, 2);
  const oldVehicle = vehicle;
  vehicle = makeVehicle(VEHICLE_CATALOG[1].profile);
  setEngineTorqueMultiplier(vehicle.powertrain, oldVehicle.powertrain.engineTorqueMultiplier);
  button.click();
  assert.equal(vehicle.powertrain.engineTorqueMultiplier, 3);
  assert.equal(oldVehicle.powertrain.engineTorqueMultiplier, 2);
  assert.equal(button.textContent, 'ENG x3.0');
  assert.equal(createVehicleDebugHudModel('linear', neutral, vehicle).enginePowerSelector, 'ENG [K] x3.0');
});

test('M9.16 increased engine output reaches the body only through ordinary wheel and tire dynamics', () => {
  const base = makeVehicle();
  const boosted = makeVehicle();
  setEngineTorqueMultiplier(boosted.powertrain, 2);
  const input = { steering: 0, throttle: true, brake: false };
  updateArcadeVehicle(guide, height, surfaces, base, input, 1 / 60);
  updateArcadeVehicle(guide, height, surfaces, boosted, input, 1 / 60);
  assert.ok(boosted.control.deliveredDriveTorque > base.control.deliveredDriveTorque);
  assert.ok(boosted.speed > base.speed);
  assert.deepEqual(boosted.tireFrictionCalibration, base.tireFrictionCalibration);
  assert.equal(boosted.control.frontBrakeTorque, base.control.frontBrakeTorque);
  assert.equal(boosted.control.rearBrakeTorque, base.control.rearBrakeTorque);
});

test('M9.16 all nine profiles remain finite at 4x with non-dropping G2/S2 and G3/S3 tire probes', () => {
  for (const { profile: p } of VEHICLE_CATALOG) {
    for (const grip of [2, 3]) {
      const vehicle = makeVehicle(p, tireCalibration(grip));
      setEngineTorqueMultiplier(vehicle.powertrain, 4);
      for (let tick = 0; tick < 60; tick += 1) {
        updateArcadeVehicle(guide, height, surfaces, vehicle, { steering: 0.25, throttle: true, brake: false }, 1 / 60);
        for (const value of [vehicle.x, vehicle.y, vehicle.z, vehicle.speed, vehicle.yaw, vehicle.yawRate,
          vehicle.frontWheelOmega, vehicle.rearWheelOmega, vehicle.powertrain.outputDriveTorque]) {
          assert.ok(Number.isFinite(value), `${p.id} G${grip} tick=${tick}`);
        }
      }
    }
  }
});

test('M9.16 all browser roots wire the same adapter and preserve engine calibration on replacement', async () => {
  for (const file of ['main.ts', 'main-linear.ts', 'main-circuit.ts']) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /const enginePowerControls = mountBrowserEnginePowerControls\(/);
    assert.match(source, /if \(enginePowerControls\.handleKey\(event\.code\)\) return;/);
    assert.match(source, /if \(event\.repeat\) return;/);
    assert.match(source, /const engineTorqueMultiplier = vehicle\.powertrain\.engineTorqueMultiplier;/);
    assert.match(source, /setEngineTorqueMultiplier\(vehicle\.powertrain, engineTorqueMultiplier\);/);
  }
  const solver = await readFile(new URL('../src/physics/automatic-powertrain.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(solver, /driftMode|yawRate|vehicle\.velocity|from ['"].*browser|from ['"].*dev\//);
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.tire-friction-selector-buttons\s*\{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tire-friction-selector-buttons\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.engine-power-button\s*\{\s*grid-column: 1 \/ -1/);
});
