import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { HYBRID_SETTINGS } from '../dist/audio/tire-hybrid-acoustics.js';
import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { TireRollingSynthesis } from '../dist/audio/tire-rolling-model.js';
import { TIRE_SOUND_SURFACES } from '../dist/audio/tire-sound-observation.js';

const input = (extra = {}) => ({
  longitudinalVelocity: 25,
  lateralVelocity: 6,
  wheelSpeed: 25,
  wheelAngularSpeed: 25 / 0.3,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 24000,
  demand: 1.5,
  ...extra,
});

test('shared rolling has no friction-kernel or friction-settings dependency', async () => {
  for (const file of ['tire-rolling-model.ts', 'tire-rolling-acoustics.ts']) {
    const source = await readFile(new URL(`../src/audio/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]\.\/tire-(?:hybrid|modal|unified|spectral|contact|synthesis)/);
  }
});

test('standalone rolling exactly composes HYBRID R through material, rotation and contact transitions', () => {
  const segments = [
    [input(), 0],
    [input({ wheelSpeed: 55, wheelAngularSpeed: 55 / 0.3, load: 9000 }), 1],
    [input({ wheelSpeed: -55, wheelAngularSpeed: -55 / 0.3 }), 2],
    [input({ wheelSpeed: 0, wheelAngularSpeed: 0 }), 3],
    [input({ load: 0 }), 4],
    [input({ wheelSpeed: 12, wheelAngularSpeed: 12 / 0.3 }), 4],
    [input({ wheelSpeed: 12, wheelAngularSpeed: 0 }), 0],
  ];
  for (const rate of [44100, 48000, 96000, 192000])
    for (const seed of [HYBRID_SETTINGS.frontSeed, HYBRID_SETTINGS.rearSeed]) {
      const rolling = new TireRollingSynthesis(rate, seed);
      const hybrid = new TireHybridSynthesis(rate, seed);
      for (const [value, surface] of segments) {
        rolling.update(value, surface);
        hybrid.update(value, surface);
        for (let i = 0; i < Math.floor(rate / 17); i++) {
          hybrid.sample();
          assert.equal(rolling.sample(), hybrid.roadOutput);
        }
      }
    }
});

test('rolling copies observations and depends on accepted support and wheel motion, not sliding work', () => {
  const rate = 48000;
  const observed = input();
  const rolling = new TireRollingSynthesis(rate, HYBRID_SETTINGS.frontSeed);
  const comparison = new TireRollingSynthesis(rate, HYBRID_SETTINGS.frontSeed);
  rolling.update(observed);
  comparison.update(input({ longitudinalVelocity: -80, lateralVelocity: -90, lateralPower: 0, demand: 0 }));
  Object.assign(observed, input({ wheelSpeed: 0, wheelAngularSpeed: 0, load: 0 }));
  let energy = 0;
  for (let i = 0; i < rate / 4; i++) {
    const value = rolling.sample();
    assert.equal(value, comparison.sample(), 'friction and reused input objects do not alter R');
    energy += value * value;
  }
  assert.ok(energy > 0.01);
  for (const value of [input({ load: 0 }), input({ wheelSpeed: 0 }), input({ wheelAngularSpeed: 0 })]) {
    const silent = new TireRollingSynthesis(rate, HYBRID_SETTINGS.frontSeed);
    silent.update(value);
    for (let i = 0; i < rate / 10; i++) assert.equal(silent.sample(), 0);
  }
});

test('invalid rolling observations stop forcing without resetting the decaying resonator and filter state', () => {
  for (const invalid of [input({ load: NaN }), input({ wheelSpeed: Infinity })]) {
    const rolling = new TireRollingSynthesis(48000, HYBRID_SETTINGS.frontSeed);
    const released = new TireRollingSynthesis(48000, HYBRID_SETTINGS.frontSeed);
    rolling.update(input());
    released.update(input());
    for (let i = 0; i < 12000; i++) assert.equal(rolling.sample(), released.sample());
    assert.throws(() => rolling.update(invalid), RangeError);
    released.update(input({ load: 0 }));
    let tail = 0;
    for (let i = 0; i < 48000; i++) {
      const sample = rolling.sample();
      assert.equal(sample, released.sample());
      if (i < 100) tail += sample * sample;
      if (i > 24000) assert.ok(Math.abs(sample) < 1e-8);
    }
    assert.ok(tail > 0, 'release preserves the passive tail');
  }
  const rolling = new TireRollingSynthesis(48000, HYBRID_SETTINGS.frontSeed);
  assert.throws(() => rolling.update(input(), TIRE_SOUND_SURFACES.length), RangeError);
});
