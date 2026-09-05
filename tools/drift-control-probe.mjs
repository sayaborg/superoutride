/** Read-only mechanics diagnostic. All motion uses the production solver; constants are test inputs. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { createArcadeVehicle, updateArcadeVehicle, arcadeBodyKinematics } from '../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation } from '../dist/physics/vehicle-dynamics.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import {
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from '../dist/browser/steering-calibration-selection.js';

const DEG = Math.PI / 180;
export function createFlatProbe({ calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE, initialSpeed = 15 } = {}) {
  const guide = compileGuidePath(compileRasterPath([{ x: 0, z: -10000 }, { x: 0, z: 10000 }]),
    { lMax: 5000, mMin: 0.25, dCam: 5 });
  const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
  const surface = new SurfaceMap(guide.length, [{ sStart: 0, name: 'Flat handling diagnostic',
    bands: [{ lMin: -5000, lMax: 5000, type: 'ASPHALT' }] }]);
  const rate = DEFAULT_BROWSER_STEERING_RESPONSE_RATE;
  const vehicle = createArcadeVehicle(profile, guide, height, surface, 10000, 0, initialSpeed,
    { maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
      steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
      steeringActuatorResponse: { applyRate: rate, releaseRate: rate } }, calibration);
  return { guide, height, surface, vehicle };
}

/** Independent replay fork of a state reached by ordinary inputs, not an imposed drift seed. */
export function forkProbe(probe) {
  const copy = createFlatProbe({ profile: probe.vehicle.profile,
    calibration: probe.vehicle.tireFrictionCalibration });
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(probe.vehicle))) {
    if ('value' in descriptor) {
      copy.vehicle[key] = key === 'profile' ? descriptor.value : structuredClone(descriptor.value);
    }
  }
  return copy;
}

export function directInput(steering, throttle, brake = 0) {
  return { steering, throttle, brake, steeringApplyMode: 'DIRECT', pedalApplyMode: 'DIRECT' };
}

/** Time alone selects inputs. No beta/speed/gear feedback or state assignment occurs here. */
export function cycleInput(t, { direction = 1, brake = 0.2, brakeSeconds = 0.4,
  releaseMode = 'DIRECT' } = {}) {
  let steering = 0.63, throttle = 0.38, braking = 0;
  if (t < 40) throttle = 0.2;
  else if (t < 40 + brakeSeconds) { throttle = 0; braking = brake; }
  else if (t >= 62 && t < 64) {
    const w = (t - 62) / 2;
    steering += 0.04 * w; throttle += 0.12 * w;
  } else if (t >= 64 && t < 84) { steering = 0.67; throttle = 0.50; }
  else if (t >= 84 && t < 86) {
    const w = (t - 84) / 2;
    steering = 0.67 - 0.04 * w; throttle = 0.50 - 0.12 * w;
  } else if (t >= 110) { steering = 0; throttle = 0; }
  return { ...directInput(direction * steering, throttle, braking),
    ...(t >= 110 ? { steeringApplyMode: releaseMode, pedalApplyMode: releaseMode } : {}) };
}

export function observeProbe(probe, t) {
  const { vehicle: v, guide, height, surface } = probe, p = v.profile;
  const body = arcadeBodyKinematics(v);
  const wheel = (station, steer, omega) => {
    const c = deriveContactObservation(guide, height, surface, body, station, steer, v.course.segmentIndex);
    const k = v.tireFrictionCalibration;
    return evaluateTireForce(omega, c.effectiveRollingRadius, c.longitudinalVelocity,
      c.lateralVelocity, c.tireFrameValid ? c.normalLoad : 0, c.surface.material.gripFactor,
      station.tire, k.referenceFrictionMultiplier, k.linearStiffnessMultiplier, k.slidingFrictionRatio);
  };
  const f = wheel(p.frontStation, v.frontSteerAngle, v.frontWheelOmega);
  const r = wheel(p.rearStation, 0, v.rearWheelOmega);
  return { t, beta: Math.atan2(v.lateralSpeed, v.longitudinalSpeed) / DEG, speed: v.speed,
    yawRate: v.yawRate, steer: v.frontSteerAngle / DEG, gear: v.powertrain.gear,
    rpm: v.powertrain.engineRpm, driveTorque: v.powertrain.outputDriveTorque,
    frontLoad: v.frontNormalLoad, rearLoad: v.rearNormalLoad,
    frontOmega: v.frontWheelOmega, rearOmega: v.rearWheelOmega,
    frontSx: f.sx, frontSy: f.sy, rearSx: r.sx, rearSy: r.sy,
    frontFx: f.fx, frontFy: f.fy, rearFx: r.fx, rearFy: r.fy,
    rearLocked: v.control.rearWheelLocked, x: v.x, z: v.z };
}

