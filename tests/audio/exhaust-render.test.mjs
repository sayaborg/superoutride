import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { EXHAUST_RATE_DIVISORS, ExhaustRenderer } from '../../src/audio/exhaust-rate.js';
import { DEFAULT_AUDIO_SETTINGS } from '../../src/audio/audio-defaults.js';

const content = await readDeliveredContent();
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const rate = 48000;
/**
 * About 0.75 s of whole 128-sample quanta: opening to redline; the fuel cut at 1.04 times redline, fully open; then
 * closed at the middle of the revs with an afterfire asked before every sample, so at every firing.
 */
const segments = [
  { samples: 12032, from: 'idle', to: 'redline', opening: 1, burns: true, afterfire: false },
  { samples: 12032, from: 'cut', to: 'cut', opening: 1, burns: false, afterfire: false },
  { samples: 12032, from: 'middle', to: 'middle', opening: 0, burns: true, afterfire: true },
];
/** The saved values: each vehicle's sound at each divisor, first taken from K's reference kernel of 2026-11-20. */
const VALUES = new URL('./exhaust-render.values.json', import.meta.url);
/** Where every saved sample is taken, as shares of the drive. */
const PICKS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

function drive(vehicle, divisor, quantum) {
  const { idleRpm, redlineRpm } = vehicle.compiledVehicle.powertrain;
  const speeds = { idle: idleRpm, redline: redlineRpm, cut: 1.04 * redlineRpm, middle: (idleRpm + redlineRpm) / 2 };
  const kernel = new ExhaustRenderer(vehicle.sound, rate, divisor, DEFAULT_AUDIO_SETTINGS.control);
  const out = new Float64Array(segments.reduce((sum, { samples }) => sum + samples, 0));
  let offset = 0;
  for (const { samples, from, to, opening, burns, afterfire } of segments) {
    const rpm = Float64Array.from(
      { length: samples },
      (_, n) => speeds[from] + ((speeds[to] - speeds[from]) * n) / samples,
    );
    const open = new Float64Array(samples).fill(opening);
    for (let n = 0; n < samples; n += afterfire ? 1 : quantum) {
      const count = afterfire ? 1 : quantum;
      if (afterfire) kernel.afterfire();
      kernel.render(out, offset + n, count, rpm.subarray(n, n + count), open.subarray(n, n + count), burns);
    }
    offset += samples;
  }
  return out;
}

/** What the saved values keep of a sound: its peak, its energy and a few samples. */
function values(sound) {
  let peak = 0,
    energy = 0;
  for (const x of sound) {
    peak = Math.max(peak, Math.abs(x));
    energy += x * x;
  }
  return { peak, energy, samples: PICKS.map((share) => sound[Math.floor(share * sound.length)]) };
}

const sounds = new Map(
  vehicles.map((vehicle) => [
    vehicle.compiledVehicle.id,
    EXHAUST_RATE_DIVISORS.map((divisor) => ({ divisor, single: drive(vehicle, divisor, 1) })),
  ]),
);

test('the exhaust kernel renders finite samples, the same one at a time as 128 at a time, at every divisor', () => {
  for (const vehicle of vehicles) {
    const id = vehicle.compiledVehicle.id;
    for (const { divisor, single } of sounds.get(id)) {
      const at = `${id} at divisor ${divisor}`;
      assert.ok(
        single.every((value) => Number.isFinite(value)),
        `${at} is not finite`,
      );
      assert.ok(
        single.some((value) => value !== 0),
        `${at} is silent`,
      );
      const quanta = drive(vehicle, divisor, 128);
      const differs = single.findIndex((value, n) => value !== quanta[n]);
      assert.equal(differs, -1, `${at} differs at sample ${differs}`);
    }
  }
});

test("the exhaust kernel's sound is the saved one within rounding", async () => {
  const measured = Object.fromEntries(
    [...sounds].map(([id, rates]) => [id, rates.map(({ single }) => values(single))]),
  );
  // Writing the values again is a decision about the kernel's sound, never a way to make this test pass.
  if (process.env.WRITE_EXHAUST_VALUES === '1') await writeFile(VALUES, `${JSON.stringify(measured, null, 2)}\n`);
  const saved = JSON.parse(await readFile(VALUES, 'utf8'));
  assert.deepEqual(Object.keys(saved), Object.keys(measured));
  for (const [id, rates] of Object.entries(measured))
    rates.forEach(({ peak, energy, samples }, index) => {
      const at = `${id} at divisor ${EXHAUST_RATE_DIVISORS[index]}`;
      const kept = saved[id][index];
      assert.ok(Math.abs(peak - kept.peak) <= 1e-9 * kept.peak, `${at}: peak ${peak} against ${kept.peak}`);
      assert.ok(Math.abs(energy - kept.energy) <= 1e-9 * kept.energy, `${at}: energy ${energy} against ${kept.energy}`);
      samples.forEach((sample, n) =>
        assert.ok(
          Math.abs(sample - kept.samples[n]) <= 1e-9 * kept.peak,
          `${at}: sample ${n} ${sample} against ${kept.samples[n]}`,
        ),
      );
    });
});
