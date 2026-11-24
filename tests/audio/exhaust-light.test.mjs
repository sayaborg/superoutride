import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { ExhaustLight, lightExhaust } from '../../src/audio/exhaust-light.js';

const content = await readDeliveredContent();
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const vehicle = (id) => vehicles.find(({ compiledVehicle }) => compiledVehicle.id === id);
const rate = 48000;

/**
 * The auditor's values for the eleven settled sounds (2026-11-24): at 90 % of the redline, burning, the kernel's own
 * sound over its second and third seconds, rendered 480 samples at a time: fully open, its level and its peak over its
 * level, and fully closed, its level (dB).
 */
const AUDITED = {
  FERRARI_F40_1988: [-78.89, 9.34, -75.22],
  PORSCHE_959_1987: [-72.22, 8.46, -85.39],
  RX_7_TURBO_II_1987: [-73.44, 7.58, -73.15],
  PORSCHE_928_S4_1987: [-77.99, 7.87, -83.74],
  XR600R_1985: [-70.62, 7.61, -74.71],
  TESTAROSSA: [-82.14, 7.81, -90.91],
  NSR500_1984: [-69.5, 8.37, -73.55],
  TURBO_ESPRIT_1984: [-77.36, 7.49, -71.69],
  COUNTACH_5000_QV_1985: [-71.42, 9.54, -74.22],
  '911_TURBO_3_3_1986': [-79.17, 7.71, -83.42],
  FERRARI_GTO_1984: [-77.03, 7.72, -69.05],
};

/**
 * The auditor's reading of the eleven settled sounds (2026-11-23): the diameter (mm), then each tube as
 * `from>to length`, `v` a valve and `m` a mouth, its length in centimetres.
 */
const valves = (to, lengths) => lengths.map((length) => `v>${to.shift()} ${length}`);
const READ = {
  FERRARI_F40_1988: [
    40,
    ...valves([0, 1, 0, 1, 0, 1, 0, 1], [70, 70, 46, 46, 36, 36, 58, 58]),
    '0>2 56',
    '1>2 66',
    '2>m 74',
  ],
  PORSCHE_959_1987: [
    43,
    ...valves([0, 3, 0, 1, 2, 1], [22, 10, 10, 22, 10, 10]),
    '0>2 12',
    '2>4 58',
    '1>3 12',
    '3>4 68',
    '4>m 96',
  ],
  RX_7_TURBO_II_1987: [55, 'v>0 14', 'v>0 32', '0>m 326'],
  PORSCHE_928_S4_1987: [
    48,
    ...valves([0, 0, 1, 0, 1, 1, 0, 1], [20, 16, 16, 20, 20, 20, 16, 16]),
    '0>2 262',
    '1>2 292',
    '2>m 84',
  ],
  XR600R_1985: [42, 'v>m 130'],
  TESTAROSSA: [
    40,
    ...valves([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3], Array(12).fill(20)),
    '0>4 86',
    '2>4 74',
    '1>5 86',
    '3>5 74',
    '4>m 164',
    '5>m 164',
  ],
  NSR500_1984: [38, 'v>m 118', 'v>m 122', 'v>m 118', 'v>m 122'],
  TURBO_ESPRIT_1984: [43, ...valves([0, 1, 0, 1], [44, 26, 16, 36]), '0>2 34', '1>2 34', '2>m 214'],
  COUNTACH_5000_QV_1985: [
    43,
    ...valves([0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3], [40, 40, 46, 46, 34, 34, 32, 32, 36, 36, 36, 36]),
    '0>4 78',
    '1>4 50',
    '4>m 110',
    '2>5 78',
    '3>5 50',
    '5>m 110',
  ],
  '911_TURBO_3_3_1986': [
    43,
    ...valves([0, 3, 0, 1, 2, 1], [22, 10, 10, 22, 10, 10]),
    '0>2 12',
    '2>4 72',
    '1>3 12',
    '3>4 130',
    '4>m 144',
  ],
  FERRARI_GTO_1984: [
    40,
    ...valves([0, 2, 1, 3, 1, 3, 0, 2], [42, 42, 26, 26, 16, 16, 34, 34]),
    '0>4 22',
    '1>4 22',
    '2>5 22',
    '3>5 22',
    '4>6 48',
    '5>6 48',
    '6>m 72',
  ],
};