export function runProbe(probe, seconds, inputAtTime, { hz = 60 } = {}) {
  if (![60, 120, 240].includes(hz) || !(seconds > 0) || !Number.isFinite(seconds)) {
    throw new RangeError('probe needs positive finite seconds and hz=60/120/240');
  }
  const dt = 1 / hz, rows = [], v = probe.vehicle;
  let distance = 0, maxAbsBeta = 0, minSpeed = Infinity, rearLockTicks = 0, unsupportedTicks = 0;
  for (let tick = 0; tick < Math.round(seconds * hz); tick++) {
    const input = inputAtTime(tick / hz);
    updateArcadeVehicle(probe.guide, probe.height, probe.surface, v, input, dt);
    if (![v.x, v.y, v.z, v.velocityX, v.velocityY, v.velocityZ, v.yawRate,
      v.pitchRate, v.frontWheelOmega, v.rearWheelOmega].every(Number.isFinite)) {
      throw new Error(`nonfinite mechanics at tick ${tick}`);
    }
    distance += v.speed * dt;
    maxAbsBeta = Math.max(maxAbsBeta, Math.abs(Math.atan2(v.lateralSpeed, v.longitudinalSpeed) / DEG));
    minSpeed = Math.min(minSpeed, v.speed);
    rearLockTicks += Number(v.control.rearWheelLocked);
    unsupportedTicks += Number(!v.supported);
    if ((tick + 1) % (hz / 10) === 0) rows.push({
      ...observeProbe(probe, (tick + 1) / hz),
      steeringInput: input.steering, throttleInput: Number(input.throttle), brakeInput: Number(input.brake),
      steeringActuator: v.actuator.steering, throttleActuator: v.actuator.throttle, brakeActuator: v.actuator.brake,
    });
  }
  return { hz, seconds, distance, maxAbsBeta, minSpeed, rearLockTicks, unsupportedTicks, rows };
}

export function summarizeWindow(trace, start, end) {
  const rows = trace.rows.filter(r => r.t >= start && r.t <= end);
  if (!rows.length) throw new RangeError('summary window contains no samples');
  const result = { start, end, count: rows.length, gears: [...new Set(rows.map(r => r.gear))] };
  for (const key of ['beta', 'speed', 'yawRate', 'rearSx']) {
    const values = rows.map(r => r[key]);
    result[key] = { mean: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values), max: Math.max(...values) };
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let hz = 60, direction = 1, out;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hz') hz = Number(args[++i]);
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--mirror') direction = -1;
    else throw new Error(`unknown argument: ${args[i]}`);
  }
  if (args.includes('--out') && !out) throw new Error('--out requires a file path');
  const trace = runProbe(createFlatProbe(), 113, t => cycleInput(t, { direction }), { hz });
  const summary = { hz, direction, calibration: DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
    distance: trace.distance, maxAbsBeta: trace.maxAbsBeta, minSpeed: trace.minSpeed,
    rearLockTicks: trace.rearLockTicks, unsupportedTicks: trace.unsupportedTicks,
    windows: [[55, 62], [76, 84], [100, 110], [111, 113]].map(([a, b]) => summarizeWindow(trace, a, b)) };
  console.log(JSON.stringify(summary, null, 2));
  if (out) await writeFile(out, JSON.stringify({ summary, trace }, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
