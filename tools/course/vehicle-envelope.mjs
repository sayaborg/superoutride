import { createFlatProbe } from '../physics/drift-control-probe.mjs';
import { updateArcadeVehicle, arcadeBodyKinematics } from '../../dist/physics/arcade-vehicle-physics.js';
import { SIM_DT } from '../../dist/browser/frame-loop.js';
import { wrapAngle } from '../../dist/core/math.js';

/** Flat asphalt, production control/protection, ordinary inputs; no imposed velocity or force during measurement. */
export function measureVehicleEnvelope(entry) {
  const make = (initialSpeed) => {
    const p = createFlatProbe({ profile: entry.profile, initialSpeed, torqueProtection: entry.torqueProtection });
    return { vehicle: p.vehicle, world: { guide: p.guide, height: p.height, surfaces: p.surface } };
  };
  const step = (p, input) => updateArcadeVehicle(p.world, p.vehicle, input, SIM_DT);
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
          minimumUp = Math.min(minimumUp, arcadeBodyKinematics(v).up.y);
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
    const nearest = (rows) =>
      rows.reduce((best, r) => (Math.abs(r.speed - speed) < Math.abs(best.speed - speed) ? r : best)).value;
    samples.push({
      speed,
      acceleration: Math.max(0, nearest(acceleration)),
      braking: nearest(braking),
      lateral,
      steeringGain: trials[0].lateral / trials[0].steering,
    });
  }
  return {
    maximumSpeed,
    rows: samples,
    measurement: { version: 1, dt: SIM_DT, surface: 'ASPHALT', convergenceSeconds: elapsed, acceleration, braking },
  };
}
