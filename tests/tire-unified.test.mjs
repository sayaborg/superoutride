import assert from 'node:assert/strict';
import test from 'node:test';
import { FrictionResonator } from '../dist/audio/friction-resonator.js';
import { TireHybridSynthesis } from '../dist/audio/tire-hybrid-model.js';
import { TireUnifiedSynthesis } from '../dist/audio/tire-unified-model.js';
import { UNIFIED_DOMAIN, UNIFIED_SETTINGS } from '../dist/audio/tire-unified-acoustics.js';
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
const rolling = () => input({ lateralVelocity: 0, lateralPower: 0, demand: 0 });
const unified = (rate = 48000, seed = UNIFIED_SETTINGS.frontSeed) => new TireUnifiedSynthesis(rate, seed);

// Fixed numerical fixture, independent of subsequent listening changes to production calibration.
// These are normalized acoustic coefficients, not measured rubber/contact properties.
const resonatorFixture = () => ({
  feedbackMaximumPerSecond: 8500,
  saturationPerSecond: 6000,
  noiseBandwidthHz: 600,
  modes: [
    { frequencyHz: 300, dampingPerSecond: 2 * Math.PI * 500, participation: 0.45 },
    { frequencyHz: 1350, dampingPerSecond: 2 * Math.PI * 500, participation: Math.sqrt(1 - 0.45 ** 2) },
  ],
});
const resonator = (rate = 48000, parameters = resonatorFixture()) => new FrictionResonator(rate, parameters, 12345);

function measure(kernel, count) {
  let roadEnergy = 0,
    frictionEnergy = 0,
    peak = 0,
    samples = 0;
  for (let i = 0; i < count; i++) {
    const output = kernel.sample();
    assert.ok(Number.isFinite(output));
    assert.equal(output, kernel.roadOutput + kernel.frictionOutput, 'one R plus one complete friction output');
    peak = Math.max(peak, Math.abs(output));
    if (i >= count / 2) {
      samples++;
      roadEnergy += kernel.roadOutput ** 2;
      frictionEnergy += kernel.frictionOutput ** 2;
    }
  }
  return { road: Math.sqrt(roadEnergy / samples), friction: Math.sqrt(frictionEnergy / samples), peak };
}

test('UNIFIED requires support, nonzero slip and accepted work for friction; rolling remains separate', () => {
  for (const rate of [44100, 48000]) {
    const ordinary = unified(rate);
    ordinary.update(rolling());
    const result = measure(ordinary, rate / 4);
    assert.ok(result.road > 0);
    assert.equal(result.friction, 0);
    assert.equal(ordinary.frictionEnergy, 0);

    for (const value of [
      input({ load: 0 }),
      input({ lateralVelocity: 0 }), // Deliberately inconsistent positive work cannot fabricate slip.
      input({ longitudinalPower: 0, lateralPower: 0 }),
    ]) {
      const kernel = unified(rate);
      kernel.update(value);
      assert.equal(measure(kernel, rate / 10).friction, 0);
      assert.equal(kernel.frictionEnergy, 0);
      if (value.load === 0) assert.equal(kernel.roadOutput, 0);
    }
  }
});

test('UNIFIED shares exact HYBRID rolling through surface, reversal, support and wheel-lock transitions', () => {
  const trace = [
    [rolling(), 0],
    [input(), 2],
    [input({ longitudinalVelocity: -25, lateralVelocity: -6, wheelSpeed: -25, wheelAngularSpeed: -25 / 0.3 }), 3],
    [input({ load: 0 }), 4],
    [input({ wheelSpeed: 0, wheelAngularSpeed: 0 }), 1],
    [input({ longitudinalVelocity: 0, lateralVelocity: 0, wheelSpeed: 30, wheelAngularSpeed: 100 }), 0],
    [rolling(), 0],
  ];
  for (const rate of [44100, 48000])
    for (const seed of [UNIFIED_SETTINGS.frontSeed, UNIFIED_SETTINGS.rearSeed]) {
      const current = new TireHybridSynthesis(rate, seed),
        next = unified(rate, seed);
      for (const [value, surface] of trace) {
        current.update(value, surface);
        next.update(value, surface);
        for (let i = 0; i < 4096; i++) {
          current.sample();
          next.sample();
          assert.equal(next.roadOutput, current.roadOutput, 'replacing friction must preserve R sample for sample');
        }
      }
    }
});

