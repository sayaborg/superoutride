import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { ExhaustLight, straightened } from '../../src/audio/exhaust-light.js';

const content = await readDeliveredContent();
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const vehicle = (id) => vehicles.find(({ compiledVehicle }) => compiledVehicle.id === id);
const rate = 48000;

/**
 * The auditor's values for the eleven settled sounds (2026-11-23): at 90 % of the redline, burning, the kernel's own
 * sound over its second and third seconds, rendered 480 samples at a time: fully open, its level and its peak over its
 * level, and fully closed, its level (dB).
 */
const AUDITED = {
  FERRARI_F40_1988: [-63.66, 8.89, -59.69],
  PORSCHE_959_1987: [-59.98, 7.58, -61.2],
  RX_7_TURBO_II_1987: [-67.75, 6.63, -68.27],
  PORSCHE_928_S4_1987: [-67.29, 12.31, -72.29],
  XR600R_1985: [-66.37, 6.52, -71.53],
  TESTAROSSA: [-61.99, 8.37, -75.25],
  NSR500_1984: [-65.84, 6.83, -75.81],
  TURBO_ESPRIT_1984: [-72.1, 9.29, -69.94],
  COUNTACH_5000_QV_1985: [-56.82, 11.07, -58.53],
  '911_TURBO_3_3_1986': [-68.41, 9.7, -71.4],
  FERRARI_GTO_1984: [-69.63, 7.73, -62.25],
};

/** The pipes each settled sound reads as straight ways through: length (m), diameter and diameter read (mm). */
const BOXES = {
  FERRARI_F40_1988: [
    [0.12, 150, 62],
    [0.12, 150, 62],
    [0.26, 311, 102],
  ],
  PORSCHE_959_1987: [
    [0.12, 150, 64],
    [0.12, 150, 64],
    [0.7, 209, 90],
  ],
  RX_7_TURBO_II_1987: [
    [0.12, 150, 62],
    [0.46, 270, 78],
  ],
  PORSCHE_928_S4_1987: [
    [0.52, 165, 59],
    [0.42, 135, 59],
    [0.52, 165, 59],
    [0.42, 135, 59],
    [0.54, 168, 89],
  ],
  XR600R_1985: [
    [0.38, 132, 46],
    [0.18, 110, 46],
  ],
  TESTAROSSA: [
    [0.56, 186, 74],
    [0.48, 190, 84],
    [0.56, 186, 74],
    [0.48, 190, 84],
  ],
  NSR500_1984: [
    [0.46, 86, 38],
    [0.46, 86, 38],
    [0.46, 86, 38],
    [0.46, 86, 38],
  ],
  TURBO_ESPRIT_1984: [
    [0.12, 150, 58],
    [0.8, 150, 73],
  ],
  COUNTACH_5000_QV_1985: [
    [0.44, 180, 81],
    [0.38, 171, 97],
    [0.44, 180, 81],
    [0.38, 171, 97],
  ],
  '911_TURBO_3_3_1986': [
    [0.12, 150, 68],
    [0.42, 265, 89],
  ],
  FERRARI_GTO_1984: [
    [0.12, 150, 63],
    [0.12, 150, 63],
    [0.38, 253, 103],
  ],
};

/** `seconds` of a sound at a steady `rpm` and `opening`, burning, `quantum` samples a call; `afterfire` asks one a call. */
function steady(sound, seconds, rpm, opening, { quantum = 480, afterfire = false } = {}) {
  const kernel = new ExhaustLight(sound, rate, 0.025);
  const out = new Float64Array(Math.round(seconds * rate));
  const speeds = new Float64Array(quantum).fill(rpm);
  const openings = new Float64Array(quantum).fill(opening);
  for (let n = 0; n < out.length; n += quantum) {
    if (afterfire) kernel.afterfire();
    kernel.render(out, n, Math.min(quantum, out.length - n), speeds, openings, true);
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

test('the light kernel reads the settled sounds without their boxes, keeping every length', () => {
  for (const [id, boxes] of Object.entries(BOXES)) {
    const { sound } = vehicle(id);
    const read = straightened(sound).exhaust.pipes;
    assert.equal(read.length, sound.exhaust.pipes.length, id);
    const changed = sound.exhaust.pipes.flatMap((pipe, j) => {
      assert.equal(read[j].length, pipe.length, `${id} pipe ${j}'s length`);
      assert.equal(read[j].wool, undefined, `${id} pipe ${j}'s wool`);
      const mm = (diameter) => Math.round(diameter * 1000);
      return read[j].diameter === pipe.diameter ? [] : [[pipe.length, mm(pipe.diameter), mm(read[j].diameter)]];
    });
    assert.deepEqual(changed, boxes, id);
  }
});

test('the light kernel starts silent and renders finite sound, the same one at a time as 128 at a time', () => {
  for (const { sound, compiledVehicle } of vehicles) {
    const id = compiledVehicle.id;
    const { idleRpm, redlineRpm } = compiledVehicle.powertrain;
    const rpm = (idleRpm + redlineRpm) / 2;
    const single = steady(sound, 0.25, rpm, 1, { quantum: 1 });
    assert.equal(single[0], 0, `${id} does not start silent`);
    assert.ok(
      single.every((x) => Number.isFinite(x)),
      `${id} is not finite`,
    );
    assert.ok(
      single.some((x) => x !== 0),
      `${id} is silent`,
    );
    const quanta = steady(sound, 0.25, rpm, 1, { quantum: 128 });
    const differs = single.findIndex((x, n) => x !== quanta[n]);
    assert.equal(differs, -1, `${id} differs at sample ${differs}`);
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

test('the light kernel does not read wool', () => {
  for (const { sound, compiledVehicle } of vehicles) {
    if (!sound.exhaust.pipes.some(({ wool }) => wool !== undefined)) continue;
    const pipes = sound.exhaust.pipes.map(({ from, to, length, diameter }) => ({ from, to, length, diameter }));
    const bare = { ...sound, exhaust: { ...sound.exhaust, pipes } };
    const rpm = 0.9 * compiledVehicle.powertrain.redlineRpm;
    const lined = steady(sound, 0.25, rpm, 1);
    const unlined = steady(bare, 0.25, rpm, 1);
    assert.deepEqual(lined, unlined, compiledVehicle.id);
  }
});