/** `seconds` of a sound at a steady `rpm` and `opening`, `quantum` samples a call; `afterfire` asks one a call. */
function steady(sound, seconds, rpm, opening, { quantum = 480, afterfire = false, burns = true } = {}) {
  const kernel = new ExhaustLight(sound, rate, 0.025);
  const out = new Float64Array(Math.round(seconds * rate));
  const speeds = new Float64Array(quantum).fill(rpm);
  const openings = new Float64Array(quantum).fill(opening);
  for (let n = 0; n < out.length; n += quantum) {
    if (afterfire) kernel.afterfire();
    kernel.render(out, n, Math.min(quantum, out.length - n), speeds, openings, burns);
  }
  return out;
}

const decibels = (value) => 20 * Math.log10(value);
function level(sound) {
  let energy = 0,
    peak = 0;
  for (const x of sound) {
    energy += x * x;
    peak = Math.max(peak, Math.abs(x));
  }
  const rms = Math.sqrt(energy / sound.length);
  return { rms: decibels(rms), crest: decibels(peak / rms) };
}

test("the light kernel's sound of the settled eleven is the auditor's within 0.1 dB", () => {
  for (const [id, [openRms, openCrest, closedRms]] of Object.entries(AUDITED)) {
    const { sound, compiledVehicle } = vehicle(id);
    const rpm = 0.9 * compiledVehicle.powertrain.redlineRpm;
    const open = level(steady(sound, 3, rpm, 1).subarray(rate));
    const closed = level(steady(sound, 3, rpm, 0).subarray(rate));
    assert.ok(Math.abs(open.rms - openRms) <= 0.1, `${id} open: ${open.rms} dB against ${openRms}`);
    assert.ok(Math.abs(open.crest - openCrest) <= 0.1, `${id} open: crest ${open.crest} dB against ${openCrest}`);
    assert.ok(Math.abs(closed.rms - closedRms) <= 0.1, `${id} closed: ${closed.rms} dB against ${closedRms}`);
  }
});

test('the light kernel reads the settled sounds as tubes of one diameter, two tubes meeting alone as one', () => {
  for (const [id, [diameter, ...tubes]] of Object.entries(READ)) {
    const read = lightExhaust(vehicle(id).sound);
    assert.equal(Math.round(read.diameter * 1000), diameter, id);
    const end = (junction, valveOrMouth) => (junction === null ? valveOrMouth : junction);
    assert.deepEqual(
      read.tubes.map(({ from, to, length }) => `${end(from, 'v')}>${end(to, 'm')} ${Math.round(length * 100)}`),
      tubes,
      id,
    );
    const ends = read.tubes.flatMap(({ from, to }) => [from, to]).filter((junction) => junction !== null);
    assert.equal(read.junctions, new Set(ends).size, id);
  }
});

test('the light kernel reads neither a pipe’s diameter nor its wool', () => {
  for (const { sound, compiledVehicle } of vehicles) {
    const pipes = sound.exhaust.pipes.map(({ from, to, length, diameter }) => ({
      from,
      to,
      length,
      diameter: 2 * diameter,
    }));
    const other = { ...sound, exhaust: { ...sound.exhaust, pipes } };
    const rpm = 0.9 * compiledVehicle.powertrain.redlineRpm;
    assert.deepEqual(steady(sound, 0.25, rpm, 1), steady(other, 0.25, rpm, 1), compiledVehicle.id);
  }
});