test('UNIFIED Q follows contact slip/work rather than forward speed; R remains speed-dependent', () => {
  for (const rate of [44100, 48000]) {
    const slow = unified(rate),
      fast = unified(rate);
    for (const [kernel, kmh] of [
      [slow, 20],
      [fast, 100],
    ]) {
      kernel.update(
        input({
          longitudinalVelocity: kmh / 3.6,
          wheelSpeed: kmh / 3.6,
          wheelAngularSpeed: kmh / 3.6 / 0.3,
          lateralVelocity: 0.1,
          lateralPower: 100,
        }),
      );
    }
    let slowRoad = 0,
      fastRoad = 0,
      friction = 0;
    for (let i = 0; i < rate; i++) {
      slow.sample();
      fast.sample();
      assert.equal(slow.frictionOutput, fast.frictionOutput, 'matched slip/work gives identical Q, not a speed gate');
      if (i >= rate / 2) {
        slowRoad += slow.roadOutput ** 2;
        fastRoad += fast.roadOutput ** 2;
        friction += slow.frictionOutput ** 2;
      }
    }
    assert.ok(friction > 0, 'small positive slip/work already excites rubbing');
    assert.ok(fastRoad > slowRoad * 4, 'shared rolling independently responds to peripheral speed');
  }
});

test('locked mild sliding produces Q without R or a separate scrub source; stationary supported spin remains audible', () => {
  const locked = unified();
  locked.update(
    input({
      longitudinalVelocity: 2,
      lateralVelocity: 0,
      wheelSpeed: 0,
      wheelAngularSpeed: 0,
      longitudinalPower: 4000,
      lateralPower: 0,
      demand: 0,
    }),
  );
  const mild = measure(locked, 24000);
  assert.equal(mild.road, 0);
  assert.ok(mild.friction > 1e-5, 'friction remains audible before sustained squeal');

  const spinning = unified();
  spinning.update(
    input({
      longitudinalVelocity: 0,
      lateralVelocity: 0,
      wheelSpeed: 30,
      wheelAngularSpeed: 100,
      longitudinalPower: 24000,
      lateralPower: 0,
    }),
  );
  const spin = measure(spinning, 24000);
  assert.ok(spin.road > 0 && spin.friction > 1e-5, 'vehicle translation is not a prerequisite for sound');
});

test('weak-work Q grows linearly rather than with the former square root, without a dead band', () => {
  for (const rate of [44100, 48000, 96000])
    for (const seed of [UNIFIED_SETTINGS.frontSeed, UNIFIED_SETTINGS.rearSeed]) {
      let previous;
      for (const power of [1, 4, 16]) {
        const kernel = unified(rate, seed);
        kernel.update(input({ lateralVelocity: 0.1, lateralPower: power }));
        const response = measure(kernel, rate);
        assert.ok(response.friction > 0, 'weak positive work still excites the same friction system');
        if (previous) {
          const ratio = response.friction / previous.friction;
          assert.ok(
            ratio > 3.9 && ratio < 4.1,
            'fourfold weak work gives approximately fourfold amplitude, not twofold',
          );
          assert.equal(response.road, previous.road, 'R is independent of accepted friction work');
        }
        previous = response;
      }
    }
});

test('the shared friction resonator genuinely self-excites: strong feedback survives removal of random forcing', () => {
  for (const rate of [44100, 48000, 96000]) {
    const passive = resonator(rate),
      below = resonator(rate),
      active = resonator(rate);
    for (let i = 0; i < rate / 50; i++) for (const kernel of [passive, below, active]) kernel.sample(0, 800);
    assert.ok(active.energy > 0, 'common random force supplies the initial disturbance');
    assert.equal(active.energy, passive.energy);
    assert.equal(active.energy, below.energy);
    let sustainedOutput = 0;
    for (let i = 0; i < rate / 4; i++) {
      passive.sample(0, 0);
      below.sample(1500, 0);
      const output = active.sample(6000, 0);
      assert.ok(Number.isFinite(output) && Number.isFinite(active.energy));
      if (i >= rate / 8) sustainedOutput += output ** 2;
    }
    assert.ok(passive.energy < 1e-12 && below.energy < 1e-12, 'passive and subcritical vibration require forcing');
    assert.ok(
      active.energy > 0.01 && sustainedOutput > 1e-8,
      'feedback sustains the same modes without a noise or oscillator output layer',
    );
  }
});

