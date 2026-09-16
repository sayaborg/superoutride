import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { HYBRID_SETTINGS } from '../dist/audio/tire-hybrid-acoustics.js';
import { TIRE_SOUND_SURFACES } from '../dist/audio/tire-sound-observation.js';

// The adopted generator owns raw-observation mapping and scalar vibration energy. The former
// CURRENT-controller equality, S absence and SPECTRAL R replay constraints are superseded in docs/audio.md.
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
const rolling = () => input({ lateralVelocity: 0, lateralPower: 0, demand: 0 });
const hybrid = (rate = 48000, seed = HYBRID_SETTINGS.frontSeed) => new TireHybridSynthesis(rate, seed);
const taps = ['roadOutput', 'scrubOutput', 'squealOutput'];

function measure(kernel, count) {
  const energy = [0, 0, 0];
  let peak = 0,
    samples = 0;
  for (let i = 0; i < count; i++) {
    const output = kernel.sample();
    const sum = kernel.roadOutput + kernel.scrubOutput + kernel.squealOutput;
    assert.ok(Number.isFinite(output) && Math.abs(output - sum) < 1e-14, 'one additive R/S/Q composition');
    peak = Math.max(peak, Math.abs(output));
    if (i >= count / 2) {
      samples++;
      for (let j = 0; j < taps.length; j++) energy[j] += kernel[taps[j]] ** 2;
    }
  }
  return {
    road: Math.sqrt(energy[0] / samples),
    scrub: Math.sqrt(energy[1] / samples),
    squeal: Math.sqrt(energy[2] / samples),
    peak,
  };
}

