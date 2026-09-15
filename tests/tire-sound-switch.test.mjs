import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactTireParameters,
  spectralTireParameters,
  TIRE_CONTACT_MAPPING,
  TIRE_CONTROL_RANGES,
  TIRE_SOUND_MODELS,
  TIRE_COMPONENTS,
  TIRE_COMPONENT_RANGE,
  TIRE_COMPONENT_FADE_SECONDS,
} from '../dist/audio/tire-sound-controls.js';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { SPECTRAL_INPUT_KEYS, SPECTRAL_SETTINGS } from '../dist/audio/tire-spectral-acoustics.js';
import { TireContactSynthesis } from '../dist/audio/tire-contact-model.js';
import { CONTACT_ACOUSTICS, CONTACT_INPUTS, CONTACT_TEXTURE_KEYS } from '../dist/audio/tire-contact-acoustics.js';
import { TireSynthesis } from '../dist/audio/tire-synthesis.js';
import { createTireVoice } from '../dist/audio/tire-voice.js';
import { createAudioEngine } from '../dist/audio/audio-engine.js';
import { AUDIO_TIMING } from '../dist/audio/audio-presentation.js';
import { createAudioLifecycle } from '../dist/browser/audio-lifecycle.js';
import { createVehicleAudioObservation, readVehicleAudio } from '../dist/browser/vehicle-audio.js';
import { observeVehicleTires, publishVehicleTireObservation } from '../dist/physics/vehicle-tire-observation.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { installBrowserDom } from './helpers/browser-dom.mjs';
import { FakeAudioContext, FakeAudioWorkletNode } from './helpers/audio-context.mjs';

const state = () => {
  const result = createVehicleAudioObservation();
  Object.assign(result.front, {
    load: 4000,
    referenceLoad: 4000,
    travelSpeed: 30,
    slipSpeed: 3,
    longitudinalPower: 12000,
    utilization: 1.1,
    surface: 'ASPHALT',
  });
  Object.assign(result.rear, { ...result.front, slipSpeed: 0, longitudinalPower: 0 });
  return result;
};
const world = () => {
  const runtime = createLinearHighwayRuntime();
  return { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
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
    t.after(() => (old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]));
  }
  return dom;
}
const params = () =>
  Object.fromEntries([
    ...TIRE_COMPONENTS.map(({ key }) => [`mix_${key}`, new Float32Array([TIRE_COMPONENT_RANGE.defaultValue])]),
    ...['front', 'rear'].flatMap((axle) =>
      Object.entries(TIRE_CONTROL_RANGES).map(([key, range]) => [
        `${axle}_${key}`,
        new Float32Array([range.defaultValue]),
      ]),
    ),
  ]);

async function processor(t) {
  let Processor;
  for (const [key, value] of Object.entries({
    AudioWorkletProcessor: class {
      port = {};
    },
    sampleRate: 48000,
    registerProcessor: (_name, ctor) => {
      Processor = ctor;
    },
  })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
    t.after(() => (old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]));
  }
  await import(`../dist/audio/tire-processor.js?test=${encodeURIComponent(t.name)}`);
  return Processor;
}

test('one bounded contact map preserves zero support, monotone slip and relative axle load', () => {
  const tire = state().front;
  assert.equal(contactTireParameters(tire).load, TIRE_CONTACT_MAPPING.referenceLoad);
  assert.deepEqual(contactTireParameters({ ...tire, load: 2000, referenceLoad: 2000 }), contactTireParameters(tire));
  let previous = -1;
  for (const slipSpeed of [0, 0.01, 0.1, 1, 5, 20, 100, 10000]) {
    const value = contactTireParameters({ ...tire, slipSpeed });
    assert.ok(value.slipSpeed >= previous && value.slipSpeed <= CONTACT_INPUTS.slipSpeed.max);
    previous = value.slipSpeed;
  }
  assert.equal(contactTireParameters({ ...tire, slipSpeed: 5 }).slipSpeed, 0.8);
  for (const surface of ['ASPHALT', 'SHOULDER', 'GRASS', 'DIRT', 'SAND', 'VOID']) {
    const input = Object.freeze({ ...tire, surface, load: 1e6, travelSpeed: 1000 });
    const value = contactTireParameters(input);
    for (const [key, number] of Object.entries(value)) {
      assert.ok(Number.isFinite(number));
      assert.ok(number >= TIRE_CONTROL_RANGES[key].minValue && number <= TIRE_CONTROL_RANGES[key].maxValue);
    }
  }
  assert.equal(contactTireParameters({ ...tire, load: 0 }).load, 0);
  assert.equal(contactTireParameters({ ...tire, surface: 'VOID' }).load, 0);
  for (const bad of [{ load: NaN }, { referenceLoad: 0 }, { travelSpeed: -1 }, { slipSpeed: Infinity }])
    assert.throws(() => contactTireParameters({ ...tire, ...bad }), RangeError);
});

