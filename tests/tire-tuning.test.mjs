import assert from 'node:assert/strict';
import test from 'node:test';
import { UNIFIED_SETTINGS, UNIFIED_TUNING_RANGES, resolveUnifiedTuning } from '../dist/audio/tire-unified-acoustics.js';
import { TireUnifiedSynthesis } from '../dist/audio/tire-unified-model.js';
import { mountTireTuningControls } from '../dist/browser/tire-tuning-controls.js';
import { createRangeControl } from '../dist/browser/range-control.js';
import { installBrowserDom } from './helpers/browser-dom.mjs';

const input = {
  longitudinalVelocity: 25,
  lateralVelocity: 6,
  wheelSpeed: 25,
  wheelAngularSpeed: 80,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 24000,
  demand: 1.5,
};

test('UNIFIED tuning validates every bound, owns its snapshot and retains defaults', () => {
  const defaults = resolveUnifiedTuning();
  assert.ok(Object.isFrozen(defaults));
  assert.equal(defaults.highFrequencyHz, 1000, 'listener-selected high-mode default, shared with UI/reset');
  for (const [key, range] of Object.entries(UNIFIED_TUNING_RANGES)) {
    assert.equal(defaults[key], range.defaultValue);
    for (const value of [NaN, Infinity, null, range.min - range.step, range.max + range.step])
      assert.throws(() => resolveUnifiedTuning({ [key]: value }), RangeError);
    assert.equal(resolveUnifiedTuning({ [key]: undefined })[key], range.defaultValue);
  }
  const a = new TireUnifiedSynthesis(48000);
  const b = new TireUnifiedSynthesis(48000, UNIFIED_SETTINGS.frontSeed, defaults);
  a.update(input);
  b.update(input);
  for (let i = 0; i < 10000; i++) assert.equal(a.sample(), b.sample());
  const settings = { ...defaults };
  const c = new TireUnifiedSynthesis(48000, UNIFIED_SETTINGS.frontSeed, settings);
  settings.noiseForcePerSecond = 0;
  const d = new TireUnifiedSynthesis(48000);
  c.update(input);
  d.update(input);
  for (let i = 0; i < 10000; i++) assert.equal(c.sample(), d.sample());
});

test('audition range endpoints remain finite and release, with unchanged rolling', () => {
  const bounds = ['min', 'max'].map((bound) =>
    Object.fromEntries(Object.entries(UNIFIED_TUNING_RANGES).map(([key, range]) => [key, range[bound]])),
  );
  const variants = [
    resolveUnifiedTuning(),
    ...bounds,
    ...Object.entries(UNIFIED_TUNING_RANGES).flatMap(([key, range]) => [{ [key]: range.min }, { [key]: range.max }]),
  ];
  for (const rate of [44100, 48000, 192000])
    for (const tuning of variants) {
      const kernel = new TireUnifiedSynthesis(rate, UNIFIED_SETTINGS.frontSeed, tuning);
      const reference = new TireUnifiedSynthesis(rate);
      for (const observation of [input, { ...input, load: 0 }, input]) {
        kernel.update(observation);
        reference.update(observation);
        for (let i = 0; i < rate / 10; i++) {
          assert.ok(Number.isFinite(kernel.sample()));
          reference.sample();
          assert.equal(kernel.roadOutput, reference.roadOutput);
        }
      }
    }
});

test('native range input updates readout, isolates keys, rejects invalid input and disposes', (t) => {
  installBrowserDom(t);
  const values = [];
  const slider = createRangeControl('TIRE', { min: 0, max: 100, step: 1 }, 100, (v) => values.push(v), '%');
  const input = slider.group.children[2];
  input.value = '25';
  input.emit('input');
  assert.deepEqual(values, [25]);
  assert.equal(slider.group.children[1].textContent, '25 %');
  let stopped = false;
  input.emit('keydown', {
    stopPropagation() {
      stopped = true;
    },
  });
  assert.ok(stopped);
  input.value = 'NaN';
  input.emit('input');
  assert.deepEqual(values, [25]);
  slider.dispose();
  input.value = '30';
  input.emit('input');
  assert.deepEqual(values, [25]);
});

test('UNIFIED panel shares numeric authority, enables explicitly and resets only its tuning', (t) => {
  const dom = installBrowserDom(t);
  const host = dom.elements.get('tire-tuning');
  let changes = 0;
  const controls = mountTireTuningControls(host, () => changes++);
  const fieldset = host.children[0];
  controls.setEnabled(false);
  assert.ok(fieldset.disabled);
  controls.setEnabled(true);
  assert.equal(fieldset.disabled, false);
  for (const row of fieldset.children.filter((c) => c.getAttribute('data-tire-tuning-key'))) {
    const key = row.getAttribute('data-tire-tuning-key');
    const range = UNIFIED_TUNING_RANGES[key];
    const input = row.children[2];
    assert.equal(Number(input.min), range.min);
    assert.equal(Number(input.max), range.max);
    input.value = String(range.min);
    input.emit('input');
    assert.equal(controls.read()[key], range.min);
  }
  assert.equal(changes, Object.keys(UNIFIED_TUNING_RANGES).length);
  fieldset.children.at(-1).click();
  assert.deepEqual(controls.read(), resolveUnifiedTuning());
  controls.dispose();
  assert.equal(host.children.length, 0);
});
