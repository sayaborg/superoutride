import assert from 'node:assert/strict';
import test from 'node:test';
import { MODAL_SETTINGS, MODAL_TUNING_RANGES, resolveModalTuning } from '../../dist/audio/tire-modal-acoustics.js';
import { TireModalSynthesis } from '../../dist/audio/tire-modal-model.js';
import { UNIFIED_TUNING_RANGES, resolveUnifiedTuning } from '../../dist/audio/tire-unified-acoustics.js';
import { mountTireTuningControls } from '../../dist/browser/tire-tuning-controls.js';
import { createRangeControl } from '../../dist/browser/range-control.js';
import { installBrowserDom } from '../helpers/browser-dom.mjs';

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

test('MODAL tuning validates every bound, owns its snapshot and retains defaults', () => {
  const defaults = resolveModalTuning();
  assert.ok(Object.isFrozen(defaults));
  assert.equal(defaults.pitchBaseHz, 1100, 'HYBRID pitch reference, shared with UI/reset');
  for (const [key, range] of Object.entries(MODAL_TUNING_RANGES)) {
    assert.equal(defaults[key], range.defaultValue);
    for (const value of [NaN, Infinity, null, range.min - range.step, range.max + range.step])
      assert.throws(() => resolveModalTuning({ [key]: value }), RangeError);
    assert.equal(resolveModalTuning({ [key]: undefined })[key], range.defaultValue);
  }
  const a = new TireModalSynthesis(48000);
  const b = new TireModalSynthesis(48000, MODAL_SETTINGS.frontSeed, defaults);
  a.update(input);
  b.update(input);
  for (let i = 0; i < 10000; i++) assert.equal(a.sample(), b.sample());
  const settings = { ...defaults };
  const c = new TireModalSynthesis(48000, MODAL_SETTINGS.frontSeed, settings);
  settings.noiseRms = 0;
  const d = new TireModalSynthesis(48000);
  c.update(input);
  d.update(input);
  for (let i = 0; i < 10000; i++) assert.equal(c.sample(), d.sample());
});

test('audition range endpoints remain finite and release, without rolling or scrub', () => {
  const bounds = ['min', 'max'].map((bound) =>
    Object.fromEntries(Object.entries(MODAL_TUNING_RANGES).map(([key, range]) => [key, range[bound]])),
  );
  const variants = [
    resolveModalTuning(),
    ...bounds,
    ...Object.entries(MODAL_TUNING_RANGES).flatMap(([key, range]) => [{ [key]: range.min }, { [key]: range.max }]),
  ];
  for (const rate of [44100, 48000, 192000])
    for (const tuning of variants) {
      const kernel = new TireModalSynthesis(rate, MODAL_SETTINGS.frontSeed, tuning);
      for (const observation of [input, { ...input, load: 0 }, input]) {
        kernel.update(observation);
        for (let i = 0; i < rate / 10; i++) {
          const value = kernel.sample();
          assert.ok(Number.isFinite(value));
          if (observation.load === 0 && i > rate * 0.09) assert.ok(Math.abs(value) < 1e-6);
          assert.equal('roadOutput' in kernel, false);
          assert.equal('scrubOutput' in kernel, false);
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

test('MODAL panel shares numeric authority, enables explicitly and resets only its tuning', (t) => {
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
    const range = MODAL_TUNING_RANGES[key];
    const input = row.children[2];
    assert.equal(Number(input.min), range.min);
    assert.equal(Number(input.max), range.max);
    input.value = String(range.min);
    input.emit('input');
    assert.equal(controls.read().tuning[key], range.min);
  }
  assert.equal(changes, Object.keys(MODAL_TUNING_RANGES).length);
  fieldset.children.at(-1).click();
  assert.deepEqual(controls.read(), { model: 'modal', tuning: resolveModalTuning() });
  controls.dispose();
  assert.equal(host.children.length, 0);
});

test('UNIFIED and MODAL panels retain separate values and reset only the selected model', (t) => {
  const dom = installBrowserDom(t);
  const host = dom.elements.get('tire-tuning');
  const controls = mountTireTuningControls(host, () => {});
  const [modal, unified] = host.children;
  const slider = (panel, key) => panel.children.find((c) => c.getAttribute('data-tire-tuning-key') === key).children[2];
  const set = (panel, key, value) => {
    const input = slider(panel, key);
    input.value = String(value);
    input.emit('input');
  };
  set(modal, 'powerReferenceWatts', 8000);
  controls.setModel('unified');
  assert.ok(modal.hidden && modal.disabled);
  assert.equal(unified.hidden, false);
  assert.equal(unified.disabled, false);
  assert.deepEqual(controls.read(), { model: 'unified', tuning: resolveUnifiedTuning() });
  for (const [key, range] of Object.entries(UNIFIED_TUNING_RANGES)) {
    const input = slider(unified, key);
    assert.equal(Number(input.min), range.min);
    assert.equal(Number(input.max), range.max);
    set(unified, key, range.min);
    assert.equal(controls.read().tuning[key], range.min);
  }
  controls.setModel('modal');
  assert.equal(controls.read().tuning.powerReferenceWatts, 8000);
  controls.setModel('unified');
  assert.equal(controls.read().tuning.powerReferenceWatts, UNIFIED_TUNING_RANGES.powerReferenceWatts.min);
  unified.children.at(-1).click();
  assert.deepEqual(controls.read().tuning, resolveUnifiedTuning());
  controls.setModel('modal');
  assert.equal(controls.read().tuning.powerReferenceWatts, 8000, 'UNIFIED reset must not change MODAL');
  controls.setModel('hybrid');
  assert.equal(controls.read(), null);
  assert.ok(modal.hidden && unified.hidden && modal.disabled && unified.disabled);
  controls.dispose();
});
