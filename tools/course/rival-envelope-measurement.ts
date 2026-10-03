import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import type { SessionVehicle } from '../../src/content/session-vehicle.js';
import type { DrivingInput } from '../../src/vehicle/driving-input.js';
import { createBodyKinematicsWorkspace } from '../../src/vehicle/physics/vehicle-physics.js';
import { compilePlanPath } from '../../src/course/geometry/plan-path.js';
import { Profile } from '../../src/course/geometry/profile.js';
import type { SurfaceMapReader } from '../../src/course/vehicle-world.js';
import type { SurfaceMaterial } from '../../src/course/surface-material.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { updateVehicle, vehicleBodyKinematics } from '../../src/vehicle/physics/vehicle-physics.js';
import { createStartPhase } from '../../src/race/start-phase.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { wrapAngle } from '../../src/core/math.js';

/**
 * The envelope's reference surface: unit grip and no rolling resistance. Envelopes measure the vehicle
 * against this fixed reference, never against a catalog material, so the material set stays open and
 * editing a material's values does not move the reference.
 */
export const ENVELOPE_REFERENCE_SURFACE: SurfaceMaterial = Object.freeze({
  id: 'ENVELOPE_REFERENCE',
  gripFactor: 1,
  rollingResistance: 0,
});
const referenceSurfaces: SurfaceMapReader = Object.freeze({ sample: () => ENVELOPE_REFERENCE_SURFACE });

/** The finite flat world used only to generate game driving envelopes. */
function createEnvelopeRun(entry: SessionVehicle, initialSpeed: number) {
  const plan = compilePlanPath({ x: 0, z: -10000, heading: 0 }, [{ kind: 'straight', length: 20000 }]);
  const coordinates = createPlanCoordinateReader(plan.segments, plan.length, (_s, out) => {
    out.left = -5000;
    out.right = 5000;
    return out;
  });
  const height = new Profile(coordinates.domain.end, [
    { s: 0, y: 0, curveLength: 0 },
    { s: coordinates.domain.end, y: 0, curveLength: 0 },
  ]);
  const world = { extent: coordinates.domain, coordinates, height, surfaces: referenceSurfaces };
  const model = createVehicleModel(entry, SIM_DT);
  const vehicle = createVehicle(model, world, { s: 10000, l: 0, initialSpeed });
  return { vehicle, model, world };
}

/** The flat reference surface, production control/protection, ordinary inputs; no imposed velocity or force during measurement. */
/**
 * The envelope measurement procedure and its identity: its version, fixed step, reference surface, and the values
 * that decide convergence, the trials and which trials are admitted.
 */
export const ENVELOPE_MEASUREMENT = Object.freeze({
  // Version 2: measured on the unit reference surface, ENVELOPE_REFERENCE_SURFACE.
  version: 2,
  dt: SIM_DT,
  surface: ENVELOPE_REFERENCE_SURFACE.id,
  /** Seconds the full-throttle launch may take to reach top speed before measurement fails. */
  topSpeedSeconds: 240,
  /** Steps per acceleration sample. */
  accelerationSampleSteps: 30,
  /** m/s: a sample changing speed less than this is stable; this many stable samples in a row reach top speed. */
  stableSpeedChange: 0.002,
  stableSamples: 8,
  /** Seconds the braking run may last; it ends below the stop speed (m/s). */
  brakingSeconds: 60,
  brakingStopSpeed: 1,
  /** Steps per braking sample; samples start after the settle steps, while the brakes build up. */
  brakingSampleSteps: 6,
  brakingSettleSteps: 30,
  /** m/s²: the least braking a sample records. */
  minimumBraking: 0.1,
  /** m/s: lateral trials run at the first speed and every spacing above it below top speed, then at top speed. */
  firstTrialSpeed: 5,
  trialSpeedSpacing: 10,
  /** Each speed's steering trials: the steering held, in order; the first also gives the steering gain. */
  trialSteering: Object.freeze([0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1]),
  /** Steps per trial, of which the first settle steps are not measured. */
  trialSteps: 240,
  trialSettleSteps: 120,
  /** m/s: a trial holds its speed within this of the target with throttle and brake. */
  trialSpeedDeadzone: 0.15,
  /** A trial is admitted below this body slip (radians), above this body up component, and within this speed error. */
  maximumSlipRadians: 0.2,
  minimumBodyUp: 0.25,
  speedToleranceMeters: 1,
  speedToleranceFraction: 0.12,
});
const M = ENVELOPE_MEASUREMENT;

