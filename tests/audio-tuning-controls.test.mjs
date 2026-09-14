import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAudioTuningControls } from '../dist/browser/audio-tuning-controls.js';
import {
  DEFAULT_EXHAUST_TUNING,
  EXHAUST_TUNING_RANGES,
  resolveExhaustTuning,
} from '../dist/audio/exhaust-acoustics.js';
import { SelectorElement, selectorDocument } from './helpers/fake-selector-dom.mjs';

test('shared sound controls step exact decimals, stay in the kernel domain and reset every readout', () => {
  const host = new SelectorElement();
  const changes = [];
  const controls = mountAudioTuningControls(host, (tuning) => changes.push(tuning), selectorDocument);
  const rows = host.children.slice(0, -1);
  const groups = rows.map((row) => row.children[1]);
  const keys = rows.map((row) => row.getAttribute('data-tuning-key'));
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULT_EXHAUST_TUNING).sort());
  const initial = groups.map((group) => group.children[1].textContent);
  for (const [i, key] of keys.entries()) {
    const range = EXHAUST_TUNING_RANGES[key];
    const min = range.uiMin ?? range.min,
      max = range.uiMax ?? range.max,
      step = range.step;
    const [minus, output, plus] = groups[i].children;
    assert.equal(minus.tagName, 'BUTTON');
    assert.equal(plus.tagName, 'BUTTON');
    assert.ok(plus.getAttribute('aria-label'));
    for (let j = 0; j < 400; j++) minus.click();
    assert.equal(controls.read()[key], min);
    assert.doesNotThrow(() => resolveExhaustTuning(controls.read()));
    assert.equal(minus.disabled, true);
    let count = changes.length;
    minus.click();
    assert.equal(changes.length, count);
    for (let j = 1; j <= Math.round((max - min) / step); j++) {
      plus.click();
      assert.equal(controls.read()[key], Number((min + j * step).toFixed(2)));
      assert.doesNotThrow(() => resolveExhaustTuning(controls.read()));
    }
    assert.equal(controls.read()[key], max);
    assert.equal(plus.disabled, true);
    count = changes.length;
    plus.click();
    assert.equal(changes.length, count);
    assert.ok(output.textContent);
    let stopped = false;
    minus.emit('keydown', { stopPropagation: () => (stopped = true) });
    assert.equal(stopped, true);
  }
  const lastChange = { ...changes.at(-1) };
  host.children.at(-1).click();
  assert.deepEqual(controls.read(), DEFAULT_EXHAUST_TUNING);
  assert.deepEqual(
    groups.map((group) => group.children[1].textContent),
    initial,
  );
  assert.deepEqual(changes.at(-2), lastChange); // reset must not mutate a previous snapshot
  assert.equal(groups[0].children[0].disabled, true);
  assert.equal(groups[0].children[2].disabled, false);
  const reset = host.children.at(-1);
  controls.dispose();
  const count = changes.length;
  reset.click();
  for (const group of groups) {
    for (const button of [group.children[0], group.children[2]]) {
      button.click();
      assert.equal(button.listeners.get('keydown').length, 0);
    }
  }
  assert.equal(changes.length, count);
  assert.equal(host.children.length, 0);
});
