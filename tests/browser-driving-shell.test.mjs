import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBrowserDrivingShell } from '../dist/browser/driving-shell.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { recoverVehicle } from '../dist/gameplay/recovery.js';
import { vehicleCatalogEntryForId } from '../dist/vehicle/vehicle-catalog.js';

import { installBrowserDom } from './helpers/browser-dom.mjs';

test('shared shell routes real selector events to the replaced player and preserves calibration/policy', (t) => {
  const { elements, calls, win } = installBrowserDom(t);
  const course = createLinearHighwayRuntime();
  const runtime = { guide: course.guide, height: course.heightProfile, surfaces: course.surfaceMap };
  const shell = createBrowserDrivingShell(runtime, 0);
  const recover = () =>
    recoverVehicle({ guide: runtime.guide, height: runtime.height, surfaces: runtime.surfaces }, shell.vehicle, {
      state: shell.recovery,
      reason: 'manual',
    });
  let replacements = 0,
    manualRecoveries = 0;
  shell.mountControls(
    (profile) => {
      recover();
      shell.replacePlayer(profile, runtime);
      replacements++;
    },
    () => {
      manualRecoveries++;
      recover();
    },
  );
  const key = (code, repeat = false) => win.emit('keydown', { code, repeat, preventDefault() {} });
  key('KeyH');
  key('KeyY');
  const fixedPower = structuredClone(shell.vehicle.powertrain);
  key('KeyK');
  assert.deepEqual(shell.vehicle.powertrain, fixedPower);
  assert.equal(elements.get('tire-friction-selector-buttons').children.length, 5);
  const previous = shell.vehicle;
  const tire = structuredClone(previous.tireFrictionCalibration);
  const steering = structuredClone(previous.steeringCalibration);
  elements
    .get('vehicle-selector-buttons')
    .children.find((x) => x.textContent === 'RC30')
    .emit('click');
  assert.equal(replacements, 1);
  assert.notEqual(shell.vehicle, previous);
  assert.equal(shell.vehicle.profile.id, 'VFR750R');
  assert.deepEqual(shell.vehicle.torqueProtection, vehicleCatalogEntryForId('VFR750R').torqueProtection);
  assert.deepEqual(shell.vehicle.tireFrictionCalibration, tire);
  assert.deepEqual(shell.vehicle.steeringCalibration, steering);
  assert.equal('engineTorqueMultiplier' in shell.vehicle.powertrain, false);
  const replacementPower = structuredClone(shell.vehicle.powertrain);
  key('KeyK');
  key('KeyK', true);
  assert.deepEqual(shell.vehicle.powertrain, replacementPower);
  key('KeyH');
  assert.notDeepEqual(shell.vehicle.tireFrictionCalibration, tire);
  assert.deepEqual(previous.tireFrictionCalibration, tire);
  key('KeyS');
  assert.equal(replacements, 1, 'selecting the current identity is a no-op');
  key('KeyP');
  assert.equal(shell.cameraRig.yawMode, 'MOVEMENT_FOLLOW');
  key('ArrowUp');
  assert.equal(shell.inputManager.sample().throttle, true);
  key('ArrowDown');
  assert.equal(shell.inputManager.sample().throttle, false);
  assert.equal(shell.inputManager.sample().brake, true);
  key('Backspace');
  assert.equal(manualRecoveries, 1);
  shell.present(
    'linear',
    shell.inputManager.sample(),
    { playerScreenX: 160, movementYaw: 0, yaw: 0, yawMode: shell.cameraRig.yawMode },
    190,
  );
  assert.equal(calls.filter((x) => x[0] === 'putImageData').length, 1);
  assert.ok(
    calls.some((x) => x[0] === 'fillText'),
    'HUD uses the same presentation path',
  );
  assert.equal(elements.get('game').width, 320);
  assert.equal(elements.get('game').height, 240);
});

test('all topology roots use one player shell without moving topology/DEV authority into it', async () => {
  const shell = await readFile(new URL('../src/browser/driving-shell.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /from ['"].*(?:dev\/|route-dag|circuit-race|field-route|live-route)/);
  assert.match(shell, /drawVehicleDebugHud\(/);
  for (const file of ['main.ts', 'main-linear.ts', 'main-circuit.ts']) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /createBrowserDrivingShell\(/);
    assert.match(source, /shell\.mountControls\(/);
    assert.match(source, /shell\.replacePlayer\(/);
    assert.match(source, /shell\.present\(/);
    assert.doesNotMatch(source, /new InputManager|mountBrowserTireFrictionControls|let vehicle:/);
  }
});
