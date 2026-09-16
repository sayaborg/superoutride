import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioLifecycle } from '../dist/browser/audio-lifecycle.js';
import { DEFAULT_EXHAUST_TUNING } from '../dist/audio/exhaust-acoustics.js';
import { createAudioEngine } from '../dist/audio/audio-engine.js';
import { createTireVoice } from '../dist/audio/tire-voice.js';
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
const step = (control, count) => {
  for (let i = 0; i < Math.abs(count); i++) control.children[count < 0 ? 0 : 2].click();
};

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
  assert.ok(context.moduleUrl.endsWith('/audio/vehicle-processor.js'));
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
  assert.equal(context.nodes.filter((n) => n instanceof FakeAudioWorkletNode).length, 3);
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
  const state = { ...createVehicleAudioObservation(), rpm: 0, drive: 0.4 };
  const before = structuredClone(state);
  voice.update(state, VEHICLE_CATALOG[0].sound);
  assert.deepEqual(state, before);
  const worklet = context.nodes.find((n) => n instanceof FakeAudioWorkletNode);
  assert.equal(worklet.parameters.get('rpm').value, state.idleRpm);
  assert.equal(worklet.parameters.get('load').value, state.drive);
  voice.update({ ...state, rpm: state.redlineRpm * 2, drive: 0 }, VEHICLE_CATALOG[0].sound);
  assert.equal(worklet.parameters.get('rpm').value, state.redlineRpm);
  assert.equal(worklet.parameters.get('load').value, 0);
  assert.equal(context.nodes.filter((n) => n.started).length, 0);
  voice.dispose();
});

test('tuning survive voice profile replacement without node duplication', (t) => {
  install(t);
  const context = new FakeAudioContext();
  const tuning = { outletReflection: -0.8 };
  const voice = createEngineVoice(context, context.destination, { tuning });
  const count = context.nodes.length;
  tuning.outletReflection = 0;
  const worklet = context.nodes.find(
    (node) => node instanceof FakeAudioWorkletNode && node.name === 'exhaust-waveguide',
  );
  const state = createVehicleAudioObservation();
  voice.update(state, VEHICLE_CATALOG[0].sound);
  voice.update(state, VEHICLE_CATALOG[1].sound);
  context.currentTime = 0.1;
  voice.update(state, VEHICLE_CATALOG[1].sound);
  assert.equal(worklet.messages.length, 2);
  for (const message of worklet.messages) {
    assert.deepEqual(message.tuning, { ...DEFAULT_EXHAUST_TUNING, outletReflection: -0.8 });
  }
  assert.equal(context.nodes.length, count);
  voice.dispose();
});

test('tuning changes fade both fixed engine slots and a superseded choice cannot replace the current one', async (t) => {
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
  const worklets = context.nodes.filter(
    (node) => node instanceof FakeAudioWorkletNode && node.name === 'exhaust-waveguide',
  );
  engine.setTuning({ ...DEFAULT_EXHAUST_TUNING, outputCutoffHz: 1000 });
  update();
  assert.ok(worklets.every((node) => node.messages.length === 1));
  context.currentTime = 0.1;
  update();
  assert.ok(
    worklets.every((node) => node.messages.length === 2 && node.messages.at(-1).tuning.outputCutoffHz === 1000),
  );
  engine.setTuning({ ...DEFAULT_EXHAUST_TUNING, outputCutoffHz: 2000 });
  update();
  engine.setTuning({ ...DEFAULT_EXHAUST_TUNING, outputCutoffHz: 1000 });
  update();
  context.currentTime = 1;
  update();
  assert.ok(worklets.every((node) => node.messages.length === 2));
  assert.equal(context.nodes.length, nodes);
  engine.dispose();
});

