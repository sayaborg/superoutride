import type { CompiledVehicleDefinition } from '../../src/vehicle/definition-document.js';
import type { CompiledDrivingDefinition } from '../../src/vehicle/compiled-driving-definition.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import { compilePlanPath } from '../../src/course/geometry/plan-path.js';
import { Profile } from '../../src/course/geometry/profile.js';
import { createVehicle, updateVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { sampleEngineTorque } from '../../src/vehicle/physics/automatic-powertrain.js';
import { createSteeringRule, driverSteering } from '../../src/vehicle/steering-rule.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

/** Flat 60 km, dry unit-grip asphalt, no wind, no other actors; ordinary product physics and controls. */
export function racingValidationWorld() {
  const plan = compilePlanPath({ x: 0, z: 0, heading: 0 }, [{ kind: 'straight', length: 60000 }]);
  const coordinates = createPlanCoordinateReader(plan.segments, plan.length, (_s, out) => {
    out.left = -100;
    out.right = 100;
    return out;
  });
  const height = new Profile(plan.length, [
    { s: 0, y: 0, curveLength: 0 },
    { s: plan.length, y: 0, curveLength: 0 },
  ]);
  const surface = Object.freeze({ id: 'ASPHALT', gripFactor: 1, rollingResistance: 0.014 });
  return { extent: coordinates.domain, coordinates, height, surfaces: { sample: () => surface } };
}

/** Reproducible acceleration, wheel/road power balance, full braking and low-speed restart through the solver. */
export function measureRacingVehicle(
  entry: CompiledVehicleDefinition,
  driving: CompiledDrivingDefinition,
  seconds = 240,
) {
  const model = createVehicleModel(createRunVehicle(entry, driving), SIM_DT);
  const world = racingValidationWorld();
  const steering = driverSteering(driving.compiledDriving.defaultSteering, model);
  const vehicle = createVehicle(model, world, { s: 100, l: 0, initialSpeed: 0 });
  const p = model.compiledVehicle.powertrain,
    radius = model.compiledVehicle.rearStation.rollingRadius;
  const targets: Record<string, { time: number; distance: number }> = {};
  const shifts: { time: number; kph: number; from: number; to: number; fromRpm: number; toRpm: number }[] = [];
  const samples = [];
  let gear = 1;
  let minimumEndSpeed = Infinity,
    maximumEndSpeed = 0;
  const checkFinite = () => {
    for (const value of [
      vehicle.x,
      vehicle.y,
      vehicle.z,
      vehicle.speed,
      vehicle.yaw,
      vehicle.pitch,
      vehicle.longitudinalAcceleration,
      vehicle.lateralAcceleration,
      vehicle.powertrain.engineRpm,
      vehicle.frontWheelOmega,
      vehicle.rearWheelOmega,
    ])
      if (!Number.isFinite(value)) throw new Error(`${entry.compiledVehicle.id}: non-finite driving state`);
  };
  for (let tick = 0; tick < seconds / SIM_DT; tick++) {
    updateVehicle(world, vehicle, model, { steering: 0, throttle: 1, brake: 0 }, steering);
    checkFinite();
    const time = (tick + 1) * SIM_DT,
      speed = vehicle.speed,
      kph = speed * 3.6;
    for (const target of [100, 200, 300, 345, 349, 350])
      if (kph >= target && !targets[target]) targets[target] = { time, distance: vehicle.course.s - 100 };
    if (vehicle.powertrain.gear !== gear) {
      shifts.push({
        time,
        kph,
        from: gear,
        to: vehicle.powertrain.gear,
        fromRpm: vehicle.powertrain.shift.fromRpm,
        toRpm: vehicle.powertrain.shift.toRpm,
      });
      gear = vehicle.powertrain.gear;
    }
    if (time >= seconds - 10) {
      minimumEndSpeed = Math.min(minimumEndSpeed, kph);
      maximumEndSpeed = Math.max(maximumEndSpeed, kph);
    }
    if ((tick + 1) % 60 === 0) {
      const rpm = vehicle.powertrain.engineRpm;
      const shaftKW = (sampleEngineTorque(p, rpm) * rpm * Math.PI) / 30000;
      const wheelKW = shaftKW * model.powertrain.drivelineEfficiency;
      const dragKW = (entry.mechanics.quadraticDrag * speed ** 3) / 1000;
      const rollingKW = (0.014 * entry.mechanics.mass * 9.80665 * speed) / 1000;
      const rollingRpm = ((speed / radius) * p.gearRatios[gear - 1]! * p.finalDriveRatio * 30) / Math.PI;
      const rear = vehicle.tires.rear;
      const slipSpeed = rear.wheelSpeed - rear.longitudinalVelocity;
      const rearPatchForce = Math.abs(slipSpeed) > 1e-8 ? rear.longitudinalPower / slipSpeed : 0;
      samples.push({
        time,
        kph,
        distance: vehicle.course.s - 100,
        rpm,
        gear,
        acceleration: vehicle.longitudinalAcceleration,
        shaftKW,
        wheelKW,
        dragKW,
        rollingKW,
        coupledSlip: rpm / rollingRpm - 1,
        availableDriveForce:
          (sampleEngineTorque(p, rpm) *
            p.gearRatios[gear - 1]! *
            p.finalDriveRatio *
            model.powertrain.drivelineEfficiency) /
          radius,
        rearPatchForce,
        deliveredWheelKW: (rearPatchForce * rear.wheelSpeed) / 1000,
        tireSlipKW: (vehicle.tires.front.longitudinalPower + vehicle.tires.rear.longitudinalPower) / 1000,
        clutchLocked: vehicle.powertrain.clutchLocked,
        roadForce: speed > 0 ? ((dragKW + rollingKW) * 1000) / speed : 0,
        effectiveOpening: vehicle.powertrain.effectiveOpening,
        fuelCut: vehicle.powertrain.fuelCut,
      });
    }
  }
  const brakeStart = vehicle.course.s,
    brakeSpeed = vehicle.speed;
  let brakeTime = 0;
  for (; brakeTime < 30 && vehicle.speed > 0.1; brakeTime += SIM_DT) {
    updateVehicle(world, vehicle, model, { steering: 0, throttle: 0, brake: 1 }, steering);
    checkFinite();
  }
  const braking = {
    fromKph: brakeSpeed * 3.6,
    seconds: brakeTime,
    metres: vehicle.course.s - brakeStart,
    endKph: vehicle.speed * 3.6,
  };
  for (let tick = 0; tick < 8 / SIM_DT; tick++) {
    updateVehicle(world, vehicle, model, { steering: 0, throttle: 1, brake: 0 }, steering);
    checkFinite();
  }
  const restartKph = vehicle.speed * 3.6;
  // A second fresh vehicle follows gentle alternating steering after launch, checking transient cornering state.
  const turner = createVehicle(model, world, { s: 100, l: 0, initialSpeed: 25 });
  const turnSteering = driverSteering(createSteeringRule('front', 0.8), model);
  let lateral = 0;
  for (let tick = 0; tick < 12 / SIM_DT; tick++) {
    updateVehicle(
      world,
      turner,
      model,
      { steering: 0.25 * Math.sin(tick * SIM_DT), throttle: 0.3, brake: 0 },
      turnSteering,
    );
    for (const value of [turner.speed, turner.yaw, turner.y, turner.lateralAcceleration])
      if (!Number.isFinite(value)) throw new Error(`${entry.compiledVehicle.id}: non-finite cornering state`);
    lateral = Math.max(lateral, Math.abs(turner.lateralAcceleration));
  }
  return {
    id: entry.compiledVehicle.id,
    seconds,
    massKg: entry.mechanics.mass,
    rollingRadius: radius,
    redlineKph: p.gearRatios.map(
      (ratio) => (p.redlineRpm * 2 * Math.PI * radius * 60) / (ratio * p.finalDriveRatio * 1000),
    ),
    targets,
    shifts,
    samples,
    terminalRangeKph: [minimumEndSpeed, maximumEndSpeed],
    braking,
    restartKph,
    maximumLateralAcceleration: lateral,
  };
}