test('travel observation retains sideways and reverse contact motion without wheel rotation', () => {
  const vehicle = {};
  const result = observeVehicleTires(vehicle);
  const contact = {
    forceTransmitting: true,
    tireFrameValid: true,
    longitudinalVelocity: 0,
    lateralVelocity: 12,
    surface: { surfaceType: 'ASPHALT' },
  };
  const wheel = { tire: { fx: 0, fy: 0, sx: 0, sy: -1, referenceSpeed: 12 } };
  publishVehicleTireObservation(vehicle, contact, wheel, { ...contact, longitudinalVelocity: -5 }, wheel);
  assert.equal(result.front.rollingSpeed, 0);
  assert.equal(result.front.travelSpeed, 12);
  assert.equal(result.rear.travelSpeed, 13);
  publishVehicleTireObservation(vehicle, { ...contact, forceTransmitting: false }, wheel, contact, wheel);
  assert.equal(result.front.travelSpeed, 0);
});

test('game contact mapping leaves complete physics untouched across all nine vehicles', () => {
  const w = world();
  for (const { profile } of VEHICLE_CATALOG) {
    const a = createArcadeVehicle(profile, w, { s: 45, initialSpeed: 25 });
    const b = createArcadeVehicle(profile, w, { s: 45, initialSpeed: 25 });
    const observed = createVehicleAudioObservation();
    readVehicleAudio(a, observed);
    for (let tick = 0; tick < 30; tick++) {
      const input = { steering: tick < 15 ? 0.4 : -0.4, throttle: tick < 15, brake: tick >= 15 };
      updateArcadeVehicle(w, a, input, 1 / 60);
      updateArcadeVehicle(w, b, input, 1 / 60);
      readVehicleAudio(a, observed);
      for (const axle of ['front', 'rear']) {
        const values = contactTireParameters(observed[axle]);
        assert.ok(observed[axle].referenceLoad > 0);
        assert.ok(Object.values(values).every(Number.isFinite));
      }
      assert.deepEqual(a, b);
    }
  }
});

test('tire voice fades before switching, cancels superseded requests, and does not recreate nodes', (t) => {
  install(t);
  const context = new FakeAudioContext();
  const voice = createTireVoice(context, context.destination);
  t.after(() => voice.dispose());
  const input = state();
  const snapshot = structuredClone(input);
  const node = context.nodes.find((n) => n.name === 'vehicle-tires');
  const output = node.connections[0];
  voice.update(input);
  assert.equal(node.messages.at(-1).model, 'current');
  const count = context.nodes.length;
  voice.setModel('contact');
  voice.update(input);
  assert.equal(output.gain.events.at(-1)[1], 0);
  assert.equal(node.messages.length, 1);
  context.currentTime = AUDIO_TIMING.transitionSeconds / 2;
  voice.setModel('current');
  voice.update(input);
  assert.equal(output.gain.events.at(-1)[1], 1);
  assert.equal(node.messages.length, 1);
  voice.setModel('contact');
  voice.update(input);
  context.currentTime += AUDIO_TIMING.transitionSeconds + 0.001;
  voice.update(input);
  assert.equal(node.messages.at(-1).model, 'contact');
  assert.equal(node.parameters.get('front_load').value, 5);
  assert.equal(node.parameters.get('rear_slipSpeed').value, 0);
  assert.equal(output.gain.events.at(-1)[1], 1);
  for (let i = 0; i < 1000; i++) {
    voice.setModel(i % 2 ? 'current' : 'contact');
    voice.update(input);
    context.currentTime += AUDIO_TIMING.transitionSeconds + 0.001;
    voice.update(input);
  }
  assert.equal(context.nodes.length, count);
  assert.deepEqual(input, snapshot);
  voice.dispose();
  voice.dispose();
  assert.equal(node.messages.at(-1), 'stop');
  assert.equal(node.onprocessorerror, null);
  assert.ok(context.nodes.every((n) => n.disconnected));
});

