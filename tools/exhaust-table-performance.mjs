import { performance } from 'node:perf_hooks';
import { bakeExhaustTables, ExhaustTablePlayer } from './exhaust-wavetable.mjs';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
const entry = VEHICLE_CATALOG.find(({ profile }) => profile.id === (process.argv[2] ?? 'GOLF_GTI_16V'));
if (!entry) throw new Error('Unknown vehicle');
const started = performance.now();
const bank = await bakeExhaustTables(
  entry.sound,
  {},
  entry.profile.powertrain.idleRpm,
  entry.profile.powertrain.redlineRpm,
);
const bakeMs = performance.now() - started;
const rate = 96000;
const engines = [new ExhaustWaveguide(entry.sound, rate, false), new ExhaustTablePlayer(bank, rate)];
const times = [[], []];
let checksum = 0;
function render(engine) {
  for (let i = 0; i < rate; i++) checksum += engine.sample(3000, 1);
}
for (let warm = 0; warm < 3; warm++) for (const engine of engines) render(engine);
for (let run = 0; run < 7; run++)
  for (const i of run % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now();
    render(engines[i]);
    times[i].push(performance.now() - start);
  }
console.log(
  JSON.stringify(
    {
      note: 'Host kernel timing, not browser/device certification; one audio second with 2x stepping.',
      vehicle: entry.profile.id,
      bakeMs,
      bytes: bank.tables.reduce((sum, table) => sum + table.byteLength, 0),
      simpleMs: times[0].sort((a, b) => a - b)[3],
      tableMs: times[1].sort((a, b) => a - b)[3],
      checksum,
    },
    null,
    2,
  ),
);
