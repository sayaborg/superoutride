import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioLifecycle } from '../dist/browser/audio-lifecycle.js';
import { createAudioEngine } from '../dist/audio/audio-engine.js';
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
  assert.ok(context.moduleUrl.endsWith('/audio/noise-processor.js'));
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
  assert.equal(context.nodes.filter((n) => n.started).length, 5);
  engine.setVolume(0.3);
  engine.silenceRival();
  engine.dispose();
  engine.dispose();
  assert.ok(context.nodes.every((n) => n.disconnected));
  assert.ok(context.nodes.filter((n) => n.started).every((n) => n.stopped));
});

test('profile replacement fades the existing wave before changing its shape', (t) => {
  install(t);
  const context = new FakeAudioContext(),
    voice = createEngineVoice(context, context.destination);
  const state = createVehicleAudioObservation();
  voice.update(state, VEHICLE_CATALOG[0].sound);
  const oscillator = context.nodes.find((n) => n.started),
    first = oscillator.wave;
  voice.update(state, VEHICLE_CATALOG[1].sound);
  assert.equal(oscillator.wave, first);
  context.currentTime = 0.1;
  voice.update(state, VEHICLE_CATALOG[1].sound);
  assert.notEqual(oscillator.wave, first);
  voice.dispose();
});