test('mode changes affect neither engine slot, exhaust settings nor worklet count', async (t) => {
  install(t);
  const context = new FakeAudioContext();
  const engine = await createAudioEngine(context);
  t.after(() => engine.dispose());
  const input = state();
  const sound = VEHICLE_CATALOG[0].sound;
  engine.update(input, sound);
  engine.updateRival(input, sound, 0.3, 0);
  const exhausts = context.nodes.filter((n) => n.name === 'exhaust-waveguide');
  const before = exhausts.map((n) => structuredClone(n.messages));
  const count = context.nodes.length;
  for (let i = 0; i < 60; i++) {
    engine.setTireModel(TIRE_SOUND_MODELS[i % TIRE_SOUND_MODELS.length]);
    engine.update(input, sound);
    context.currentTime += 0.1;
    engine.update(input, sound);
    engine.updateRival(input, sound, 0.3, 0);
  }
  assert.deepEqual(
    exhausts.map((n) => n.messages),
    before,
  );
  assert.equal(context.nodes.length, count);
  assert.equal(context.nodes.filter((n) => n instanceof FakeAudioWorkletNode).length, 3);
});

test('UI choice survives loading, mute, vehicle changes and retry; keyboard/listeners remain isolated', async (t) => {
  const dom = install(t);
  dom.elements.get('tire-sound-toggle').setAttribute('aria-pressed', 'false'); // Older cached HTML.
  let finish;
  FakeAudioContext.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const life = createAudioLifecycle();
  t.after(() => life.dispose());
  const button = dom.elements.get('tire-sound-toggle');
  assert.equal(button.textContent, 'TIRES: CURRENT');
  button.click();
  assert.equal(button.textContent, 'TIRES: CONTACT');
  assert.match(button.getAttribute('aria-label'), /CONTACT/);
  assert.equal(button.getAttribute('aria-pressed'), null, 'three-way cycle is not a boolean toggle');
  finish();
  await settle();
  const w = world();
  const player = createArcadeVehicle(VEHICLE_CATALOG[0].profile, w, { s: 45, initialSpeed: 20 });
  const before = JSON.stringify(player);
  const context = FakeAudioContext.instances[0];
  life.update(player, []);
  let node = context.nodes.find((n) => n.name === 'vehicle-tires');
  assert.equal(node.messages.at(-1).model, 'contact');
  life.update(createArcadeVehicle(VEHICLE_CATALOG[5].profile, w, { s: 45, initialSpeed: 20 }), []);
  assert.equal(node.messages.at(-1).model, 'contact');
  dom.elements.get('sound-toggle').click();
  button.click();
  life.update(player, []);
  assert.equal(node.messages.at(-1).model, 'contact');
  dom.elements.get('sound-toggle').click();
  await settle();
  life.update(player, []);
  context.currentTime += 0.1;
  life.update(player, []);
  assert.equal(node.messages.at(-1).model, 'spectral');
  node.onprocessorerror();
  assert.doesNotThrow(() => life.update(player, []));
  assert.equal(dom.elements.get('sound-toggle').textContent, 'SOUND RETRY');
  assert.equal(context.state, 'closed');
  FakeAudioContext.load = () => Promise.resolve();
  button.click();
  await settle();
  life.update(player, []);
  node = FakeAudioContext.instances[1].nodes.find((n) => n.name === 'vehicle-tires');
  assert.equal(node.messages.at(-1).model, 'current');
  assert.equal(JSON.stringify(player), before);
  let stopped = false;
  button.emit('keydown', {
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  life.dispose();
  assert.equal(button.listeners.get('click').length, 0);
  assert.equal(button.listeners.get('keydown').length, 0);
});

test('default worklet is exactly the current synthesis for identical k-rate inputs', async (t) => {
  const Processor = await processor(t);
  const p = params();
  p.front_squeal[0] = 0.7;
  p.rear_squeal[0] = 0.4;
  p.front_pitch[0] = 1000;
  p.rear_pitch[0] = 800;
  const node = new Processor();
  const front = new TireSynthesis(48000, CONTACT_ACOUSTICS.frontSeed),
    rear = new TireSynthesis(48000, CONTACT_ACOUSTICS.rearSeed);
  front.update({ squeal: p.front_squeal[0], pitch: p.front_pitch[0] });
  rear.update({ squeal: p.rear_squeal[0], pitch: p.rear_pitch[0] });
  const output = [[new Float32Array(48000)]];
  node.process([], output, p);
  const reference = Float32Array.from({ length: 48000 }, () => front.sample() + rear.sample());
  assert.deepEqual(output[0][0], reference);
});

test('contact worklet matches the shared kernel and is block-independent after repeated mode changes', async (t) => {
  const Processor = await processor(t);
  const p = params();
  for (const axle of ['front', 'rear']) {
    p[`${axle}_travelSpeed`][0] = 30;
    p[`${axle}_load`][0] = 5;
    p[`${axle}_slipSpeed`][0] = axle === 'front' ? 0.5 : 0.8;
  }
  const render = (chunks) => {
    const node = new Processor();
    node.port.onmessage({ data: { model: 'contact' } });
    const result = [];
    for (const size of chunks) {
      const out = [[new Float32Array(size)]];
      node.process([], out, p);
      result.push(...out[0][0]);
    }
    node.port.onmessage({ data: { model: 'current' } });
    node.port.onmessage({ data: { model: 'contact' } });
    const reset = [[new Float32Array(1024)]];
    node.process([], reset, p);
    assert.deepEqual([...reset[0][0]], result.slice(0, 1024));
    node.port.onmessage({ data: 'stop' });
    const stopped = [[new Float32Array(8).fill(1)]];
    assert.equal(node.process([], stopped, p), false);
    assert.ok(stopped[0][0].every((v) => v === 0));
    return result;
  };
  const actual = render([4096]);
  assert.deepEqual(actual, render([1, 127, 8, 2048, 1912]));
  const front = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.frontSeed);
  const rear = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.rearSeed);
  front.update(30, p.front_slipSpeed[0], 5);
  rear.update(30, p.rear_slipSpeed[0], 5);
  assert.deepEqual(actual, [
    ...Float32Array.from({ length: 4096 }, () => (front.sample() + rear.sample()) * CONTACT_ACOUSTICS.listeningGain),
  ]);
});

