import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { fullSteeringYawRate } from '../../src/vehicle/physics/vehicle-physics.js';
import { createSteeringRule, driverSteering } from '../../src/vehicle/steering-rule.js';
import { plannedSteering } from '../../src/race/planned-driver.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

// A planned driver reads the steering rule's definition backwards, the loads no part of it (K, 2026-11-17).
const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const entry = definitions.vehicles.find((vehicle) => vehicle.compiledVehicle.id === 'TESTAROSSA');
const model = createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
const steering = driverSteering(createSteeringRule('center', 0.9), model, { drive: true, brake: true });
const { staticLoad } = model.compiledVehicle.frontStation.suspension;

/** A vehicle at 40 m/s, sliding 0.5 m/s sideways, its front axle carrying `factor` times its static load. */
const car = (factor) => ({
  longitudinalSpeed: 40,
  lateralSpeed: 0.5,
  tires: { front: { load: factor * staticLoad }, rear: { load: staticLoad } },
});

test('the same path asks the same input whatever the front load', () => {
  for (const [curvature, lateralError, headingError] of [
    [1 / 400, 0, 0],
    [-1 / 250, 0.6, -0.02],
    [1 / 1000, -1.5, 0.01],
  ]) {
    const inputs = [0.8, 1, 1.3].map((factor) =>
      plannedSteering(model, steering, car(factor), 1, curvature, lateralError, headingError),
    );
    assert.ok(Math.abs(inputs[1]) > 0.05 && Math.abs(inputs[1]) < 1, `${inputs[1]}`);
    assert.equal(inputs[0], inputs[1]);
    assert.equal(inputs[2], inputs[1]);
  }
});

test('the input is the yaw rate the path asks over the yaw rate full input asks', () => {
  const read = car(0.8);
  const speed = Math.hypot(read.longitudinalSpeed, read.lateralSpeed);
  const full = fullSteeringYawRate(model, steering, 1, read.longitudinalSpeed, read.lateralSpeed);
  const input = plannedSteering(model, steering, read, 1, 1 / 400, 0, 0);
  assert.ok(Math.abs(input - speed / 400 / full) < 1e-12);
  // A path tighter than full input turns asks full input.
  assert.equal(plannedSteering(model, steering, read, 1, 1 / 20, 0, 0), 1);
});
