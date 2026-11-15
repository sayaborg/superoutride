import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { TIRE_GAUGE_COLORS, tireGaugeStep } from '../../src/image/tire-gauge.js';
import { tachometerRamp } from '../../src/image/tachometer.js';
import { drivingTuningItems, stepDrivingTuning } from '../../src/shell/driving-tuning.js';
import { compileDrivingDocument } from '../../src/vehicle/definition-document.js';

const json = async (path) => JSON.parse(await readFile(new URL(`../../content/${path}`, import.meta.url), 'utf8'));
const driving = await json('driving/default.json');
const own = await json('vehicles/MCLAREN_MP4_4.json');
const plain = await json('vehicles/TESTAROSSA.json');

test('the tire gauge is green with no contact sliding, yellow with half of it and red with all of it', () => {
  const color = (sliding) => TIRE_GAUGE_COLORS[tireGaugeStep(sliding)];
  assert.equal(color(0), tachometerRamp('GREEN')[2]);
  assert.equal(color(0.5), tachometerRamp('YELLOW')[2]);
  assert.equal(color(1), tachometerRamp('RED')[2]);
  assert.equal(tireGaugeStep(1.5), TIRE_GAUGE_COLORS.length - 1);
  let previous = 0;
  for (let k = 0; k <= 100; k++) {
    const step = tireGaugeStep(k / 100);
    assert.ok(step >= previous);
    previous = step;
  }
});

test('DEV tunes the tire by its grip, stiffness and sliding ratio, the game-wide load sensitivity and the balance', () => {
  assert.deepEqual(
    drivingTuningItems('TIRES').map(({ id }) => id),
    ['G', 'C', 'SR', 'LS', 'BAL'],
  );
  // A vehicle with its own tire has G, C and SR tuned in its mechanics; LS is always the driving definition's.
  const tuned = ['G', 'C', 'SR', 'LS'].reduce((documents, id) => stepDrivingTuning(documents, id, 1), {
    driving,
    mechanics: own,
  });
  assert.deepEqual(tuned.mechanics.tire, { grip: 1.55, stiffness: 91, slidingRatio: 0.91 });
  assert.deepEqual(tuned.driving.tire, driving.tire);
  assert.equal(tuned.driving.tireLoadSensitivity, 0.16);
  // A vehicle without one has them tuned in the driving definition, which admits the result.
  const game = ['G', 'C'].reduce((documents, id) => stepDrivingTuning(documents, id, 1), {
    driving,
    mechanics: plain,
  });
  assert.deepEqual(game.driving.tire, { grip: 2.55, stiffness: 41, slidingRatio: 1 });
  const compiled = compileDrivingDocument(game.driving, 'driving/default.json', null);
  assert.ok(compiled.ok, JSON.stringify(compiled));
  assert.equal(compiled.value.compiledDriving.tire.grip, 2.55);
  assert.equal(compiled.value.compiledDriving.tireLoadSensitivity, 0.15);
});

test("DEV's BAL steps the player vehicle's grip balance in its mechanics, from 0 where it gives none", () => {
  let documents = { driving, mechanics: plain };
  documents = stepDrivingTuning(documents, 'BAL', 1);
  assert.equal(documents.mechanics.gripBalance, 0.01);
  assert.equal(documents.driving, driving);
  documents = stepDrivingTuning(stepDrivingTuning(documents, 'BAL', -1), 'BAL', -1);
  assert.equal(documents.mechanics.gripBalance, -0.01);
  // The grid runs from -0.10 to +0.20 and wraps.
  assert.equal(
    stepDrivingTuning({ driving, mechanics: { ...plain, gripBalance: 0.2 } }, 'BAL', 1).mechanics.gripBalance,
    -0.1,
  );
});