test('surface transitions preserve contact state, remain bounded and cannot retain airborne forcing', () => {
  for (const rate of [44100, 48000, 96000]) {
    const synth = new TireContactSynthesis(rate, 42);
    const roughness = synth.roadTexture,
      oscillator = synth.friction;
    let peak = 0;
    for (const surfaceIndex of [0, 3, 1, 4, 2, 0, 3]) {
      synth.update(50, 0.5, 8, surfaceIndex);
      for (let i = 0; i < rate / 4; i++) peak = Math.max(peak, Math.abs(synth.sample()));
      assert.equal(synth.roadTexture, roughness);
      assert.equal(synth.friction, oscillator);
    }
    assert.ok(Number.isFinite(peak) && peak < 2);
    synth.update(100, 4, 0);
    for (let i = 0; i < rate / 2; i++) synth.sample();
    assert.ok(Math.abs(synth.sample()) < 1e-8);
    for (const invalid of [NaN, -1, 0.5, CONTACT_TEXTURE_KEYS.length])
      assert.throws(() => synth.update(10, 0.5, 5, invalid), RangeError);
    assert.throws(() => oscillator.step(0.5, 5, 0, CONTACT_ACOUSTICS.friction.drop + 0.1), RangeError);
  }
});

test('material identities travel independently through the real voice and processor without frame messages', async (t) => {
  install(t);
  const context = new FakeAudioContext();
  const voice = createTireVoice(context, context.destination);
  t.after(() => voice.dispose());
  const input = state();
  input.front.surface = 'SAND';
  input.rear.surface = 'GRASS';
  voice.setModel('contact');
  voice.update(input);
  const worklet = context.nodes.find((node) => node.name === 'vehicle-tires');
  const p = params();
  for (const [key, param] of worklet.parameters) if (key in p) p[key][0] = param.value;
  assert.equal(p.front_surfaceIndex[0], CONTACT_TEXTURE_KEYS.indexOf('sand'));
  assert.equal(p.rear_surfaceIndex[0], CONTACT_TEXTURE_KEYS.indexOf('grass'));
  const Processor = await processor(t);
  const node = new Processor();
  node.port.onmessage({ data: { model: 'contact' } });
  const output = [[new Float32Array(4096)]];
  node.process([], output, p);
  const front = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.frontSeed);
  const rear = new TireContactSynthesis(48000, CONTACT_ACOUSTICS.rearSeed);
  for (const [axle, kernel] of [
    ['front', front],
    ['rear', rear],
  ])
    kernel.update(
      p[`${axle}_travelSpeed`][0],
      p[`${axle}_slipSpeed`][0],
      p[`${axle}_load`][0],
      p[`${axle}_surfaceIndex`][0],
    );
  assert.deepEqual(
    output[0][0],
    Float32Array.from({ length: 4096 }, () => (front.sample() + rear.sample()) * CONTACT_ACOUSTICS.listeningGain),
  );
  const messageCount = worklet.messages.length;
  for (const surface of ['DIRT', 'ASPHALT', 'SHOULDER']) {
    input.front.surface = surface;
    voice.update(input);
  }
  assert.equal(worklet.messages.length, messageCount);
  // A fractional or nonfinite identity is invalid, not a blend of unrelated surface indices.
  p.front_surfaceIndex[0] = 1.5;
  p.rear_surfaceIndex[0] = NaN;
  const silence = [[new Float32Array(24000)]];
  assert.doesNotThrow(() => node.process([], silence, p));
  assert.ok(silence[0][0].slice(-128).every((v) => Math.abs(v) < 1e-8));
});

