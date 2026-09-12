import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioLifecycle } from '../dist/browser/audio-lifecycle.js';
import { createAudioEngine } from '../dist/audio/audio-engine.js';
import { createTireVoice } from '../dist/dev/diagnostics/tire-voice.js';
import { createArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { createEngineVoice } from '../dist/audio/engine-voice.js';
import { createVehicleAudioObservation } from '../dist/browser/vehicle-audio.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { installBrowserDom } from './helpers/browser-dom.mjs';
import { FakeAudioContext, FakeAudioWorkletNode } from './helpers/audio-context.mjs';

function install(t) {
  const dom = installBrowserDom(t);
  FakeAudioContext.instances = [];
  FakeAudioContext.load = () => Promise.resolve();
  FakeAudioContext.failResume = false;
  for (const [key, value] of Object.entries({
    AudioContext: FakeAudioContext,
    AudioWorkletNode: FakeAudioWorkletNode,
  })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (old) Object.defineProperty(globalThis, key, old);
      else delete globalThis[key];
    });
  }
  return dom;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('gesture initialization is single-flight and hidden/muted state wins over delayed worklet loading', async (t) => {
  let lifecycle;
  t.after(() => lifecycle?.dispose());
  const dom = install(t);
  let finish;
  FakeAudioContext.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  lifecycle = createAudioLifecycle();
  assert.equal(FakeAudioContext.instances.length, 0);
  dom.win.emit('pointerdown');
  dom.win.emit('keydown');
  assert.equal(FakeAudioContext.instances.length, 1);
  document.hidden = true;
  document.emit('visibilitychange');
  dom.elements.get('sound-toggle').click();
  finish();
  await settle();
  const context = FakeAudioContext.instances[0];
  assert.equal(context.state, 'suspended');
  document.hidden = false;
  document.emit('visibilitychange');
  await settle();
  assert.equal(context.state, 'suspended');
  dom.elements.get('sound-toggle').click();
  await settle();
  assert.equal(context.state, 'running');
  lifecycle.setActive(false);
  await settle();
  assert.equal(context.state, 'suspended');
  lifecycle.setActive(true);
  await settle();
  assert.equal(context.state, 'running');
  assert.ok(context.moduleUrl.endsWith('/audio/exhaust-processor.js'));
});

test('dispose during module loading closes late nodes and removes gesture listeners', async (t) => {
  let lifecycle;
  t.after(() => lifecycle?.dispose());
  const dom = install(t);
  let finish;
  FakeAudioContext.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  lifecycle = createAudioLifecycle();
  dom.win.emit('pointerdown');
  lifecycle.dispose();
  finish();
  await settle();
  const context = FakeAudioContext.instances[0];
  assert.equal(context.state, 'closed');
  assert.ok(context.nodes.every((node) => node.disconnected));
  dom.win.emit('pointerdown');
  assert.equal(FakeAudioContext.instances.length, 1);
  lifecycle.dispose();
});

test('failed resume cleans constructed graph and retries on a later gesture', async (t) => {
  let lifecycle;
  t.after(() => lifecycle?.dispose());
  const dom = install(t);
  FakeAudioContext.failResume = true;
  lifecycle = createAudioLifecycle();
  dom.win.emit('pointerdown');
  await settle();
  assert.equal(FakeAudioContext.instances[0].state, 'closed');
  assert.ok(FakeAudioContext.instances[0].nodes.every((node) => node.disconnected));
  FakeAudioContext.failResume = false;
  dom.elements.get('sound-toggle').click();
  await settle();
  assert.equal(FakeAudioContext.instances.length, 2);
  assert.equal(FakeAudioContext.instances[1].state, 'running');
});

test('engine graph has bounded nodes across thousands of updates and nine profiles', async (t) => {
  install(t);
  const context = new FakeAudioContext(),
    engine = await createAudioEngine(context);
  const count = context.nodes.length,
    state = createVehicleAudioObservation();
  for (let i = 0; i < 2000; i++) {
    context.currentTime += 1 / 60;
    const sound = VEHICLE_CATALOG[Math.floor(i / 100) % 9].sound;
    engine.update(state, sound);
    engine.updateRival(state, sound, 0.3, 0.5);
  }
  assert.equal(context.nodes.length, count);
  assert.equal(context.nodes.filter((n) => n.started).length, 0);
  assert.equal(context.nodes.filter((n) => n instanceof FakeAudioWorkletNode).length, 2);
  engine.setVolume(0.3);
  engine.silenceRival();
  engine.dispose();
  engine.dispose();
  assert.ok(context.nodes.every((n) => n.disconnected));
  assert.ok(context.nodes.filter((n) => n.started).every((n) => n.stopped));
});

test('exhaust topology changes fade before replacement and disposal releases its DSP state', (t) => {
  install(t);
  const context = new FakeAudioContext(),
    voice = createEngineVoice(context, context.destination);
  const state = createVehicleAudioObservation();
  const worklet = context.nodes.find((n) => n instanceof FakeAudioWorkletNode);
  voice.update(state, VEHICLE_CATALOG[3].sound);
  assert.equal(worklet.messages.length, 1);
  voice.update(state, VEHICLE_CATALOG[2].sound);
  assert.equal(worklet.messages.length, 1);
  context.currentTime = 0.1;
  voice.update(state, VEHICLE_CATALOG[2].sound);
  assert.equal(worklet.messages.at(-1).profile, VEHICLE_CATALOG[2].sound);
  voice.dispose();
  assert.equal(worklet.messages.at(-1), 'stop');
});

