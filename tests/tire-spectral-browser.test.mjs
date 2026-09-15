import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { SPECTRAL_INPUTS } from '../dist/audio/tire-spectral-acoustics.js';
import { SPECTRAL_SCENARIOS, spectralScenarioAt } from '../tools/tire-spectral-scenarios.mjs';
import { SelectorElement } from './helpers/fake-selector-dom.mjs';
import { FakeAudioContext, FakeAudioParam, FakeAudioWorkletNode } from './helpers/audio-context.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function install(t) {
  const html = await readFile(new URL('../tools/tire-spectral-browser.html', import.meta.url), 'utf8');
  const source = html
    .match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?/g, '')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/tools/tire-spectral-browser.html'));
  const elements = new Map();
  class Element extends SelectorElement {
    get valueAsNumber() {
      return this.value === '' ? NaN : Number(this.value);
    }
    append(...children) {
      for (const child of children) {
        this.appendChild(child);
        if (child.id) elements.set(child.id, child);
      }
    }
  }
  for (const id of ['start', 'stop', 'status', 'controls', 'scene', 'tap', 'volume', 'reset', 'replay'])
    elements.set(id, new Element());
  elements.get('scene').value = SPECTRAL_SCENARIOS[0].id;
  elements.get('tap').value = 'mix';
  elements.get('volume').value = '0.35';
  const document = new Element();
  document.getElementById = (id) => elements.get(id);
  document.createElement = (tag) => new Element(tag);
  class Param extends FakeAudioParam {
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push(['value', value, time]);
    }
    cancelScheduledValues(time) {
      this.events.push(['cancel', time]);
    }
  }
  class Context extends FakeAudioContext {
    createGain() {
      const node = super.createGain();
      node.gain = new Param();
      return node;
    }
  }
  class Worklet extends FakeAudioWorkletNode {
    constructor(context, name, options) {
      super(context, name);
      this.options = options;
      this.parameters = new Map(Object.keys(SPECTRAL_INPUTS).map((key) => [key, new Param()]));
    }
  }
  const window = new Element();
  window.AudioContext = Context;
  window.AudioWorkletNode = Worklet;
  const timers = new Set();
  FakeAudioContext.instances = [];
  FakeAudioContext.load = () => Promise.resolve();
  FakeAudioContext.failResume = false;
  runInNewContext(source, {
    document,
    window,
    AudioWorkletNode: Worklet,
    URL,
    SPECTRAL_INPUTS,
    SPECTRAL_SCENARIOS,
    spectralScenarioAt,
    setTimeout: (callback) => {
      timers.add(callback);
      return callback;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  t.after(() => {
    window.emit('pagehide');
    FakeAudioContext.load = () => Promise.resolve();
  });
  return {
    elements,
    document,
    window,
    timers,
    contexts: FakeAudioContext.instances,
    status: () => elements.get('status').textContent,
    node: () => FakeAudioContext.instances.at(-1).nodes.find((node) => node.name === 'tire-spectral-trial'),
  };
}

test('spectral page shares domains, creates one two-tap graph and preserves it on solo/volume changes', async (t) => {
  const h = await install(t);
  for (const [key, range] of Object.entries(SPECTRAL_INPUTS)) {
    const field = h.elements.get(key);
    assert.equal(field.valueAsNumber, range.value);
    assert.equal(field.max, range.max);
  }
  h.elements.get('start').click();
  await settle();
  assert.match(h.status(), /Manual/);
  assert.equal(h.contexts.length, 1);
  assert.equal(h.node().options.numberOfOutputs, 2);
  const node = h.node();
  const count = h.contexts[0].nodes.length;
  for (const value of ['scrub', 'squeal', 'mix']) {
    h.elements.get('tap').value = value;
    h.elements.get('tap').emit('change');
  }
  h.elements.get('volume').value = '0.2';
  h.elements.get('volume').emit('input');
  assert.equal(h.node(), node);
  assert.equal(h.contexts[0].nodes.length, count);
  h.elements.get('stop').click();
  assert.equal(node.parameters.get('load').value, 0);
  for (const callback of [...h.timers]) callback();
  assert.equal(h.contexts[0].state, 'closed');
  assert.deepEqual(node.messages, ['stop']);
});

test('stop during loading and stale failure cannot revive or close the newer spectral graph', async (t) => {
  const h = await install(t),
    pending = [];
  FakeAudioContext.load = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  h.elements.get('start').click();
  h.elements.get('stop').click();
  assert.equal(h.contexts[0].state, 'closed');
  h.elements.get('start').click();
  pending[1].resolve();
  await settle();
  pending[0].reject(new Error('retired module failure'));
  await settle();
  assert.match(h.status(), /Manual/);
  assert.equal(h.contexts[1].state, 'running');
  assert.equal(h.contexts[0].nodes.length, 0);
  h.document.hidden = true;
  h.document.emit('visibilitychange');
  assert.ok(h.contexts.every((context) => context.state === 'closed'));
});

test('spectral replay starts with its own silent observation and manual input cancels future controls', async (t) => {
  const h = await install(t);
  h.elements.get('replay').click();
  await settle();
  assert.match(h.status(), /Replay/);
  const p = h.node().parameters.get('lateralPower');
  assert.deepEqual(p.events[0], ['value', 0, 0], 'no initial steady-corner burst before replay');
  assert.ok(p.events.length > 100);
  h.elements.get('lateralPower').value = '500';
  h.elements.get('lateralPower').emit('change');
  assert.match(h.status(), /Manual/);
  assert.deepEqual(p.events.slice(-2), [
    ['cancel', 0],
    ['value', 500, 0],
  ]);
  h.elements.get('stop').click();
  h.elements.get('start').click();
  await settle();
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.contexts[1].state, 'running');
  assert.equal(h.timers.size, 0, 'retired fade timer must not own a context after restart');
});

test('processor failure and invalid UI inputs retire spectral audio and allow a clean retry', async (t) => {
  const h = await install(t);
  h.elements.get('start').click();
  await settle();
  h.node().onprocessorerror();
  assert.match(h.status(), /retry/);
  assert.equal(h.contexts[0].state, 'closed');
  h.elements.get('start').click();
  await settle();
  assert.equal(h.contexts[1].state, 'running');
  h.elements.get('load').value = '';
  h.elements.get('load').emit('change');
  assert.match(h.status(), /Invalid/);
  assert.equal(h.contexts[1].state, 'closed');
  h.elements.get('reset').click();
  h.elements.get('start').click();
  await settle();
  assert.equal(h.contexts[2].state, 'running');
});