test('spectral choice cancels/supersedes pending fades without resetting engines or the current default', (t) => {
  install(t);
  const context = new FakeAudioContext(),
    voice = createTireVoice(context, context.destination);
  t.after(() => voice.dispose());
  const observation = state();
  Object.assign(observation.front, {
    longitudinalVelocity: 25,
    lateralVelocity: 4,
    wheelSpeed: 25,
    wheelAngularSpeed: 25 / 0.3,
    lateralPower: 12000,
  });
  Object.assign(observation.rear, { ...observation.front, wheelSpeed: 40, surface: 'DIRT' });
  voice.update(observation);
  const node = context.nodes.find((n) => n.name === 'vehicle-tires');
  voice.setModel('contact');
  voice.update(observation);
  voice.setModel('spectral');
  voice.update(observation);
  voice.setModel('current');
  voice.update(observation);
  assert.deepEqual(node.messages, [{ model: 'current' }]);
  voice.setModel('spectral');
  voice.update(observation);
  assert.equal(node.messages.length, 1);
  context.currentTime += AUDIO_TIMING.transitionSeconds + 0.001;
  voice.update(observation);
  assert.equal(node.messages.at(-1).model, 'spectral');
  assert.equal(node.parameters.get('front_spectral_load').value, 4000);
  assert.equal(node.parameters.get('rear_spectral_wheelSpeed').value, 40);
  assert.equal(node.parameters.get('rear_spectral_surfaceIndex').value, 3);
  assert.throws(() => voice.setModel('unknown'), RangeError);
});

