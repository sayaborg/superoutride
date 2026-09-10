import assert from 'node:assert/strict';
import test from 'node:test';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createTerrainProbe } from '../tools/torque-protection-terrain-probe.mjs';
import { mountBrowserSteeringCalibrationControls } from '../dist/browser/steering-calibration-controls.js';
import { mountBrowserTireFrictionControls } from '../dist/browser/tire-friction-controls.js';
import { readTireCharacteristics } from '../dist/physics/tire-friction-calibration.js';
import { createRecoveryState, recoverVehicle } from '../dist/gameplay/recovery.js';
import { SelectorElement, selectorDocument } from './helpers/fake-selector-dom.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('M9.29 all cars and bikes receive the same player baseline with controls above and below it', () => {
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
      near(c[field], value);
    near(v.steeringCalibration.steeringOffsetMax, (20 * Math.PI) / 180);
    near(v.steeringCalibration.maxRoadWheelSteer, (65 * Math.PI) / 180);
    near(v.steeringCalibration.steeringActuatorResponse.applyRate, 1 / 0.3);
    for (const host of Object.values(containers)) {
      const i = host.children.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
      assert.ok(i > 0 && i < host.children.length - 1, entry.profile.id);
    }
    const px = tireHost.children[1];
    px.children[2].click();
    near(readTireCharacteristics(v.tireFrictionCalibration.front).peakSlipX, 0.21);
    px.children[0].click();
    px.children[0].click();
    near(readTireCharacteristics(v.tireFrictionCalibration.front).peakSlipX, 0.19);
    for (const [key, host] of [
      ['KeyY', containers.steeringOffset],
      ['KeyU', containers.maxRoadWheelSteer],
      ['KeyT', containers.steeringResponse],
    ]) {
      host.children.at(-1).click();
      assert.equal(ctl.handleKey(key), true);
      assert.equal(host.children[0].getAttribute('aria-pressed'), 'true');
    }
    const steering = structuredClone(v.steeringCalibration),
      tires = v.tireFrictionCalibration;
    recoverVehicle({ guide: p.guide, height: p.height, surfaces: p.surface }, v, { state: createRecoveryState(v) });
    assert.deepEqual(v.steeringCalibration, steering);
    assert.equal(v.tireFrictionCalibration, tires);
  }
});
