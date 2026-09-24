import { createPlanCoordinateReader } from '../../src/course/geometry/plan-coordinate-reader.js';
import type { VehicleCatalogEntry } from '../../src/vehicle/vehicle-catalog.js';
import type { DrivingInput } from '../../src/vehicle/driving-input.js';
import { createBodyKinematicsWorkspace } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { compilePlanPath } from '../../src/course/geometry/plan-path.js';
import { Profile } from '../../src/course/geometry/profile.js';
import { SurfaceMap } from '../../src/vehicle/physics/surface-map.js';
import { createArcadeVehicle } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../../src/shell/tire-friction-selection.js';
import {
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from '../../src/shell/steering-calibration-selection.js';
import { updateArcadeVehicle, arcadeBodyKinematics } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { SIM_DT } from '../../src/shell/frame-loop.js';
import { wrapAngle } from '../../src/core/math.js';

/** The finite flat world used only to generate game driving envelopes. */
function createEnvelopeRun(entry: Readonly<VehicleCatalogEntry>, initialSpeed: number) {
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
  const surfaces = new SurfaceMap(coordinates.domain.end, [
    { sStart: 0, name: 'Envelope asphalt', intervals: [{ lMin: -5000, lMax: 5000, type: 'ASPHALT' }] },
  ]);
  const world = { extent: coordinates.domain, coordinates, height, surfaces };
  const rate = DEFAULT_BROWSER_STEERING_RESPONSE_RATE;
  const vehicle = createArcadeVehicle(entry.profile, world, {
    s: 10000,
    l: 0,
    initialSpeed,
    torqueProtection: entry.torqueProtection,
    tireFrictionCalibration: DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
    steeringCalibration: {
      maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
      steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
      steeringActuatorResponse: { applyRate: rate, releaseRate: rate },
    },
  });
  return { vehicle, world };
}

/** Flat asphalt, production control/protection, ordinary inputs; no imposed velocity or force during measurement. */
export function measureVehicleEnvelope(entry: Readonly<VehicleCatalogEntry>) {
  const make = (initialSpeed: number) => createEnvelopeRun(entry, initialSpeed);
  const step = (p: ReturnType<typeof createEnvelopeRun>, input: DrivingInput) =>
    updateArcadeVehicle(p.world, p.vehicle, input, SIM_DT);
  const run = make(0),
    acceleration = [],
    braking = [];
  let elapsed = 0,
    last = 0,
    stable = 0;
  for (let tick = 0; tick < 240 / SIM_DT; tick++) {
    step(run, { steering: 0, throttle: true, brake: false });
    elapsed += SIM_DT;
    if (tick % 30 === 29) {
      const speed = run.vehicle.speed;
      acceleration.push({ speed: (last + speed) / 2, value: (speed - last) / (30 * SIM_DT) });
      stable = Math.abs(speed - last) < 0.002 ? stable + 1 : 0;
      last = speed;
      if (stable >= 8) break;
    }
  }
  if (stable < 8) throw new RangeError(`${entry.profile.id}: top speed did not converge within 240 seconds`);
  const maximumSpeed = run.vehicle.speed;
  const brakingRun = make(maximumSpeed);
  last = maximumSpeed;
  for (let tick = 0; tick < 60 / SIM_DT && brakingRun.vehicle.speed > 1; tick++) {
    step(brakingRun, { steering: 0, throttle: false, brake: true });
    if (tick % 6 === 5) {
      const speed = brakingRun.vehicle.speed;
      if (tick >= 30) braking.push({ speed: (last + speed) / 2, value: Math.max(0.1, (last - speed) / (6 * SIM_DT)) });
      last = speed;
    }
  }
  const speeds = Array.from({ length: Math.ceil(maximumSpeed / 10) }, (_, i) => 5 + i * 10).filter(
    (v) => v < maximumSpeed,
  );
  speeds.push(maximumSpeed);
  const samples = [];
  for (const speed of speeds) {
    const trials = [];
    for (const steering of [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1]) {
      const p = make(speed);
      let sum = 0,
        velocity = 0,
        maxBeta = 0,
        minimumUp = 1,
        count = 0;
      let heading = p.vehicle.yaw;
      for (let tick = 0; tick < 240; tick++) {
        const v = p.vehicle,
          previousSpeed = v.speed;
        step(p, { steering, throttle: v.speed < speed - 0.15, brake: v.speed > speed + 0.15 });
        const next = Math.atan2(v.velocityX, v.velocityZ);
        if (tick >= 120) {
          sum += (Math.abs(wrapAngle(next - heading)) * (previousSpeed + v.speed)) / (2 * SIM_DT);
          velocity += v.speed;
          count++;
          maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(v.lateralSpeed, v.longitudinalSpeed)));
          minimumUp = Math.min(minimumUp, arcadeBodyKinematics(v, createBodyKinematicsWorkspace()).up.y);
        }
        heading = next;
      }
      trials.push({ steering, speed: velocity / count, lateral: sum / count, maxBeta, minimumUp });
    }
    const admissible = trials.filter(
      (t) => t.maxBeta < 0.2 && t.minimumUp > 0.25 && Math.abs(t.speed - speed) < Math.max(1, speed * 0.12),
    );
    if (!admissible.length) throw new RangeError(`${entry.profile.id}: no stable lateral measurement at ${speed} m/s`);
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
    measurement: { version: 1, dt: SIM_DT, surface: 'ASPHALT', convergenceSeconds: elapsed, acceleration, braking },
  };
}