test('the light kernel starts silent and renders finite sound, open, closed and with the fuel cut', () => {
  for (const { sound, compiledVehicle } of vehicles) {
    const id = compiledVehicle.id;
    const { idleRpm, redlineRpm } = compiledVehicle.powertrain;
    const rpm = (idleRpm + redlineRpm) / 2;
    for (const [opening, burns] of [
      [1, true],
      [0, true],
      [0, false],
    ]) {
      const sounded = steady(sound, 0.25, rpm, opening, { quantum: 128, burns });
      const at = `${id} at ${opening} ${burns ? 'burning' : 'cut'}`;
      assert.equal(sounded[0], 0, `${at} does not start silent`);
      assert.ok(
        sounded.every((x) => Number.isFinite(x)),
        `${at} is not finite`,
      );
      assert.ok(
        sounded.some((x) => x !== 0),
        `${at} is silent`,
      );
    }
  }
});

test('an afterfire sounds in the light kernel', () => {
  for (const id of Object.keys(AUDITED)) {
    const { sound, compiledVehicle } = vehicle(id);
    const { idleRpm, redlineRpm } = compiledVehicle.powertrain;
    const rpm = (idleRpm + redlineRpm) / 2;
    const plain = level(steady(sound, 1, rpm, 0));
    const fired = level(steady(sound, 1, rpm, 0, { quantum: 1, afterfire: true }));
    assert.ok(fired.rms > plain.rms + 3, `${id}: ${fired.rms} dB afterfiring against ${plain.rms}`);
  }
});

test('the light kernel refuses a rate not above twice its highest shelf', () => {
  const { sound } = vehicles[0];
  assert.throws(() => new ExhaustLight(sound, 20480, 0.025), RangeError);
});

/**
 * About 0.75 s of whole 128-sample quanta: opening to redline; the fuel cut at 1.04 times redline, fully open; then
 * closed at the middle of the revs with an afterfire asked before every sample, so at every firing.
 */
const SEGMENTS = [
  { samples: 12032, from: 'idle', to: 'redline', opening: 1, burns: true, afterfire: false },
  { samples: 12032, from: 'cut', to: 'cut', opening: 1, burns: false, afterfire: false },
  { samples: 12032, from: 'middle', to: 'middle', opening: 0, burns: true, afterfire: true },
];

/** The segments through a vehicle's kernel, `quantum` samples a call but one a call while afterfires are asked. */
function drive({ sound, compiledVehicle }, quantum) {
  const { idleRpm, redlineRpm } = compiledVehicle.powertrain;
  const speeds = { idle: idleRpm, redline: redlineRpm, cut: 1.04 * redlineRpm, middle: (idleRpm + redlineRpm) / 2 };
  const kernel = new ExhaustLight(sound, rate, 0.025);
  const out = new Float64Array(SEGMENTS.reduce((sum, { samples }) => sum + samples, 0));
  let offset = 0;
  for (const { samples, from, to, opening, burns, afterfire } of SEGMENTS) {
    const rpm = Float64Array.from(
      { length: samples },
      (_, n) => speeds[from] + ((speeds[to] - speeds[from]) * n) / samples,
    );
    const open = new Float64Array(samples).fill(opening);
    const count = afterfire ? 1 : quantum;
    for (let n = 0; n < samples; n += count) {
      if (afterfire) kernel.afterfire();
      kernel.render(out, offset + n, count, rpm.subarray(n, n + count), open.subarray(n, n + count), burns);
    }
    offset += samples;
  }
  return out;
}

test('the light kernel renders the same sound one sample at a time as 128 at a time', () => {
  for (const vehicle of vehicles) {
    const single = drive(vehicle, 1),
      quanta = drive(vehicle, 128);
    const differs = single.findIndex((value, n) => value !== quanta[n]);
    assert.equal(differs, -1, `${vehicle.compiledVehicle.id} differs at sample ${differs}`);
  }
});