test('the zero-feedback limit is finite and removing excitation monotonically dissipates the modal energy', () => {
  for (const rate of [44100, 192000]) {
    const kernel = resonator(rate);
    for (let i = 0; i < rate / 50; i++) kernel.sample(0, 1200);
    let previous = kernel.energy;
    assert.ok(previous > 0);
    for (let i = 0; i < rate / 10; i++) {
      assert.ok(Number.isFinite(kernel.sample(0, 0)));
      const energy = kernel.energy;
      assert.ok(energy <= previous * (1 + 1e-12) + 1e-300, 'a passive step cannot create modal energy');
      if (i === 0) assert.ok(energy > 0, 'release preserves the existing vibration');
      previous = energy;
    }
    assert.ok(previous < 1e-12);
  }
});

test('UNIFIED uses accepted work once; supported load, demand and work direction are not extra friction gates', () => {
  const reference = unified(),
    light = unified(),
    demandless = unified(),
    longitudinal = unified();
  reference.update(input());
  light.update(input({ load: 1000 }));
  demandless.update(input({ demand: 0 }));
  longitudinal.update(input({ longitudinalPower: 24000, lateralPower: 0, demand: 50 }));
  let distinctRolling = false;
  for (let i = 0; i < 24000; i++) {
    for (const kernel of [reference, light, demandless, longitudinal]) kernel.sample();
    for (const kernel of [light, demandless, longitudinal]) {
      assert.equal(kernel.frictionOutput, reference.frictionOutput);
      assert.equal(kernel.frictionEnergy, reference.frictionEnergy);
    }
    distinctRolling ||= light.roadOutput !== reference.roadOutput;
  }
  assert.ok(distinctRolling, 'R still responds to accepted load');
  assert.ok(reference.frictionEnergy > 0);
});

test('observations are immutable snapshots and velocity reversal preserves the same acoustic law', () => {
  const value = input(),
    snapshot = Object.freeze({ ...value }),
    mutableInput = unified(),
    fixedInput = unified(),
    reversed = unified();
  mutableInput.update(value);
  assert.deepEqual(value, snapshot, 'the audio adapter must not rewrite physical observations');
  fixedInput.update(snapshot);
  reversed.update(
    input({ longitudinalVelocity: -25, lateralVelocity: -6, wheelSpeed: -25, wheelAngularSpeed: -25 / 0.3 }),
  );
  for (const key of Object.keys(value)) value[key] = 0;
  for (let i = 0; i < 12000; i++) {
    const reference = fixedInput.sample();
    assert.equal(mutableInput.sample(), reference, 'later reuse of the caller buffer does not alter accepted controls');
    assert.equal(reversed.sample(), reference);
  }
});

test('independent axle seeds decorrelate friction; invalidating one axle leaves the other unchanged', () => {
  const front = unified(),
    rear = unified(48000, UNIFIED_SETTINGS.rearSeed),
    rearReference = unified(48000, UNIFIED_SETTINGS.rearSeed);
  for (const kernel of [front, rear, rearReference]) kernel.update(input());
  let distinctFriction = false;
  for (let i = 0; i < 12000; i++) {
    front.sample();
    assert.equal(rear.sample(), rearReference.sample());
    distinctFriction ||= front.frictionOutput !== rear.frictionOutput;
  }
  assert.ok(distinctFriction);
  assert.throws(() => front.update(input({ lateralPower: NaN })), RangeError);
  let previous = front.frictionEnergy;
  for (let i = 0; i < 6000; i++) {
    front.sample();
    assert.ok(front.frictionEnergy <= previous * (1 + 1e-12) + 1e-300);
    previous = front.frictionEnergy;
    assert.equal(rear.sample(), rearReference.sample(), 'there is no shared forcing or random state between axles');
  }
});

