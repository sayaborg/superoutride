import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { ExhaustWaveguide } from '../../src/audio/exhaust-waveguide.js';

const content = await readDeliveredContent();
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const rate = 48000;
// About 0.5 s: opening to redline, closed, then a fuel cut; each segment whole 128-sample quanta.
const segments = [
  { samples: 9600, from: 'idle', to: 'redline', opening: (n) => (n % 2400 < 1200 ? 1 : 0.2), fuelCut: false },
  { samples: 5120, from: 'redline', to: 3500, opening: (n) => n / 5120, fuelCut: false },
  { samples: 9600, from: 4000, to: 3000, opening: () => 0, fuelCut: true },
];

function drive(vehicle, quantum) {
  const { idleRpm, redlineRpm } = vehicle.compiledVehicle.powertrain;
  const speed = (value) => (value === 'idle' ? idleRpm : value === 'redline' ? redlineRpm : value);
  const kernel = new ExhaustWaveguide(vehicle.sound, rate);
  const out = new Float64Array(segments.reduce((sum, { samples }) => sum + samples, 0));
  let offset = 0;
  for (const { samples, from, to, opening, fuelCut } of segments) {
    const rpm = Float64Array.from(
      { length: samples },
      (_, n) => speed(from) + ((speed(to) - speed(from)) * n) / samples,
    );
    const load = Float64Array.from({ length: samples }, (_, n) => opening(n));
    for (let n = 0; n < samples; n += quantum)
      kernel.render(out, offset + n, quantum, rpm.subarray(n, n + quantum), load.subarray(n, n + quantum), fuelCut);
    offset += samples;
  }
  return out;
}

test('the exhaust kernel renders the same samples one at a time as 128 at a time', () => {
  for (const vehicle of vehicles) {
    const single = drive(vehicle, 1),
      quanta = drive(vehicle, 128);
    assert.ok(
      single.some((value) => value !== 0),
      `${vehicle.compiledVehicle.id} is silent`,
    );
    const differs = single.findIndex((value, n) => value !== quanta[n]);
    assert.equal(differs, -1, `${vehicle.compiledVehicle.id} differs at sample ${differs}`);
  }
});
