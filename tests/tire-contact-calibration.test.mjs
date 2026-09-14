import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ContactMode, TireContactSynthesis } from '../dist/audio/tire-contact-model.js';
import { CONTACT_ACOUSTICS } from '../dist/audio/tire-contact-acoustics.js';
import { CONTACT_SCENARIOS } from '../tools/tire-contact-scenarios.mjs';

// Pre-edit road tap from the user-approved a295b0b trial, not a newly tuned oracle.
const ROAD_REFERENCE = [
  '82f2d2ff3cbf7f6fe035b16eb145f6629b96a30d4b3df65a82606788b3443fce',
  '145420606ae7f6fb77ff978ac6950c4fae1023b3fc6399b133fefe53c0e4098f',
  'c65de60cbab20aa30cb2bf16a4b078a391f1792459c8bc09cd9a5e6028abca7e',
  '9a618be9df1d40986a818f62b4041bd893b31938fa024a2f114380fff8231510',
  '2982c5cdb8cf658da9ba6782019c880b646e3438314d22608e6d8a7d47406ee8',
  '76516ddf74ac00965b84f0948a41951a81dd7b0a58a48d9b68c554d512ed875b',
  'e7bc3a8509ba44b560c15769999d632f26d04c69e419a6e2bcf3b6ec0d37f1e6',
  '7b4a999040396975ee57055ebe570e680f21d0c7e7731689228fab278ffe470e',
];

test('friction calibration preserves the accepted front/rear paved/loose road taps exactly', () => {
  let index = 0;
  for (const rate of [44100, 48000])
    for (const texture of ['paved', 'loose'])
      for (const seed of [CONTACT_ACOUSTICS.frontSeed, CONTACT_ACOUSTICS.rearSeed]) {
        const voice = new TireContactSynthesis(rate, seed, texture);
        const hash = createHash('sha256'),
          value = Buffer.alloc(8);
        for (const inputs of [
          [0, 0, 5],
          [30, 0, 5],
          [100, 0.5, 8],
          [5, 0, 2],
          [0, 0, 0],
        ]) {
          voice.update(...inputs);
          for (let i = 0; i < rate / 10; i++) {
            voice.sample();
            value.writeDoubleLE(voice.roadOutput);
            hash.update(value);
          }
        }
        assert.equal(hash.digest('hex'), ROAD_REFERENCE[index++]);
      }
});

test('one fixed mechanical resonance yields slip-dependent pitch and harmonics without a pitch map', () => {
  for (const rate of [44100, 48000, 96000]) {
    const frequencies = [];
    for (const slip of [0.25, 0.5, 0.8]) {
      const mode = new ContactMode(rate, CONTACT_ACOUSTICS.frictionMode);
      for (let i = 0; i < rate; i++) mode.step(slip, 5);
      const samples = Float64Array.from({ length: rate }, () => mode.step(slip, 5));
      const crossings = [];
      for (let i = 1; i < samples.length; i++)
        if (samples[i - 1] < 0 && samples[i] >= 0)
          crossings.push((i - samples[i] / (samples[i] - samples[i - 1])) / rate);
      assert.ok(crossings.length > 100);
      const hz = (crossings.length - 1) / (crossings.at(-1) - crossings[0]);
      frequencies.push(hz);
      assert.ok(hz < CONTACT_ACOUSTICS.frictionMode.frequencyHz);
      if (slip === 0.5) {
        const magnitude = (order) => {
          let real = 0,
            imag = 0;
          for (let i = 0; i < samples.length; i++) {
            const phase = (order * 2 * Math.PI * hz * i) / rate;
            real += samples[i] * Math.cos(phase);
            imag += samples[i] * Math.sin(phase);
          }
          return Math.hypot(real, imag);
        };
        // Causal distinction from the former almost sinusoidal weak-coupling setting.
        assert.ok(magnitude(2) / magnitude(1) > 0.3);
      }
    }
    assert.ok(frequencies[2] - frequencies[0] > 100);
    assert.ok(frequencies[1] > frequencies[0] && frequencies[2] > frequencies[1]);
  }
});

test('the published 6-7 second two-axle cancellation case no longer nearly nulls', () => {
  const scene = CONTACT_SCENARIOS.find((value) => value.id === 'slip-sweep');
  for (const rate of [44100, 48000, 96000]) {
    const front = new TireContactSynthesis(rate, CONTACT_ACOUSTICS.frontSeed);
    const rear = new TireContactSynthesis(rate, CONTACT_ACOUSTICS.rearSeed);
    let step = 0,
      ff = 0,
      rr = 0,
      fr = 0;
    for (let i = 0; i < 7 * rate; i++) {
      if (step < scene.steps.length && i >= scene.steps[step][0] * rate) {
        front.update(...scene.steps[step][1]);
        rear.update(...scene.steps[step][2]);
        step++;
      }
      front.sample();
      rear.sample();
      if (i >= 6 * rate) {
        ff += front.frictionOutput ** 2;
        rr += rear.frictionOutput ** 2;
        fr += front.frictionOutput * rear.frictionOutput;
      }
    }
    assert.ok(ff > 1 && rr > 1);
    // Specific replay regression, not a guarantee of incoherence for all inputs or seeds.
    assert.ok((ff + rr + 2 * fr) / (ff + rr) > 0.1);
  }
});

test('fixed pickup retains headroom for strong sliding, release phases and seeded input transitions', () => {
  for (const rate of [44100, 48000, 96000]) {
    const front = new TireContactSynthesis(rate, CONTACT_ACOUSTICS.frontSeed);
    const rear = new TireContactSynthesis(rate, CONTACT_ACOUSTICS.rearSeed);
    let seed = 34761;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let part = 0; part < 32; part++) {
      for (const voice of [front, rear]) voice.update(100 * random(), 4 * random(), 8 * random());
      if (part === 31) {
        front.update(0, 0, 0);
        rear.update(0, 0, 0);
      }
      for (let i = 0; i < rate / 4; i++) {
        const value = CONTACT_ACOUSTICS.listeningGain * (front.sample() + rear.sample());
        assert.ok(Number.isFinite(value) && Math.abs(value) < 1);
      }
    }
    assert.ok(Math.abs(front.sample()) + Math.abs(rear.sample()) < 1e-8);
  }
});
