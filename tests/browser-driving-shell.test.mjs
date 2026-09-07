import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createBrowserDrivingShell } from '../dist/browser/driving-shell.js';
import { createM83LinearHighwayRuntime } from '../dist/dev/m8-3-linear-highway.js';
import { recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { vehicleCatalogEntryForId } from '../dist/vehicle/vehicle-catalog.js';

class Element {
  listeners = new Map();
  children = [];
  attributes = new Map();
  classList = { toggle() {}, add() {}, remove() {} };
  style = { setProperty() {} };
  addEventListener(name, listener) {
    const list = this.listeners.get(name) ?? [];
    list.push(listener);
    this.listeners.set(name, list);
  }
  emit(name, event = {}) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  replaceChildren(...children) { this.children = children; }
  appendChild(child) { this.children.push(child); }
}

test('shared shell routes real selector events to the replaced player and preserves calibration/policy', t => {
  const ids = ['game', 'steer-left-button', 'steer-right-button', 'throttle-button', 'brake-button',
    'vehicle-selector-buttons', 'camera-selector-buttons', 'steering-offset-selector-buttons',
    'max-steer-selector-buttons', 'steering-response-selector-buttons', 'tire-friction-selector-buttons'];
  const elements = new Map(ids.map(id => [id, new Element()]));
  const calls = [];
  const context = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) },
    { get: (obj, key) => obj[key] ?? ((...args) => calls.push([key, ...args])) });
  elements.get('game').getContext = () => context;
  const doc = new Element();
  doc.getElementById = id => elements.get(id) ?? null;
  doc.createElement = () => new Element();
  doc.documentElement = new Element();
  const win = new Element();
  win.innerWidth = 1200; win.innerHeight = 800;
  for (const [key, value] of Object.entries({ document: doc, window: win,
    navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }) })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  const course = createM83LinearHighwayRuntime();
  const runtime = { guide: course.guide, height: course.heightProfile, surfaces: course.surfaceMap };
  const shell = createBrowserDrivingShell(runtime, 0);
  const recover = () => recoverM5Vehicle(shell.recovery, runtime.guide, runtime.height,
    runtime.surfaces, shell.vehicle, 'manual');
  let replacements = 0, manualRecoveries = 0;
  shell.mountControls(profile => {
    recover();
    shell.replacePlayer(profile, runtime);
    replacements++;
  }, () => { manualRecoveries++; recover(); });
  const key = (code, repeat = false) => win.emit('keydown', { code, repeat, preventDefault() {} });
  key('KeyH'); key('KeyY'); key('KeyK');
  const previous = shell.vehicle;
  const tire = structuredClone(previous.tireFrictionCalibration);
  const steering = structuredClone(previous.steeringCalibration);
  elements.get('vehicle-selector-buttons').children.find(x => x.textContent === 'RC30').emit('click');
  assert.equal(replacements, 1);
  assert.notEqual(shell.vehicle, previous);
  assert.equal(shell.vehicle.profile.id, 'VFR750R');
  assert.deepEqual(shell.vehicle.torqueProtection, vehicleCatalogEntryForId('VFR750R').torqueProtection);
  assert.deepEqual(shell.vehicle.tireFrictionCalibration, tire);
  assert.deepEqual(shell.vehicle.steeringCalibration, steering);
  assert.equal(shell.vehicle.powertrain.engineTorqueMultiplier, 1.5);
  key('KeyK');
  assert.equal(shell.vehicle.powertrain.engineTorqueMultiplier, 2);
  assert.equal(previous.powertrain.engineTorqueMultiplier, 1.5);
  key('KeyK', true);
  assert.equal(shell.vehicle.powertrain.engineTorqueMultiplier, 2);
  key('KeyH');
  assert.notDeepEqual(shell.vehicle.tireFrictionCalibration, tire);
  assert.deepEqual(previous.tireFrictionCalibration, tire);
  key('KeyS'); assert.equal(replacements, 1, 'selecting the current identity is a no-op');
  key('KeyP'); assert.equal(shell.cameraRig.yawMode, 'MOVEMENT_FOLLOW');
  key('ArrowUp'); assert.equal(shell.inputManager.sample().throttle, true);
  key('ArrowDown'); assert.equal(shell.inputManager.sample().throttle, false);
  assert.equal(shell.inputManager.sample().brake, true);
  key('Backspace'); assert.equal(manualRecoveries, 1);
  shell.present('linear', shell.inputManager.sample(), { playerScreenX: 160, movementYaw: 0,
    yaw: 0, yawMode: shell.cameraRig.yawMode }, 190);
  assert.equal(calls.filter(x => x[0] === 'putImageData').length, 1);
  assert.ok(calls.some(x => x[0] === 'fillText'), 'HUD uses the same presentation path');
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