test('real spectral voice transport and worklet match two independent shared kernels and release invalid axles', async (t) => {
  install(t);
  const context = new FakeAudioContext(),
    voice = createTireVoice(context, context.destination);
  t.after(() => voice.dispose());
  const observation = state();
  Object.assign(observation.front, {
    longitudinalVelocity: 25,
    lateralVelocity: 4,
    wheelSpeed: 25,
    wheelAngularSpeed: 25 / 0.3,
    lateralPower: 12000,
  });
  Object.assign(observation.rear, { ...observation.front, wheelSpeed: 40, surface: 'DIRT' });
  voice.setModel('spectral');
  voice.update(observation);
  const worklet = context.nodes.find((n) => n.name === 'vehicle-tires'),
    p = params();
  for (const [key, param] of worklet.parameters) p[key][0] = param.value;
  const Processor = await processor(t);
  const render = (chunks) => {
    const node = new Processor();
    node.port.onmessage({ data: { model: 'spectral' } });
    const actual = [];
    for (const size of chunks) {
      const out = [[new Float32Array(size)]];
      node.process([], out, p);
      actual.push(...out[0][0]);
    }
    assert.equal(node.front, null);
    assert.equal(node.frontContact, null, 'inactive models do not process samples');
    return { node, actual };
  };
  const { node, actual } = render([4096]);
  assert.deepEqual(actual, render([1, 127, 1024, 33, 2911]).actual);
  const kernels = [new TireSpectralSynthesis(48000), new TireSpectralSynthesis(48000, SPECTRAL_SETTINGS.rearSeed)];
  for (const [i, axle] of ['front', 'rear'].entries()) {
    const value = spectralTireParameters(observation[axle]);
    for (const key of SPECTRAL_INPUT_KEYS) value[key] = p[`${axle}_spectral_${key}`][0];
    kernels[i].update(value, value.surfaceIndex);
  }
  assert.deepEqual(actual, [...Float32Array.from({ length: 4096 }, () => kernels[0].sample() + kernels[1].sample())]);
  p.front_spectral_surfaceIndex[0] = 0.5;
  p.rear_spectral_load[0] = NaN;
  const tail = [[new Float32Array(24000)]];
  assert.doesNotThrow(() => node.process([], tail, p));
  assert.ok(tail[0][0].slice(-128).every((v) => Math.abs(v) < 1e-8));
  p.front_spectral_surfaceIndex[0] = 0;
  p.rear_spectral_load[0] = 4000;
  const resumed = [[new Float32Array(4096)]];
  node.process([], resumed, p);
  assert.ok(resumed[0][0].some((v) => Math.abs(v) > 0.01));
  node.port.onmessage({ data: 'stop' });
  node.port.onmessage({ data: { model: 'current' } });
  assert.equal(node.frontSpectral, null);
  assert.equal(node.rearSpectral, null);
  assert.equal(node.process([], resumed, p), false);
  assert.ok(resumed[0][0].every((v) => v === 0));
});

