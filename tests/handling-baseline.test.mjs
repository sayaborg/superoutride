import { near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mountBrowserSteeringCalibrationControls } from '../dist/browser/steering-calibration-controls.js';
import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import { createRecoveryState, recoverVehicle } from '../dist/gameplay/recovery.js';
import { readTireCharacteristics } from '../dist/physics/tire-friction-calibration.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createTerrainProbe } from '../tools/torque-protection-terrain-probe.mjs';
import { selectorDocument, SelectorElement } from './helpers/fake-selector-dom.mjs';

test('all cars and bikes receive the same player baseline with controls above and below it', () => {
  for (const entry of VEHICLE_CATALOG) {
    const p = createTerrainProbe(entry),
      v = p.vehicle;
    const containers = {
      steeringOffset: new SelectorElement(),
      maxRoadWheelSteer: new SelectorElement(),
      steeringResponse: new SelectorElement(),
    };
    const ctl = mountBrowserSteeringCalibrationControls(containers, () => v, selectorDocument);
    const tireHost = new SelectorElement();
    mountBrowserTireFrictionControls(tireHost, () => v, selectorDocument);
    const c = readTireCharacteristics(v.tireFrictionCalibration.front);
    for (const [field, value] of Object.entries({ gripX: 5, peakSlipX: 0.2, gripY: 2.5, peakSlipY: 0.1, knee: 0.74 }))
      near(c[field], value, 1e-12, { exclusive: true });
    near(v.steeringCalibration.steeringOffsetMax, (20 * Math.PI) / 180, 1e-12, { exclusive: true });
    near(v.steeringCalibration.maxRoadWheelSteer, (65 * Math.PI) / 180, 1e-12, { exclusive: true });
    near(v.steeringCalibration.steeringActuatorResponse.applyRate, 1 / 0.3, 1e-12, { exclusive: true });
    for (const [host, initial, below] of [
      [containers.steeringOffset, '20°', '19°'],
      [containers.maxRoadWheelSteer, '65°', '60°'],
      [containers.steeringResponse, '0.30 s', '0.275 s'],
    ]) {
      assert.equal(host.children.length, 1);
      const [minus, value, plus] = host.children[0].children;
      assert.equal(value.textContent, initial);
      minus.click();
      assert.equal(value.textContent, below);
      plus.click();
      assert.equal(value.textContent, initial);
    }
    const px = tireHost.children[1];
    px.children[2].click();
    near(readTireCharacteristics(v.tireFrictionCalibration.front).peakSlipX, 0.21, 1e-12, { exclusive: true });
    px.children[0].click();
    px.children[0].click();
    near(readTireCharacteristics(v.tireFrictionCalibration.front).peakSlipX, 0.19, 1e-12, { exclusive: true });
    for (const [key, host, first, last, count] of [
      ['KeyY', containers.steeringOffset, '10°', '30°', 21],
      ['KeyU', containers.maxRoadWheelSteer, '50°', '80°', 7],
      ['KeyT', containers.steeringResponse, '0.20 s', '0.40 s', 9],
    ]) {
      const [minus, value, plus] = host.children[0].children;
      // Visit the full grid, then prove both wrap directions and keyboard synchronization.
      for (let i = 0; value.textContent !== last && i < count; i++) plus.click();
      assert.equal(value.textContent, last);
      assert.equal(ctl.handleKey(key), true);
      assert.equal(value.textContent, first);
      minus.click();
      assert.equal(value.textContent, last);
    }
    const steering = structuredClone(v.steeringCalibration),
      tires = v.tireFrictionCalibration;
    recoverVehicle({ guide: p.guide, height: p.height, surfaces: p.surface }, v, { state: createRecoveryState(v) });
    assert.deepEqual(v.steeringCalibration, steering);
    assert.equal(v.tireFrictionCalibration, tires);
  }
});
