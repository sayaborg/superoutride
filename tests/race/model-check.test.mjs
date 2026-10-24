import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import { compilePlanPath } from '../../src/course/geometry/plan-path.js';
import { Profile } from '../../src/course/geometry/profile.js';
import { createVehicle, updateVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createSteeringRule, driverSteering } from '../../src/vehicle/steering-rule.js';
import { createVehicleLimits } from '../../src/vehicle/vehicle-limits.js';
import { createPlannedInput, PLANNED_DRIVER, plannedPedals, plannedSteering } from '../../src/race/planned-driver.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { wrapAngle } from '../../src/core/math.js';

// The plan's model against the mechanics, for each catalog vehicle on a flat reference surface of unit grip and no
// rolling resistance: a steady 100 m circle at the plan's cornering speed, and a straight full stop from 30 m/s. Each
// drives as planned drivers do, with wheel slip protection on both sides whatever the vehicle's own `wheelSlip`.
const content = await readDeliveredContent();
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const reference = Object.freeze({ id: 'REFERENCE', gripFactor: 1, rollingResistance: 0 });
const PROTECTED = Object.freeze({ drive: true, brake: true });
const UTILIZATION = 0.9,
  RADIUS = 100,
  TOLERANCE = 0.05;

function flatWorld() {
  const plan = compilePlanPath({ x: 0, z: -10000, heading: 0 }, [{ kind: 'straight', length: 20000 }]);
  const coordinates = createPlanCoordinateReader(plan.segments, plan.length, (_s, out) => {
    out.left = -5000;
    out.right = 5000;
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

for (const entry of definitions.vehicles) {
  const model = createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
  const limits = createVehicleLimits(model);
  const id = entry.compiledVehicle.id;

  test(`${id} holds a 100 m circle at the plan's cornering speed`, () => {
    const world = flatWorld();
    const steering = driverSteering(createSteeringRule('center', UTILIZATION), model, PROTECTED);
    const planned = limits.steadySpeed(1 / RADIUS, 0, 0, 1, 0, UTILIZATION);
    const car = createVehicle(model, world, { s: 10000, l: 0, initialSpeed: planned });
    // The circle's centre lies to the right of the start, so the path turns right.
    const cx = car.x + RADIUS * Math.cos(car.yaw),
      cz = car.z - RADIUS * Math.sin(car.yaw);
    const input = createPlannedInput();
    let speed = 0,
      radius = 0,
      samples = 0;
    for (let tick = 0; tick < 20 / SIM_DT; tick++) {
      const distance = Math.hypot(car.x - cx, car.z - cz);
      const travel = car.yaw + Math.atan2(car.lateralSpeed, car.longitudinalSpeed);
      const tangent = Math.atan2(car.z - cz, -(car.x - cx));
      const v = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
      input.steering = plannedSteering(
        model,
        steering,
        car,
        1,
        1 / RADIUS,
        RADIUS - distance,
        wrapAngle(travel - tangent),
      );
      plannedPedals(model, limits, car, (planned - v) / PLANNED_DRIVER.speedSeconds, 0, input);
      updateVehicle(world, car, model, input, steering);
      if (tick * SIM_DT >= 8) {
        speed += v;
        radius += distance;
        samples++;
      }
    }
    speed /= samples;
    radius /= samples;
    assert.ok(Math.abs(radius / RADIUS - 1) <= TOLERANCE, `${id}: radius ${radius.toFixed(1)} m`);
    const lateral = speed ** 2 / radius,
      plan = planned ** 2 / RADIUS;
    assert.ok(
      Math.abs(lateral / plan - 1) <= TOLERANCE,
      `${id}: lateral ${lateral.toFixed(2)} m/s² against the plan's ${plan.toFixed(2)}`,
    );
  });

  test(`${id} stops from 30 m/s within the plan's braking distance`, () => {
    const world = flatWorld();
    const steering = driverSteering(createSteeringRule('center', 1), model, PROTECTED);
    const car = createVehicle(model, world, { s: 10000, l: 0, initialSpeed: 30 });
    // Measured from the moment the brake actuator is fully applied, as the plan's braking has no actuator response.
    let start = null,
      from = 0;
    for (let tick = 0; tick < 20 / SIM_DT && car.speed > 0.05; tick++) {
      updateVehicle(world, car, model, { steering: 0, throttle: 0, brake: 1 }, steering);
      if (start === null && car.actuator.brake >= 1) [start, from] = [car.course.s, car.speed];
    }
    const distance = car.course.s - start;
    let plan = 0;
    const dv = 0.01;
    for (let v = from; v > 0; v -= dv)
      plan += (v * dv * limits.inertia) / (limits.brakeLimit(1, 1, 1, 0) + limits.drag(v));
    assert.ok(
      Math.abs(distance / plan - 1) <= TOLERANCE,
      `${id}: stopped in ${distance.toFixed(2)} m against the plan's ${plan.toFixed(2)} m`,
    );
  });
}