test('R/S/Q choices survive load, mute, model changes and retry without altering engine slots', async (t) => {
  const dom = install(t);
  let complete;
  FakeAudioContext.load = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const life = createAudioLifecycle();
  t.after(() => life.dispose());
  const host = dom.elements.get('tire-component-controls');
  const [r, s, q] = host.children;
  assert.deepEqual(
    host.children.map((b) => b.textContent),
    ['R: ON', 'S: ON', 'Q: ON'],
  );
  assert.ok(host.children.every((b) => b.getAttribute('disabled') !== null));
  r.click(); // Non-spectral clicks must not change a setting, even in the minimal DOM host.
  assert.equal(r.textContent, 'R: ON');
  dom.elements.get('tire-sound-toggle').click();
  dom.elements.get('tire-sound-toggle').click();
  assert.ok(host.children.every((b) => b.getAttribute('disabled') === null));
  r.click();
  s.click();
  assert.equal(r.getAttribute('aria-pressed'), 'false');
  let stopped = false;
  q.emit('keydown', {
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  complete();
  await settle();
  let context = FakeAudioContext.instances[0];
  let node = context.nodes.find((n) => n.name === 'vehicle-tires');
  assert.equal(node.parameters.get('mix_road').value, 0);
  assert.equal(node.parameters.get('mix_scrub').value, 0);
  assert.equal(node.parameters.get('mix_squeal').value, 1);
  const count = context.nodes.length;
  const engines = context.nodes.filter((n) => n.name === 'exhaust-waveguide');
  assert.equal(engines.length, 2);
  const messages = engines.map((n) => n.messages.length);
  dom.elements.get('sound-toggle').click(); // Muted changes are retained.
  q.click();
  for (let i = 0; i < 3; i++) dom.elements.get('tire-sound-toggle').click();
  assert.equal(q.textContent, 'Q: OFF');
  assert.equal(context.nodes.length, count);
  assert.deepEqual(
    engines.map((n) => n.messages.length),
    messages,
  );
  dom.elements.get('sound-toggle').click();
  await settle();
  const player = createArcadeVehicle(VEHICLE_CATALOG[0].profile, world(), { initialSpeed: 20 });
  life.update(player, []);
  node.onprocessorerror();
  life.update(player, []);
  assert.equal(context.state, 'closed');
  FakeAudioContext.load = () => Promise.resolve();
  dom.elements.get('sound-toggle').click();
  await settle();
  life.update(player, []);
  context = FakeAudioContext.instances[1];
  node = context.nodes.find((n) => n.name === 'vehicle-tires');
  for (const { key } of TIRE_COMPONENTS) assert.equal(node.parameters.get(`mix_${key}`).value, 0);
  life.dispose();
  assert.equal(host.children.length, 0);
  for (const b of [r, s, q]) {
    assert.equal(b.listeners.get('click').length, 0);
    assert.equal(b.listeners.get('keydown').length, 0);
  }
});

test('component output fade is block-independent, does not reset bands, normalize other taps or alter CURRENT', async (t) => {
  const Processor = await processor(t);
  const p = params();
  const value = {
    longitudinalVelocity: 25,
    lateralVelocity: 4,
    wheelSpeed: 25,
    wheelAngularSpeed: 25 / 0.3,
    load: 4000,
    longitudinalPower: 0,
    lateralPower: 12000,
    demand: 1.5,
  };
  for (const axle of ['front', 'rear'])
    for (const key of SPECTRAL_INPUT_KEYS) p[`${axle}_spectral_${key}`][0] = value[key];
  const a = new Processor(),
    b = new Processor();
  for (const n of [a, b]) n.port.onmessage({ data: { model: 'spectral' } });
  const block = (n, size) => {
    const out = [[new Float32Array(size)]];
    n.process([], out, p);
    return out[0][0];
  };
  assert.deepEqual(block(a, 8192), block(b, 8192));
  const front = a.frontSpectral;
  for (const bits of [
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
    [0, 0, 0],
    [1, 1, 1],
  ]) {
    TIRE_COMPONENTS.forEach(({ key }, i) => {
      p[`mix_${key}`][0] = bits[i];
    });
    const expected = block(a, 12000);
    const actual = new Float32Array(12000);
    let offset = 0;
    for (const size of [1, 127, 512, 345, 11015]) {
      actual.set(block(b, size), offset);
      offset += size;
    }
    assert.deepEqual(actual, expected);
    assert.equal(a.frontSpectral, front);
    assert.deepEqual(a.frontSpectral, b.frontSpectral, 'solo never changes sample history');
    assert.ok(Math.abs(a.roadMix - bits[0]) < 1e-12);
    if (bits.every((v) => v === 0)) assert.ok(expected.slice(-128).every((v) => Math.abs(v) < 1e-12));
    const f = a.frontSpectral,
      r = a.rearSpectral;
    const final =
      f.scrubOutput * bits[1] +
      f.squealOutput * bits[2] +
      f.roadOutput * bits[0] +
      (r.scrubOutput * bits[1] + r.squealOutput * bits[2] + r.roadOutput * bits[0]);
    assert.ok(Math.abs(expected.at(-1) - final) < 1e-7, 'no solo loudness compensation');
  }
  // First sample after a switch follows the declared constant, not an instantaneous cut.
  p.mix_road[0] = 0;
  block(a, 1);
  assert.ok(Math.abs(a.roadMix - Math.exp(-1 / (48000 * TIRE_COMPONENT_FADE_SECONDS))) < 1e-12);
  p.mix_scrub[0] = NaN;
  block(a, 12000);
  assert.ok(a.scrubMix < 1e-12);
  const currentA = new Processor(),
    currentB = new Processor();
  p.front_squeal[0] = 0.6;
  p.rear_squeal[0] = 0.4;
  for (const { key } of TIRE_COMPONENTS) p[`mix_${key}`][0] = 0;
  const original = block(currentA, 8192);
  for (const { key } of TIRE_COMPONENTS) p[`mix_${key}`][0] = 1;
  assert.deepEqual(original, block(currentB, 8192));
});