test('game tuning honors late loading and muted changes while preserving vehicle state and cleanup', async (t) => {
  const dom = install(t);
  let finish;
  FakeAudioContext.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const lifecycle = createAudioLifecycle();
  t.after(() => lifecycle.dispose());
  const control = dom.elements.get('sound-tuning').children[4].children[1];
  dom.win.emit('pointerdown');
  step(control, -53);
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
  const worklets = context.nodes.filter(
    (node) => node instanceof FakeAudioWorkletNode && node.name === 'exhaust-waveguide',
  );
  assert.equal(worklets.length, 2);
  assert.equal(worklets[0].messages.at(-1).tuning.outputCutoffHz, 2000);
  const count = context.nodes.length;
  dom.elements.get('sound-toggle').click();
  step(control, -10);
  lifecycle.update(player, []);
  assert.equal(worklets[0].messages.length, 1);
  dom.elements.get('sound-toggle').click();
  await settle();
  lifecycle.update(player, []);
  context.currentTime = 0.1;
  lifecycle.update(player, []);
  assert.equal(worklets[0].messages.at(-1).tuning.outputCutoffHz, 1000);
  assert.equal(context.nodes.length, count);
  assert.equal(JSON.stringify(player), before);
  let stopped = false;
  control.children[0].emit('keydown', {
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  lifecycle.dispose();
  assert.equal(control.children[0].listeners.get('click').length, 0);
  assert.equal(control.children[0].listeners.get('keydown').length, 0);
});

test('player tire voice transmits front and rear independently and releases its worklet', (t) => {
  install(t);
  const context = new FakeAudioContext();
  const voice = createTireVoice(context, context.destination);
  const state = createVehicleAudioObservation();
  Object.assign(state.front, {
    load: 4000,
    slipSpeed: 8,
    longitudinalPower: 15000,
    utilization: 1.2,
    surface: 'ASPHALT',
  });
  voice.update(state);
  const node = context.nodes[0];
  assert.equal(node.name, 'vehicle-tires');
  assert.equal(node.parameters.get('front_tire_longitudinalPower').value, 15000);
  assert.equal(node.parameters.get('front_tire_load').value, 4000);
  assert.equal(node.parameters.get('rear_tire_load').value, 0);
  [state.front, state.rear] = [state.rear, state.front];
  voice.update(state);
  assert.equal(node.parameters.get('front_tire_load').value, 0);
  assert.equal(node.parameters.get('rear_tire_longitudinalPower').value, 15000);
  assert.equal(node.parameters.get('rear_tire_load').value, 4000);
  voice.dispose();
  assert.equal(node.finished, true);
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('stepped tuning survives mute and profile changes without mutating physics or adding nodes', async (t) => {
  const dom = install(t);
  const lifecycle = createAudioLifecycle();
  t.after(() => lifecycle.dispose());
  const host = dom.elements.get('sound-tuning');
  const controls = host.children.slice(0, -1).map((row) => row.children[1]);
  const [reflection, cutoff, , , finalCutoff, variation, rise, decay] = controls;
  assert.deepEqual(
    controls.map((control) => control.children[1].textContent),
    ['-1', '3100 Hz', '0.03 Np/m', '0.22', '7300 Hz', '±20%', '0.2 ms', '5 ms'],
  );
  step(rise, 20);
  step(decay, 30);
  step(variation, -8);
  assert.equal(variation.children[1].textContent, '±12%');
  step(reflection, 100); // before gesture initialization finishes
  assert.match(reflection.children[1].textContent, /反射なし/);
  assert.equal(reflection.children[2].disabled, true);
  step(finalCutoff, -63);
  await settle();
  const runtime = createLinearHighwayRuntime();
  const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
  const player = createArcadeVehicle(VEHICLE_CATALOG[0].profile, world);
  const before = JSON.stringify(player);
  const context = FakeAudioContext.instances[0];
  lifecycle.update(player, [{ vehicle: player }]);
  const worklets = context.nodes.filter(
    (node) => node instanceof FakeAudioWorkletNode && node.name === 'exhaust-waveguide',
  );
  const nodeCount = context.nodes.length;
  assert.equal(worklets[0].messages.at(-1).tuning.outletReflection, 0);
  assert.equal(worklets[0].messages.at(-1).tuning.outputCutoffHz, 1000);
  assert.equal(worklets[0].messages.at(-1).tuning.pulseVariation, 0.12);
  assert.equal(worklets[0].messages.at(-1).tuning.pulseRiseMs, 0.4);
  assert.equal(worklets[0].messages.at(-1).tuning.pulseDecayMs, 8);
  dom.elements.get('sound-toggle').click();
  step(cutoff, -26);
  context.currentTime = 1;
  lifecycle.update(player, []);
  assert.equal(worklets[0].messages.length, 1);
  dom.elements.get('sound-toggle').click();
  await settle();
  lifecycle.update(player, []);
  context.currentTime = 1.1;
  lifecycle.update(player, []);
  assert.equal(worklets[0].messages.at(-1).tuning.returnCutoffHz, 500);
  const replacement = createArcadeVehicle(VEHICLE_CATALOG[3].profile, world);
  lifecycle.update(replacement, []);
  context.currentTime = 1.2;
  lifecycle.update(replacement, []);
  assert.equal(worklets[0].messages.at(-1).tuning.outletReflection, 0);
  assert.equal(worklets[0].messages.at(-1).tuning.outputCutoffHz, 1000);
  assert.equal(worklets[0].messages.at(-1).tuning.pulseVariation, 0.12);
  assert.equal(worklets[0].messages.at(-1).tuning.pulseRiseMs, 0.4);
  assert.equal(worklets[0].messages.at(-1).tuning.pulseDecayMs, 8);
  assert.equal(worklets[0].messages.at(-1).tuning.returnCutoffHz, 500);
  host.children.at(-1).click();
  lifecycle.update(replacement, []);
  context.currentTime = 1.3;
  lifecycle.update(replacement, []);
  assert.deepEqual(worklets[0].messages.at(-1).tuning, DEFAULT_EXHAUST_TUNING);
  assert.equal(context.nodes.length, nodeCount);
  assert.equal(JSON.stringify(player), before);
  let stopped = false;
  reflection.children[0].emit('keydown', {
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  lifecycle.dispose();
  assert.equal(reflection.children[0].listeners.get('click').length, 0);
  assert.equal(host.children.length, 0);
});

test('tuning updates reuse both engine slots and own their coefficient snapshots', async (t) => {
  install(t);
  const context = new FakeAudioContext();
  const engine = await createAudioEngine(context);
  const state = createVehicleAudioObservation();
  const update = () => {
    engine.update(state, VEHICLE_CATALOG[0].sound);
    engine.updateRival(state, VEHICLE_CATALOG[1].sound, 0.5, 0);
  };
  update();
  const tuning = { ...DEFAULT_EXHAUST_TUNING, attenuationPerMeter: 0.1, outputCutoffHz: 100 };
  engine.setTuning(tuning);
  tuning.attenuationPerMeter = 0.2;
  tuning.outputCutoffHz = 12000;
  update();
  context.currentTime = 0.1;
  update();
  const worklets = context.nodes.filter(
    (node) => node instanceof FakeAudioWorkletNode && node.name === 'exhaust-waveguide',
  );
  for (const worklet of worklets) {
    assert.equal(worklet.messages.at(-1).tuning.attenuationPerMeter, 0.1);
    assert.equal(worklet.messages.at(-1).tuning.outputCutoffHz, 100);
  }
  engine.setTuning(DEFAULT_EXHAUST_TUNING);
  update();
  engine.setTuning({ ...DEFAULT_EXHAUST_TUNING, attenuationPerMeter: 0.1, outputCutoffHz: 100 });
  context.currentTime = 1;
  update();
  for (const worklet of worklets) assert.equal(worklet.messages.length, 2);
  engine.dispose();
});

test('volume steps unlock once, clamp at both limits and retain muted changes', async (t) => {
  const dom = install(t);
  const lifecycle = createAudioLifecycle();
  t.after(() => lifecycle.dispose());
  const host = dom.elements.get('sound-volume');
  const control = host.children[0];
  assert.equal(control.children[1].textContent, '35%');
  assert.equal(FakeAudioContext.instances.length, 0);
  step(control, 1);
  await settle();
  const context = FakeAudioContext.instances[0];
  const master = context.nodes[0];
  assert.equal(master.gain.value, 0.36);
  step(control, 100);
  assert.equal(control.children[1].textContent, '100%');
  assert.equal(control.children[2].disabled, true);
  assert.equal(master.gain.value, 1);
  step(control, -110);
  assert.equal(control.children[1].textContent, '0%');
  assert.equal(control.children[0].disabled, true);
  assert.equal(master.gain.value, 0);
  dom.elements.get('sound-toggle').click();
  step(control, 42);
  assert.equal(master.gain.value, 0);
  dom.elements.get('sound-toggle').click();
  await settle();
  assert.equal(master.gain.value, 0.42);
  assert.equal(FakeAudioContext.instances.length, 1);
  lifecycle.dispose();
  assert.equal(host.children.length, 0);
  for (const button of [control.children[0], control.children[2]]) {
    assert.equal(button.listeners.get('click').length, 0);
    assert.equal(button.listeners.get('keydown').length, 0);
  }
});

for (const type of ['pointerup', 'touchend']) {
  test(`touch audio starts on ${type}, not on an unactivated touch pointerdown`, async (t) => {
    const dom = install(t);
    const lifecycle = createAudioLifecycle();
    t.after(() => lifecycle.dispose());
    dom.win.emit('pointerdown', { type: 'pointerdown', pointerType: 'touch' });
    assert.equal(FakeAudioContext.instances.length, 0);
    assert.equal(dom.elements.get('sound-toggle').textContent, 'SOUND START');
    dom.win.emit(type, { type, pointerType: 'touch' });
    await settle();
    assert.equal(FakeAudioContext.instances.length, 1);
    assert.equal(FakeAudioContext.instances[0].state, 'running');
    assert.equal(dom.elements.get('sound-toggle').textContent, 'SOUND ON');
    dom.win.emit('pointerup', { type: 'pointerup', pointerType: 'touch' });
    dom.win.emit('touchend', { type: 'touchend' });
    assert.equal(FakeAudioContext.instances.length, 1);
    lifecycle.dispose();
    for (const event of ['pointerdown', 'pointerup', 'touchend', 'keydown'])
      assert.equal(dom.win.listeners.get(event).length, 0);
  });
}

test('SOUND starts on its first click and resumes an interruption before acting as a mute toggle', async (t) => {
  const dom = install(t);
  const lifecycle = createAudioLifecycle();
  t.after(() => lifecycle.dispose());
  const button = dom.elements.get('sound-toggle');
  dom.win.emit('pointerup', { type: 'pointerup', pointerType: 'touch', target: button });
  assert.equal(FakeAudioContext.instances.length, 0);
  button.click();
  await settle();
  const context = FakeAudioContext.instances[0];
  assert.equal(context.state, 'running');
  assert.equal(button.textContent, 'SOUND ON');
  context.state = 'interrupted';
  context.onstatechange();
  assert.equal(button.textContent, 'SOUND START');
  button.click();
  await settle();
  assert.equal(context.state, 'running');
  assert.equal(button.textContent, 'SOUND ON');
  assert.equal(context.nodes[0].gain.value, 0.35);
  button.click();
  assert.equal(button.textContent, 'SOUND OFF');
  assert.equal(context.nodes[0].gain.value, 0);
  lifecycle.dispose();
  assert.equal(context.onstatechange, null);
});

for (const lateGraph of [false, true]) {
  test(`dispose closes a permission-blocked context without waiting for ${lateGraph ? 'late' : 'ready'} graph/resume`, async (t) => {
    const dom = install(t);
    let finishResume, finishGraph;
    t.mock.method(FakeAudioContext.prototype, 'resume', () => new Promise((resolve) => (finishResume = resolve)));
    if (lateGraph) FakeAudioContext.load = () => new Promise((resolve) => (finishGraph = resolve));
    const lifecycle = createAudioLifecycle();
    t.after(() => lifecycle.dispose());
    dom.elements.get('sound-toggle').click();
    await settle();
    const context = FakeAudioContext.instances[0];
    if (!lateGraph) assert.ok(context.nodes.length > 0);
    lifecycle.dispose();
    assert.equal(context.state, 'closed');
    assert.equal(context.onstatechange, null);
    if (lateGraph) {
      finishGraph();
      await settle();
    }
    assert.ok(context.nodes.length > 0);
    assert.ok(context.nodes.every((node) => node.disconnected));
    finishResume();
    await settle();
    assert.equal(context.state, 'closed');
    assert.equal(FakeAudioContext.instances.length, 1);
  });
}