export function measureRivalEnvelope(entry: SessionVehicle) {
  const make = (initialSpeed: number) => createEnvelopeRun(entry, initialSpeed);
  const step = (p: ReturnType<typeof createEnvelopeRun>, input: DrivingInput) =>
    updateVehicle(p.world, p.vehicle, p.model, input);
  const run = make(0),
    acceleration = [],
    braking = [];
  // The standing launch uses the race's start: held READY with the throttle closed, then GO.
  const start = createStartPhase();
  start.begin();
  do updateVehicle(run.world, run.vehicle, run.model, { steering: 0, throttle: false, brake: false }, true);
  while (!start.advance());
  let elapsed = 0,
    last = 0,
    stable = 0,
    maximumObservedSpeed = 0,
    wasFuelCut = false,
    limiterCycle = false;
  for (let tick = 0; tick < M.topSpeedSeconds / SIM_DT; tick++) {
    step(run, { steering: 0, throttle: true, brake: false });
    elapsed += SIM_DT;
    maximumObservedSpeed = Math.max(maximumObservedSpeed, run.vehicle.speed);
    // A fuel-cut cycle in top gear repeats; its first recovery completes the peak it bounds.
    const { fuelCut, gear } = run.vehicle.powertrain;
    limiterCycle =
      wasFuelCut && !fuelCut && gear === entry.vehicleDefinition.compiledVehicle.powertrain.gearRatios.length;
    wasFuelCut = fuelCut;
    if (limiterCycle) break;
    if (tick % M.accelerationSampleSteps === M.accelerationSampleSteps - 1) {
      const speed = run.vehicle.speed;
      acceleration.push({ speed: (last + speed) / 2, value: (speed - last) / (M.accelerationSampleSteps * SIM_DT) });
      stable = Math.abs(speed - last) < M.stableSpeedChange ? stable + 1 : 0;
      last = speed;
      if (stable >= M.stableSamples) break;
    }
  }
  if (stable < M.stableSamples && !limiterCycle)
    throw new RangeError(
      `${entry.vehicleDefinition.compiledVehicle.id}: top speed did not converge within ${M.topSpeedSeconds} seconds`,
    );
  const maximumSpeed = limiterCycle ? maximumObservedSpeed : run.vehicle.speed;
  const brakingRun = make(maximumSpeed);
  last = maximumSpeed;
  for (let tick = 0; tick < M.brakingSeconds / SIM_DT && brakingRun.vehicle.speed > M.brakingStopSpeed; tick++) {
    step(brakingRun, { steering: 0, throttle: false, brake: true });
    if (tick % M.brakingSampleSteps === M.brakingSampleSteps - 1) {
      const speed = brakingRun.vehicle.speed;
      if (tick >= M.brakingSettleSteps)
        braking.push({
          speed: (last + speed) / 2,
          value: Math.max(M.minimumBraking, (last - speed) / (M.brakingSampleSteps * SIM_DT)),
        });
      last = speed;
    }
  }
  const speeds = Array.from(
    { length: Math.ceil(maximumSpeed / M.trialSpeedSpacing) },
    (_, i) => M.firstTrialSpeed + i * M.trialSpeedSpacing,
  ).filter((v) => v < maximumSpeed);
  speeds.push(maximumSpeed);
  const samples = [];
  for (const speed of speeds) {
    const trials = [];
    for (const steering of M.trialSteering) {
      const p = make(speed);
      let sum = 0,
        velocity = 0,
        maxBeta = 0,
        minimumUp = 1,
        count = 0;
      let heading = p.vehicle.yaw;
      for (let tick = 0; tick < M.trialSteps; tick++) {
        const v = p.vehicle,
          previousSpeed = v.speed;
        step(p, {
          steering,
          throttle: v.speed < speed - M.trialSpeedDeadzone,
          brake: v.speed > speed + M.trialSpeedDeadzone,
        });
        const next = Math.atan2(v.velocityX, v.velocityZ);
        if (tick >= M.trialSettleSteps) {
          sum += (Math.abs(wrapAngle(next - heading)) * (previousSpeed + v.speed)) / (2 * SIM_DT);
          velocity += v.speed;
          count++;
          maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(v.lateralSpeed, v.longitudinalSpeed)));
          minimumUp = Math.min(minimumUp, vehicleBodyKinematics(v, createBodyKinematicsWorkspace()).up.y);
        }
        heading = next;
      }
      trials.push({ steering, speed: velocity / count, lateral: sum / count, maxBeta, minimumUp });
    }
    const admissible = trials.filter(
      (t) =>
        t.maxBeta < M.maximumSlipRadians &&
        t.minimumUp > M.minimumBodyUp &&
        Math.abs(t.speed - speed) < Math.max(M.speedToleranceMeters, speed * M.speedToleranceFraction),
    );
    if (!admissible.length)
      throw new RangeError(
        `${entry.vehicleDefinition.compiledVehicle.id}: no stable lateral measurement at ${speed} m/s`,
      );
    const lateral = Math.max(...admissible.map((t) => t.lateral));
    const nearest = (rows: readonly { speed: number; value: number }[]) =>
      rows.reduce((best, r) => (Math.abs(r.speed - speed) < Math.abs(best.speed - speed) ? r : best)).value;
    samples.push({
      speed,
      acceleration: Math.max(0, nearest(acceleration)),
      braking: nearest(braking),
      lateral,
      steeringGain: trials[0]!.lateral / trials[0]!.steering,
    });
  }
  return {
    maximumSpeed,
    rows: samples,
    measurement: {
      ...ENVELOPE_MEASUREMENT,
      convergenceSeconds: elapsed,
      acceleration,
      braking,
    },
  };
}