test('loss of support, slip or work releases Q immediately and recontact resumes finite sound', () => {
  for (const value of [input({ load: 0 }), input({ lateralVelocity: 0 }), rolling()]) {
    const kernel = unified();
    kernel.update(input());
    measure(kernel, 12000);
    let previous = kernel.frictionEnergy;
    assert.ok(previous > 0);
    kernel.update(value);
    assert.equal(kernel.frictionEnergy, previous, 'release removes forcing, not the existing modal state');
    for (let i = 0; i < 4800; i++) {
      kernel.sample();
      assert.ok(kernel.frictionEnergy <= previous * (1 + 1e-12) + 1e-300);
      previous = kernel.frictionEnergy;
    }
    const tail = measure(kernel, 24000);
    assert.ok(tail.friction < 1e-8);
    if (value.load === 0) assert.ok(tail.road < 1e-8);
    else assert.ok(tail.road > 0);
    kernel.update(input());
    assert.ok(measure(kernel, 12000).friction > 1e-5);
  }
});

test('native rate extremes and abrupt changes across every surface remain finite without resetting the modes', () => {
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
    const kernel = unified(rate);
    for (let surface = 0; surface < TIRE_SOUND_SURFACES.length; surface++) {
      const before = kernel.frictionEnergy;
      kernel.update(extreme, surface);
      assert.equal(kernel.frictionEnergy, before, 'material changes are controls, not state replacement');
      const result = measure(kernel, rate / 20);
      assert.ok(result.friction > 0 && Number.isFinite(kernel.frictionEnergy));
      kernel.update(input(), surface);
      assert.ok(measure(kernel, rate / 20).friction > 0);
    }
  }
});

test('invalid acoustic observations release the affected complete axle and allow subsequent valid recovery', () => {
  const kernel = unified();
  for (const [value, surface] of [
    [input({ load: NaN }), 0],
    [input({ load: -1 }), 0],
    [input({ lateralPower: Infinity }), 0],
    [input({ wheelAngularSpeed: 1001 }), 0],
    [input(), -1],
    [input(), 0.5],
    [input(), TIRE_SOUND_SURFACES.length],
  ]) {
    kernel.update(input());
    assert.ok(measure(kernel, 6000).friction > 0);
    const before = kernel.frictionEnergy;
    assert.throws(() => kernel.update(value, surface), RangeError);
    kernel.sample();
    assert.ok(kernel.frictionEnergy <= before);
    const tail = measure(kernel, 24000);
    assert.ok(tail.friction < 1e-8 && tail.road < 1e-8);
  }
  kernel.update(input());
  assert.ok(measure(kernel, 12000).friction > 0);
});

test('resonator compilation owns its parameter snapshot and rejects invalid numerical domains', () => {
  const parameters = resonatorFixture(),
    kernel = resonator(48000, parameters),
    reference = resonator();
  parameters.feedbackMaximumPerSecond = 1;
  parameters.saturationPerSecond = 1;
  parameters.modes[0].frequencyHz = 0;
  parameters.modes[1].participation = 0;
  for (let i = 0; i < 4096; i++) assert.equal(kernel.sample(6000, 1000), reference.sample(6000, 1000));
  for (const rate of [0, UNIFIED_DOMAIN.minRate - 1, UNIFIED_DOMAIN.maxRate + 1, 48000.5, NaN, Infinity])
    assert.throws(() => unified(rate), RangeError);
  for (const extra of [
    { modes: [] },
    { feedbackMaximumPerSecond: 0 },
    { feedbackMaximumPerSecond: 48000 },
    { saturationPerSecond: 0 },
    { noiseBandwidthHz: NaN },
    { noiseBandwidthHz: 24000 },
    { modes: [{ frequencyHz: 0, dampingPerSecond: 10, participation: 1 }] },
    { modes: [{ frequencyHz: 100, dampingPerSecond: 0, participation: 1 }] },
    { modes: [{ frequencyHz: 100, dampingPerSecond: 2000, participation: 1 }] },
    { modes: [{ frequencyHz: 12000, dampingPerSecond: 10, participation: 1 }] },
    { modes: [{ frequencyHz: 100, dampingPerSecond: 10, participation: 0 }] },
  ])
    assert.throws(() => resonator(48000, { ...resonatorFixture(), ...extra }), RangeError);
  for (const args of [
    [-1, 0],
    [8501, 0],
    [NaN, 0],
    [0, -1],
    [0, Infinity],
  ])
    assert.throws(() => reference.sample(...args), RangeError);
});
