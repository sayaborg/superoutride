import assert from 'node:assert/strict';
import test from 'node:test';
import { follow } from '../dist/audio/audio-parameter.js';
import { AUDIO_TIMING, RIVAL_AUDIBLE_METERS, rivalAudioGain, rivalAudioPan } from '../dist/audio/audio-presentation.js';
import {
  DEFAULT_EXHAUST_TUNING,
  EXHAUST_TUNING_RANGES,
  resolveExhaustTuning,
} from '../dist/audio/exhaust-acoustics.js';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { createEngineVoice } from '../dist/audio/engine-voice.js';
import { createAudioLifecycle } from '../dist/browser/audio-lifecycle.js';
import { createBrowserDrivingShell } from '../dist/browser/driving-shell.js';
import { createVehicleAudioObservation } from '../dist/browser/vehicle-audio.js';
import { createArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { installBrowserDom } from './helpers/browser-dom.mjs';
import { FakeAudioContext, FakeAudioWorkletNode, FakeAudioParam } from './helpers/audio-context.mjs';

function replace(t, object, key, value) {
  const original = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(object, key, original);
    else delete object[key];
  });
}
function install(t) {
  const dom = installBrowserDom(t);
  FakeAudioContext.instances = [];
  FakeAudioContext.load = () => Promise.resolve();
  FakeAudioContext.failResume = false;
  replace(t, globalThis, 'AudioContext', FakeAudioContext);
  replace(t, globalThis, 'AudioWorkletNode', FakeAudioWorkletNode);
  replace(t, globalThis, 'cancelAnimationFrame', () => {});
  return dom;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const world = () => {
  const runtime = createLinearHighwayRuntime();
  return { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
};

test('AudioParam fallback holds the evaluated value before cancellation and detects support once', () => {
  let detections = 0;
  const events = [];
  const param = {
    value: 0.37,
    get cancelAndHoldAtTime() {
      detections++;
      return undefined;
    },
    cancelScheduledValues(time) {
      events.push(['cancel', time]);
      this.value = 0.9; // cancellation must not become the held value
    },
    setValueAtTime(value, time) {
      events.push(['set', value, time]);
      this.value = value;
    },
    setTargetAtTime(value, time, tau) {
      events.push(['target', value, time, tau]);
    },
  };
  follow(param, 1, 2);
  assert.deepEqual(events, [
    ['cancel', 2],
    ['set', 0.37, 2],
    ['target', 1, 2, AUDIO_TIMING.controlSeconds],
  ]);
  follow(param, 0, 3);
  assert.equal(detections, 1);
  assert.equal(param.value, 0.37);
});

test('AudioParam native hold keeps the native path and explicit time constant', () => {
  const events = [];
  const param = {
    cancelAndHoldAtTime(time) {
      assert.equal(this, param);
      events.push(['hold', time]);
    },
    setTargetAtTime(...args) {
      events.push(['target', ...args]);
    },
  };
  follow(param, 0.4, 2, 0.06);
  assert.deepEqual(events, [
    ['hold', 2],
    ['target', 0.4, 2, 0.06],
  ]);
});

test('shared ranges preserve kernel domains and reject nonfinite or out-of-domain tuning', () => {
  for (const [key, range] of Object.entries(EXHAUST_TUNING_RANGES)) {
    const low = range.exclusiveMin ? range.min + range.step / 10 : range.min;
    for (const value of [low, range.max, range.uiMin ?? low, range.uiMax ?? range.max]) {
      const model = new ExhaustWaveguide(VEHICLE_CATALOG[0].sound, 48000, { [key]: value });
      assert.ok(Number.isFinite(model.sample(4000, 1)));
    }
    for (const value of [NaN, Infinity, -Infinity, range.min - range.step, range.max + range.step]) {
      assert.throws(() => new ExhaustWaveguide(VEHICLE_CATALOG[0].sound, 48000, { [key]: value }), RangeError);
    }
    if (range.exclusiveMin) assert.throws(() => resolveExhaustTuning({ [key]: range.min }), RangeError);
    assert.equal(Object.isFrozen(range), true);
  }
  assert.deepEqual(resolveExhaustTuning({ pulseRiseMs: undefined }), DEFAULT_EXHAUST_TUNING);
  assert.doesNotThrow(() =>
    resolveExhaustTuning({ returnCutoffHz: 100, attenuationPerMeter: 1, closedExcitation: 0.001 }),
  );
  const override = { pulseRiseMs: 1 };
  const result = resolveExhaustTuning(override);
  override.pulseRiseMs = 2;
  assert.equal(result.pulseRiseMs, 1);
  assert.equal(Object.isFrozen(result), true);
});

test('value-based tuning preserves no-op, supersession and return-to-active fade behavior', (t) => {
  install(t);
  const context = new FakeAudioContext();
  const voice = createEngineVoice(context, context.destination);
  t.after(() => voice.dispose());
  const state = createVehicleAudioObservation();
  const sound = VEHICLE_CATALOG[0].sound;
  const node = context.nodes.find((candidate) => candidate.name === 'exhaust-waveguide');
  voice.update(state, sound);
  voice.setTuning({ ...DEFAULT_EXHAUST_TUNING });
  voice.update(state, sound);
  assert.equal(node.messages.length, 1);
  voice.setTuning({ ...DEFAULT_EXHAUST_TUNING, outputCutoffHz: 2000 });
  voice.update(state, sound);
  context.currentTime = AUDIO_TIMING.transitionSeconds / 2;
  voice.setTuning({ ...DEFAULT_EXHAUST_TUNING });
  voice.update(state, sound);
  context.currentTime = 1;
  voice.update(state, sound);
  assert.equal(node.messages.length, 1);
  voice.setTuning({ ...DEFAULT_EXHAUST_TUNING, outputCutoffHz: 1000 });
  voice.update(state, sound);
  context.currentTime += AUDIO_TIMING.transitionSeconds + 0.001;
  voice.update(state, sound);
  assert.equal(node.messages.length, 2);
  assert.equal(node.messages.at(-1).tuning.outputCutoffHz, 1000);
});

test('an audio update and cleanup fault cannot stop canvas frames or corrupt a later retry', async (t) => {
  let shell;
  t.after(() => shell?.dispose());
  const dom = install(t);
  shell = createBrowserDrivingShell(world(), 0);
  const before = JSON.stringify(shell.vehicle);
  const camera = { playerScreenX: 160, movementYaw: 0, yaw: 0, yawMode: 'BODY_FIXED' };
  const input = { steering: 0, throttle: 0, brake: 0 };
  shell.start(
    () => {},
    () => shell.present('linear', input, camera, 190),
  );
  dom.win.emit('pointerdown');
  await settle();
  dom.frame(0); // configure the profile before injecting a parameter failure
  const failedContext = FakeAudioContext.instances[0];
  const exhaust = failedContext.nodes.find((node) => node.name === 'exhaust-waveguide');
  exhaust.parameters.get('rpm').setTargetAtTime = () => {
    throw new Error('audio automation failed');
  };
  exhaust.port.postMessage = () => {
    throw new Error('audio port also failed');
  };
  assert.doesNotThrow(() => dom.frame(20));
  assert.doesNotThrow(() => dom.frame(40));
  assert.equal(dom.calls.filter(([name]) => name === 'putImageData').length, 3);
  assert.equal(failedContext.state, 'closed');
  assert.equal(dom.elements.get('sound-toggle').textContent, 'SOUND RETRY');
  assert.equal(JSON.stringify(shell.vehicle), before);
  dom.elements.get('sound-toggle').click();
  await settle();
  assert.equal(FakeAudioContext.instances.length, 2);
  assert.equal(FakeAudioContext.instances[1].state, 'running');
  dom.frame(60);
  assert.equal(dom.calls.filter(([name]) => name === 'putImageData').length, 4);
  assert.equal(dom.elements.get('sound-toggle').textContent, 'SOUND ON');
});

test('the complete audio graph starts and updates without native cancelAndHoldAtTime', async (t) => {
  let lifecycle;
  t.after(() => lifecycle?.dispose());
  const dom = install(t);
  replace(t, FakeAudioParam.prototype, 'cancelAndHoldAtTime', undefined);
  replace(t, FakeAudioParam.prototype, 'cancelScheduledValues', function (time) {
    this.events.push(['cancel', time]);
  });
  replace(t, FakeAudioParam.prototype, 'setValueAtTime', function (value, time) {
    this.value = value;
    this.events.push(['set', value, time]);
  });
  lifecycle = createAudioLifecycle();
  dom.win.emit('pointerdown');
  await settle();
  const context = FakeAudioContext.instances[0];
  const vehicle = createArcadeVehicle(VEHICLE_CATALOG[0].profile, world());
  for (let i = 0; i < 10; i++) {
    context.currentTime += 1 / 60;
    lifecycle.update(vehicle, []);
  }
  assert.equal(context.state, 'running');
  const rpm = context.nodes.find((node) => node.name === 'exhaust-waveguide').parameters.get('rpm');
  assert.equal(rpm.events.filter(([kind]) => kind === 'cancel').length, 10);
  assert.equal(rpm.events.filter(([kind]) => kind === 'target').length, 10);
  assert.equal(dom.elements.get('sound-toggle').textContent, 'SOUND ON');
});

test('a retired pending resume cannot tear down a successful retry', async (t) => {
  let lifecycle;
  t.after(() => lifecycle?.dispose());
  const dom = install(t);
  let rejectOldResume;
  replace(t, FakeAudioContext.prototype, 'resume', function () {
    this.state = 'running';
    if (FakeAudioContext.instances.length === 1)
      return new Promise((resolve, reject) => {
        rejectOldResume = reject;
      });
    return Promise.resolve();
  });
  lifecycle = createAudioLifecycle();
  dom.win.emit('pointerdown');
  await settle();
  const old = FakeAudioContext.instances[0];
  old.nodes.find((node) => node.name === 'exhaust-waveguide').port.postMessage = () => {
    throw new Error('retire this graph before its resume completes');
  };
  const vehicle = createArcadeVehicle(VEHICLE_CATALOG[0].profile, world());
  lifecycle.update(vehicle, []);
  assert.equal(old.state, 'closed');
  dom.elements.get('sound-toggle').click();
  await settle();
  const current = FakeAudioContext.instances[1];
  assert.equal(current.state, 'running');
  rejectOldResume(new Error('late rejection'));
  await settle();
  assert.equal(current.state, 'running');
  lifecycle.update(vehicle, []);
  assert.equal(current.state, 'running');
});

test('rival policy retains the physical-distance gain and yaw-frame pan without raster depth', () => {
  assert.equal(rivalAudioGain(0), 0.6);
  assert.equal(rivalAudioGain(RIVAL_AUDIBLE_METERS), 0);
  assert.equal(rivalAudioGain(RIVAL_AUDIBLE_METERS + 1), 0);
  assert.ok(rivalAudioGain(12) < rivalAudioGain(6));
  assert.equal(rivalAudioPan(0, 1), 0);
  assert.equal(rivalAudioPan(12, 12), 1);
  assert.equal(rivalAudioPan(-12, 12), -1);
});