test('engine voice reads one excitation proxy, clamps RPM and never modifies observations', (t) => {
  install(t);
  const context = new FakeAudioContext(),
    voice = createEngineVoice(context, context.destination);
  const state = { ...createVehicleAudioObservation(), rpm: 0, drive: 0.4, throttle: 1 };
  const before = structuredClone(state);
  voice.update(state, VEHICLE_CATALOG[0].sound);
  assert.deepEqual(state, before);
  const worklet = context.nodes.find((n) => n instanceof FakeAudioWorkletNode);
  assert.equal(worklet.parameters.get('rpm').value, state.idleRpm);
  assert.equal(worklet.parameters.get('load').value, state.drive);
  voice.update({ ...state, rpm: state.redlineRpm * 2, throttle: 1, drive: 0 }, VEHICLE_CATALOG[0].sound);
  assert.equal(worklet.parameters.get('rpm').value, state.redlineRpm);
  assert.equal(worklet.parameters.get('load').value, 0);
  assert.equal(context.nodes.filter((n) => n.started).length, 0);
  voice.dispose();
});

test('selected coupling and tuning survive voice profile replacement without node duplication', (t) => {
  install(t);
  for (const coupled of [false, true]) {
    const context = new FakeAudioContext();
    const tuning = { outletReflection: -0.8 };
    const voice = createEngineVoice(context, context.destination, { coupled, tuning });
    const count = context.nodes.length;
    tuning.outletReflection = 0;
    const worklet = context.nodes.find((node) => node instanceof FakeAudioWorkletNode);
    const state = createVehicleAudioObservation();
    voice.update(state, VEHICLE_CATALOG[0].sound);
    voice.update(state, VEHICLE_CATALOG[1].sound);
    context.currentTime = 0.1;
    voice.update(state, VEHICLE_CATALOG[1].sound);
    assert.equal(worklet.messages.length, 2);
    for (const message of worklet.messages) {
      assert.equal(message.coupled, coupled);
      assert.deepEqual(message.tuning, { outletReflection: -0.8 });
    }
    assert.equal(context.nodes.length, count);
    voice.dispose();
  }
});

test('method changes fade both fixed engine slots and a superseded choice cannot replace the current one', async (t) => {
  install(t);
  const context = new FakeAudioContext();
  const engine = await createAudioEngine(context);
  const state = createVehicleAudioObservation();
  const sound = VEHICLE_CATALOG[0].sound;
  const update = () => {
    engine.update(state, sound);
    engine.updateRival(state, sound, 0.5, 0.2);
  };
  const nodes = context.nodes.length;
  update();
  const worklets = context.nodes.filter((node) => node instanceof FakeAudioWorkletNode);
  engine.setCoupled(false);
  update();
  assert.ok(worklets.every((node) => node.messages.length === 1));
  context.currentTime = 0.1;
  update();
  assert.ok(worklets.every((node) => node.messages.length === 2 && node.messages.at(-1).coupled === false));
  engine.setCoupled(true);
  update();
  engine.setCoupled(false);
  update();
  context.currentTime = 1;
  update();
  assert.ok(worklets.every((node) => node.messages.length === 2));
  assert.equal(context.nodes.length, nodes);
  engine.dispose();
});

test('game selector honors late loading and muted changes while preserving vehicle state and cleanup', async (t) => {
  const dom = install(t);
  const method = dom.elements.get('sound-method');
  method.value = 'reflection';
  let finish;
  FakeAudioContext.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const lifecycle = createAudioLifecycle();
  t.after(() => lifecycle.dispose());
  dom.win.emit('pointerdown');
  method.value = 'waveguide';
  method.emit('change');
  finish();
  await settle();
  const runtime = createLinearHighwayRuntime();
  const player = createArcadeVehicle(VEHICLE_CATALOG[3].profile, {
    guide: runtime.guide,
    height: runtime.heightProfile,
    surfaces: runtime.surfaceMap,
  });
  const before = JSON.stringify(player);
  const context = FakeAudioContext.instances[0];
  lifecycle.update(player, []);
  const worklets = context.nodes.filter((node) => node instanceof FakeAudioWorkletNode);
  assert.equal(worklets.length, 2);
  assert.equal(worklets[0].messages.at(-1).coupled, true);
  const count = context.nodes.length;
  dom.elements.get('sound-toggle').click();
  method.value = 'reflection';
  method.emit('change');
  lifecycle.update(player, []);
  assert.equal(worklets[0].messages.length, 1);
  dom.elements.get('sound-toggle').click();
  await settle();
  lifecycle.update(player, []);
  context.currentTime = 0.1;
  lifecycle.update(player, []);
  assert.equal(worklets[0].messages.at(-1).coupled, false);
  assert.equal(context.nodes.length, count);
  assert.equal(JSON.stringify(player), before);
  let stopped = false;
  method.emit('keydown', {
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  lifecycle.dispose();
  assert.equal(method.listeners.get('change').length, 0);
  assert.equal(method.listeners.get('keydown').length, 0);
});

test('deferred tire prototype owns and releases its own nodes independently', () => {
  const context = new FakeAudioContext();
  const noise = context.createGain();
  const voice = createTireVoice(context, noise, context.destination);
  voice.update(createVehicleAudioObservation());
  const tone = context.nodes.find((node) => node.started);
  assert.ok(tone);
  voice.dispose();
  assert.equal(tone.stopped, true);
  assert.ok(context.nodes.filter((node) => node !== noise).every((node) => node.disconnected));
});
