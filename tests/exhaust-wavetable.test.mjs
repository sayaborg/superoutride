import assert from 'node:assert/strict';
import test from 'node:test';
import { bakeExhaustTables, ExhaustTablePlayer } from '../tools/exhaust-wavetable.mjs';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

test('baked cycles preserve source phase and steady waveform for one, six and twelve cylinders', async () => {
  for (const entry of [VEHICLE_CATALOG[0], VEHICLE_CATALOG[1], VEHICLE_CATALOG[8]]) {
    const { idleRpm, redlineRpm } = entry.profile.powertrain;
    const before = structuredClone(entry.sound);
    const bank = await bakeExhaustTables(entry.sound, {}, idleRpm, redlineRpm);
    assert.deepEqual(entry.sound, before);
    assert.equal(bank.tables.length, 85);
    assert.ok(bank.tables.every((table) => table.every((x) => Number.isFinite(x) && Math.abs(x) < 0.65)));
    const rpm = idleRpm + (redlineRpm - idleRpm) / 2;
    const source = new ExhaustWaveguide(entry.sound, 96000, false);
    for (let i = 0; i < 192000; i++) source.sample(rpm, 1);
    const table = bank.tables[8 * 5 + 4];
    let error = 0,
      power = 0;
    for (let i = 0; i < 9600; i++) {
      const expected = source.sample(rpm, 1);
      const position = source.cyclePhase * table.length;
      const index = Math.floor(position),
        fraction = position - index;
      const actual = table[index] + fraction * (table[(index + 1) % table.length] - table[index]);
      error += (actual - expected) ** 2;
      power += expected ** 2;
    }
    assert.ok(error / power < 0.02, `${entry.profile.id}: normalized capture error ${error / power}`);
    for (const rate of [88200, 96000]) {
      const player = new ExhaustTablePlayer(bank, rate);
      let closed = 0,
        open = 0;
      for (let i = 0; i < rate; i++) {
        const value = player.sample(rpm, 0);
        if (i > rate / 2) closed += value ** 2;
      }
      for (let i = 0; i < rate; i++) {
        const value = player.sample(rpm, 1);
        if (i > rate / 2) open += value ** 2;
      }
      assert.ok(open > closed * 1.2, entry.profile.id);
      for (let i = 0; i < rate; i++) {
        const value = player.sample(idleRpm + ((redlineRpm - idleRpm) * i) / rate, i / rate);
        assert.ok(Number.isFinite(value) && Math.abs(value) < 0.65);
      }
    }
  }
});

test('offline generation can stop between captures without completing a bank', async () => {
  const entry = VEHICLE_CATALOG[8];
  let captures = 0;
  await assert.rejects(
    bakeExhaustTables(entry.sound, {}, 1000, 6000, () => {
      captures++;
      throw new Error('cancelled');
    }),
    /cancelled/,
  );
  assert.equal(captures, 1);
});
