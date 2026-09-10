import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as engine from '../dist/physics/automatic-powertrain.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

const fields = ['engineRpm', 'engineTorqueNewtonMeters', 'gear', 'outputDriveTorque'].sort();
test('M9.25 every engine directly samples its authored curve through throttle, ratios and limiter', () => {
  for (const {
    profile: { powertrain: p },
  } of VEHICLE_CATALOG) {
    for (let gear = 1; gear <= p.gearRatios.length; gear++)
      for (const rpm of [0, p.idleRpm, 4000, p.upshiftRpm, p.redlineRpm * 1.2])
        for (const pedal of [0, 0.25, 1]) {
          const omega = (rpm * 2 * Math.PI) / (60 * p.gearRatios[gear - 1] * p.finalDriveRatio);
          const s = engine.createAutomaticPowertrainState(p, omega);
          s.gear = gear;
          engine.updateAutomaticPowertrain(s, p, omega, pedal, 1 / 120);
          assert.deepEqual(Object.keys(s).sort(), fields);
          assert.equal(s.engineTorqueNewtonMeters, engine.sampleEngineTorque(p, s.engineRpm));
          assert.equal(
            s.outputDriveTorque,
            pedal *
              s.engineTorqueNewtonMeters *
              (p.gearRatios[s.gear - 1] * p.finalDriveRatio) *
              p.efficiency *
              engine.engineRevLimiterScale(p, s.engineRpm),
          );
        }
  }
});
test('M9.25 same-engine pinned direct-powertrain traces equal the former multiplier-one mechanics exactly', async () => {
  const path = process.env.HOT_PATH_BASELINE_BUILD;
  if (process.env.CI) assert.ok(path);
  const before = path ? await import(pathToFileURL(resolve(path, 'physics/automatic-powertrain.js')).href) : engine;
  for (const {
    profile: { powertrain: p },
  } of VEHICLE_CATALOG) {
    const a = engine.createAutomaticPowertrainState(p),
      b = before.createAutomaticPowertrainState(p);
    for (let tick = 0; tick < 500; tick++) {
      const omega = (tick < 250 ? tick : 500 - tick) * 2,
        pedal = (tick % 7) / 6;
      assert.equal(
        engine.updateAutomaticPowertrain(a, p, omega, pedal, 1 / 120),
        before.updateAutomaticPowertrain(b, p, omega, pedal, 1 / 120),
      );
      for (const key of fields) assert.equal(a[key], b[key], key);
    }
  }
});
test('M9.25 multiplier exports, source state, key and browser module are removed', async () => {
  assert.equal('setEngineTorqueMultiplier' in engine, false);
  assert.equal('assertEngineTorqueMultiplier' in engine, false);
  async function scan(url) {
    for (const item of await readdir(url, { withFileTypes: true })) {
      const path = new URL(item.name + (item.isDirectory() ? '/' : ''), url);
      if (item.isDirectory()) await scan(path);
      else if (item.name.endsWith('.ts'))
        assert.doesNotMatch(
          await readFile(path, 'utf8'),
          /engineTorqueMultiplier|enginePowerSelector|engine-power-controls|KeyK/,
          path.pathname,
        );
    }
  }
  await scan(new URL('../src/', import.meta.url));
  await assert.rejects(readFile(new URL('../src/browser/engine-power-controls.ts', import.meta.url)), {
    code: 'ENOENT',
  });
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\bENG\b|\bPWR\b/);
});

test('M9.25 new browser tires retain force/torque budgets across all-nine terrain maneuvers without certifying yaw or wheel lift', async () => {
  const { runTerrainProbe, TERRAIN_CASES } = await import('../tools/torque-protection-terrain-probe.mjs');
  const summaries = [];
  for (const entry of VEHICLE_CATALOG)
    for (const name of [
      'lowGripDrive',
      'lowGripBrake',
      'uphillDrive',
      'downhillBrake',
      'gripDropBrake',
      'turnDrive',
      'turnBrake',
      'lowGripReversal',
    ]) {
      const r = runTerrainProbe(entry, { ...TERRAIN_CASES[name], hz: 120 });
      assert.equal(r.error, null, JSON.stringify(r));
      assert.equal(r.completed, true);
      assert.equal(r.overturned, false);
      assert.ok(r.torqueBudgetViolation < 1e-7);
      assert.ok(r.maxEllipse <= 1 + 1e-10);
      assert.equal(r.maxPositiveSlipPower, 0);
      assert.equal(r.zeroLoadForceViolation, 0);
      assert.equal(r.infeasibleNonzeroTorque, 0);
      summaries.push({
        id: entry.profile.id,
        name,
        maxBeta: r.maxAbsMovingBeta,
        frontLift: r.frontLiftTime,
        rearLift: r.rearLiftTime,
      });
    }
  console.log('M9.25 NEW DEFAULT MANEUVERS', JSON.stringify(summaries));
});