test('primary HYBRID owns its controls and has no comparison-kernel or comparison-settings dependency', async () => {
  for (const file of ['tire-hybrid-model.ts', 'tire-hybrid-acoustics.ts']) {
    const source = await readFile(new URL(`../src/audio/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\/tire-(?:synthesis|spectral-(?:model|acoustics|rolling|primitives)|contact-(?:model|acoustics))\.js['"]/,
    );
  }
});

test('ordinary rolling needs support and rotation; it does not fabricate sliding or squeal', () => {
  for (const rate of [44100, 48000]) {
    const k = hybrid(rate);
    k.update(rolling());
    const level = measure(k, rate);
    assert.ok(level.road > 0.001);
    assert.equal(level.scrub, 0);
    assert.equal(level.squeal, 0);
    assert.equal(k.squealAmplitude, 0);

    for (const value of [
      input({
        wheelSpeed: 0,
        wheelAngularSpeed: 0,
        lateralVelocity: 0,
        longitudinalPower: 0,
        lateralPower: 0,
        demand: 0,
      }),
      input({ load: 0 }),
      input({ longitudinalVelocity: 0, lateralVelocity: 0, wheelSpeed: 0, wheelAngularSpeed: 0 }),
    ]) {
      const silent = hybrid(rate);
      silent.update(value);
      const result = measure(silent, rate / 4);
      assert.equal(result.peak, 0, 'no excitation without rotation, slip work, or support');
    }
  }
});

test('locked subthreshold sliding has broadband friction without inventing rolling or self-sustaining squeal', () => {
  for (const rate of [44100, 48000]) {
    const k = hybrid(rate);
    k.update(input({ wheelSpeed: 0, wheelAngularSpeed: 0, demand: 0.4 }));
    const result = measure(k, rate);
    assert.equal(result.road, 0);
    assert.ok(result.scrub > 0.003, 'the formerly silent pre-squeal region has sliding sound');
    assert.equal(result.squeal, 0, 'below the demand window there is no Q excitation');
    assert.equal(k.squealAmplitude, 0);
  }
});

test('higher onset leaves audible friction through mild-strong-mild slip without a hard Q gate', () => {
  // This excitation lies above the previous 0.20 onset but below the adopted 0.30 onset.
  const mild = input({ lateralVelocity: 2, lateralPower: 4000, demand: 0.85 });
  for (const rate of [44100, 48000])
    for (const seed of [HYBRID_SETTINGS.frontSeed, HYBRID_SETTINGS.rearSeed]) {
      const k = hybrid(rate, seed);
      k.update(mild);
      const weak = measure(k, rate * 2);
      assert.ok(weak.scrub > 0.001);
      assert.ok(k.squealAmplitude < 0.01, 'mild slip cannot sustain a prominent Q state');
      k.update(input());
      const strong = measure(k, rate);
      assert.ok(k.squealAmplitude > 0.4, 'strong slip still grows');
      assert.ok(strong.squeal > 0.01 && weak.squeal < strong.squeal * 0.02, 'later onset is not a global gain cut');
      assert.ok(strong.scrub > weak.scrub, 'strong sliding retains broadband sound');
      const before = k.squealAmplitude;
      k.update(mild);
      k.sample();
      assert.ok(k.squealAmplitude > before * 0.99, 'crossing onset does not reset stored vibration');
      const recovery = measure(k, rate * 2);
      assert.ok(k.squealAmplitude < 0.01);
      assert.ok(recovery.scrub > 0.001 && recovery.squeal < strong.squeal * 0.02);
    }
});

test('sliding and squeal coexist: Q growth does not duck S or double-count accepted load', () => {
  const quietQ = hybrid(),
    strongQ = hybrid(),
    lightLoad = hybrid();
  quietQ.update(input({ demand: 0.4 }));
  strongQ.update(input());
  lightLoad.update(input({ load: 1000 }));
  let scrubEnergy = 0,
    distinctRolling = false;
  for (let i = 0; i < 48000; i++) {
    for (const k of [quietQ, strongQ, lightLoad]) k.sample();
    assert.equal(
      quietQ.scrubOutput,
      strongQ.scrubOutput,
      'changing only Q instability does not change broadband forcing',
    );
    assert.equal(lightLoad.scrubOutput, strongQ.scrubOutput, 'friction work already contains accepted force');
    assert.equal(lightLoad.squealOutput, strongQ.squealOutput, 'Q does not apply normal load again');
    distinctRolling ||= lightLoad.roadOutput !== strongQ.roadOutput;
    if (i >= 24000) scrubEnergy += strongQ.scrubOutput ** 2;
  }
  assert.ok(scrubEnergy > 0.1 && distinctRolling);
  assert.equal(quietQ.squealAmplitude, 0);
  assert.ok(strongQ.squealAmplitude > 0.4);
});

test('motion reversal preserves acoustic magnitudes and independent axles do not share a noise stream', () => {
  const forward = hybrid(),
    reverse = hybrid(),
    rear = hybrid(48000, HYBRID_SETTINGS.rearSeed);
  forward.update(input());
  reverse.update(
    input({ longitudinalVelocity: -25, lateralVelocity: -6, wheelSpeed: -25, wheelAngularSpeed: -25 / 0.3 }),
  );
  rear.update(input());
  let independent = false;
  for (let i = 0; i < 24000; i++) {
    const a = forward.sample(),
      b = reverse.sample(),
      c = rear.sample();
    assert.equal(a, b, 'signed velocities do not select a different sound law');
    independent ||= a !== c;
  }
  assert.ok(independent);
  assert.equal(forward.squealAmplitude, rear.squealAmplitude, 'seed identities change texture, not energy authority');
  const spin = hybrid();
  spin.update(
    input({
      longitudinalVelocity: 0,
      lateralVelocity: 0,
      wheelSpeed: 30,
      wheelAngularSpeed: 100,
      longitudinalPower: 24000,
      lateralPower: 0,
    }),
  );
  const result = measure(spin, 48000);
  assert.ok(
    result.road > 0.001 && result.scrub > 0.003 && result.squeal > 0.01,
    'supported spin can excite all three mechanisms',
  );
});

test('loose-ground sliding remains audible without pavement-like self-sustaining Q', () => {
  for (const surface of ['GRASS', 'DIRT', 'SAND']) {
    const k = hybrid();
    k.update(input(), TIRE_SOUND_SURFACES.indexOf(surface));
    const result = measure(k, 48000);
    assert.ok(result.scrub > 0.001, `${surface} retains accepted sliding work`);
    assert.ok(k.squealAmplitude < 0.01, `${surface} does not inherit asphalt instability`);
  }
});

test('loss of work or support immediately removes growth, preserves pitch and permits only passive Q decay', () => {
  for (const value of [input({ load: 0 }), rolling()]) {
    const k = hybrid();
    k.update(input());
    measure(k, 48000);
    let previous = k.squealAmplitude;
    const frequency = k.squealFrequency;
    k.update(value);
    for (let i = 0; i < 4800; i++) {
      k.sample();
      assert.ok(k.squealAmplitude <= previous, 'a released follower cannot continue active growth');
      assert.ok(Number.isFinite(k.squealOutput));
      assert.equal(k.squealFrequency, frequency, 'release is not a fabricated pitch sweep');
      previous = k.squealAmplitude;
    }
    const result = measure(k, 48000);
    assert.ok(result.scrub < 1e-8 && result.squeal < 1e-8, 'stored filter and resonator tails decay');
    if (value.load === 0) assert.ok(result.road < 1e-8);
    else assert.ok(result.road > 0.001, 'ordinary rolling continues when slip work ends');
    k.update(input());
    assert.ok(measure(k, 24000).squeal > 0.01, 'recontact resumes the same finite state');
  }
});

test('invalid observations release forcing and extreme supported controls stay finite at native rates', () => {
  const extreme = input({
    longitudinalVelocity: -100,
    lateralVelocity: 100,
    wheelSpeed: 200,
    wheelAngularSpeed: 1000,
    load: 30000,
    longitudinalPower: 1000000,
    lateralPower: 1000000,
    demand: 50,
  });
  for (const rate of [44100, 48000, 96000, 192000]) {
    const k = hybrid(rate);
    for (let surface = 0; surface < TIRE_SOUND_SURFACES.length; surface++) {
      k.update(extreme, surface);
      assert.ok(measure(k, rate / 10).peak < 1, 'authored maximum inputs fit a finite axle output');
    }
    for (const [value, surface] of [
      [input({ load: NaN }), 0],
      [input({ load: -1 }), 0],
      [input({ lateralPower: Infinity }), 0],
      [input(), 0.5],
    ]) {
      k.update(input());
      measure(k, rate / 4);
      const before = k.squealAmplitude;
      assert.throws(() => k.update(value, surface), RangeError);
      k.sample();
      assert.ok(k.squealAmplitude <= before);
      const tail = measure(k, rate);
      assert.ok(tail.road < 1e-8 && tail.scrub < 1e-8 && tail.squeal < 1e-8);
    }
    k.update(input());
    assert.ok(measure(k, rate / 2).squeal > 0.01);
  }
});
