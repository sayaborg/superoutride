import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import { compilePlanPath } from '../../src/course/geometry/plan-path.js';
import { Profile } from '../../src/course/geometry/profile.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { createVehicle, updateVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { VEHICLE_GRAVITY } from '../../src/vehicle/physics/vehicle-state.js';
import { createSteeringRule, driverSteering } from '../../src/vehicle/steering-rule.js';
import { createVehicleLimits } from '../../src/vehicle/vehicle-limits.js';
import { createPlannedInput, plannedPedals } from '../../src/race/planned-driver.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

// A vehicle's grip balance (K, 2026-11-16) on a flat reference surface of unit grip and no rolling resistance. The
// balanced vehicles are made here alone; no catalog vehicle gives one.
const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const reference = Object.freeze({ id: 'REFERENCE', gripFactor: 1, rollingResistance: 0 });
const testarossa = definitions.vehicles.find((entry) => entry.compiledVehicle.id === 'TESTAROSSA');

function flatWorld() {
  const plan = compilePlanPath({ x: 0, z: -20000, heading: 0 }, [{ kind: 'straight', length: 40000 }]);
  const coordinates = createPlanCoordinateReader(plan.segments, plan.length, (_s, out) => {
    out.left = -20000;
    out.right = 20000;
    return out;
  });
  const end = coordinates.domain.end;
  const height = new Profile(end, [
    { s: 0, y: 0, curveLength: 0 },
    { s: end, y: 0, curveLength: 0 },
  ]);
  return {
    extent: { start: coordinates.domain.start, end, terminal: end },
    coordinates,
    height,
    surfaces: { sample: () => reference },
  };
}

/** TESTAROSSA's definition with its mechanics given `gripBalance` (none when undefined). */
function withBalance(gripBalance) {
  const mechanics = { ...testarossa.mechanics, ...(gripBalance === undefined ? {} : { gripBalance }) };
  const admitted = compileVehicleMechanicsDocument(mechanics, 'TESTAROSSA', 'TESTAROSSA.json', null);
  assert.ok(admitted.ok, JSON.stringify(admitted));
  return { ...testarossa, mechanics: admitted.value.source, compiledVehicle: admitted.value.compiledVehicle };
}
const modelOf = (gripBalance) =>
  createVehicleModel(createRunVehicle(withBalance(gripBalance), definitions.driving), SIM_DT);

/**
 * Full steering input at `kmh` held by the pedals, under the planned drivers' rule (the centre at 100 %): the tires'
 * sliding fractions after 8 s.
 */
function fullSteer(model, kmh) {
  const world = flatWorld();
  const limits = createVehicleLimits(model);
  const steering = driverSteering(createSteeringRule('center', 1), model, { drive: true, brake: true });
  const v = kmh / 3.6;
  const car = createVehicle(model, world, { s: 20000, l: 0, initialSpeed: v });
  const input = createPlannedInput();
  for (let tick = 0; tick < 8 / SIM_DT; tick++) {
    input.steering = Math.min(1, (tick * SIM_DT) / 4);
    plannedPedals(model, limits, car, (v - Math.hypot(car.longitudinalSpeed, car.lateralSpeed)) / 0.5, 0, input);
    updateVehicle(world, car, model, input, steering);
  }
  return { front: car.tires.front.slidingFraction, rear: car.tires.rear.slidingFraction };
}

test('the grip balance divides the tire grip between the axles and leaves its stiffness and sliding ratio', () => {
  const model = modelOf(0.1);
  const { tire } = definitions.driving.compiledDriving;
  assert.deepEqual(model.tires.front, { ...tire, grip: tire.grip * 0.9 });
  assert.deepEqual(model.tires.rear, { ...tire, grip: tire.grip * 1.1 });
  for (const outside of [0.5, -0.5, 0.7])
    assert.equal(
      compileVehicleMechanicsDocument({ ...testarossa.mechanics, gripBalance: outside }, 'T', 'T', null).ok,
      false,
    );
});

test('a grip balance of 0 drives exactly as no grip balance', () => {
  const states = [undefined, 0].map((balance) => {
    const model = modelOf(balance);
    const world = flatWorld();
    const steering = driverSteering(definitions.driving.compiledDriving.defaultSteering, model);
    const car = createVehicle(model, world, { s: 20000, l: 0, initialSpeed: 30 });
    for (let tick = 0; tick < 6 / SIM_DT; tick++)
      updateVehicle(
        world,
        car,
        model,
        { steering: tick < 180 ? 1 : -0.5, throttle: tick > 120 ? 1 : 0, brake: 0 },
        steering,
      );
    return JSON.stringify(car);
  });
  assert.equal(states[0], states[1]);
});

test('at grip balance 0.1 the front tires reach the limit first and the front axle bounds the lateral limit', () => {
  const model = modelOf(0.1);
  const limits = createVehicleLimits(model);
  assert.ok(Math.abs(limits.lateralLimit(1, 1, 1, 0) / (VEHICLE_GRAVITY * model.tires.front.grip) - 1) < 1e-12);
  const { front, rear } = fullSteer(model, 120);
  assert.ok(front > 0.97 && front > rear + 0.1, `front ${front}, rear ${rear}`);
});

test('at grip balance -0.1 full steering input takes the rear tires to the limit first', () => {
  const model = modelOf(-0.1);
  const limits = createVehicleLimits(model);
  assert.ok(Math.abs(limits.lateralLimit(1, 1, 1, 0) / (VEHICLE_GRAVITY * model.tires.rear.grip) - 1) < 1e-12);
  const { front, rear } = fullSteer(model, 120);
  assert.ok(rear > 0.97 && rear > front, `front ${front}, rear ${rear}`);
});
