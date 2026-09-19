import assert from 'node:assert/strict';

import test from 'node:test';
import { createBrowserDrivingShell } from '../../dist/browser/driving-shell.js';
import { createStraightReferenceWorld, STRAIGHT_RECOVERY_PROFILE } from '../../dist/dev/fixtures/straight-world.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../dist/camera/current-camera-profile.js';
import { vehicleCatalogEntryForId } from '../../dist/vehicle/vehicle-catalog.js';

import { installBrowserDom } from '../helpers/browser-dom.mjs';

test('shared shell routes real selector events to the replaced player and preserves calibration/policy', (t) => {
  const { elements, calls, win } = installBrowserDom(t);
  const course = createStraightReferenceWorld();
  const runtime = { guide: course.guide, height: course.heightProfile, surfaces: course.surfaceMap };
  const shell = createBrowserDrivingShell(runtime, 0);
  let resyncs = 0;
  const order = [];
  const lifecycle = shell.mountControls({
    world: () => {
      order.push('world');
      return runtime;
    },
    recoveryProfile: STRAIGHT_RECOVERY_PROFILE,
    resync: () => {
      assert.equal(shell.cameraRig.initialized, false, 'camera reset precedes observer resync');
      order.push('resync');
      resyncs++;
    },
  });
  order.length = 0;
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
  assert.equal(resyncs, 1);
  assert.deepEqual(order, ['world', 'resync', 'world']);
  assert.deepEqual(
    lifecycle.camera,
    updateCamera(createCameraRig(), runtime, shell.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60),
  );
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
  assert.equal(resyncs, 1, 'selecting the current identity is a no-op');
  key('KeyP');
  assert.equal(shell.cameraRig.yawMode, 'MOVEMENT_FOLLOW');
  key('ArrowUp');
  assert.equal(shell.inputManager.sample().throttle, true);
  key('ArrowDown');
  assert.equal(shell.inputManager.sample().throttle, false);
  assert.equal(shell.inputManager.sample().brake, true);
  key('Backspace');
  assert.equal(resyncs, 2);
  assert.deepEqual(
    lifecycle.camera,
    updateCamera(createCameraRig(shell.cameraRig.yawMode), runtime, shell.vehicle, CURRENT_CAMERA_PROFILE, 1 / 60),
  );
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
