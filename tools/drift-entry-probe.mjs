/** Read-only mechanics diagnostic. Input schedules never receive vehicle state. */
import { pathToFileURL } from 'node:url';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import {
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from '../dist/browser/steering-calibration-selection.js';

const DEG = Math.PI / 180;
const guide = compileGuidePath(compileRasterPath([{ x: 0, z: -10000 }, { x: 0, z: 10000 }]),
  { lMax: 5000, mMin: 0.25, dCam: 5 });
const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
const surface = new SurfaceMap(guide.length, [{ sStart: 0, name: 'flat mechanics diagnostic',
  bands: [{ lMin: -5000, lMax: 5000, type: 'ASPHALT' }] }]);

// Rounded driver commands, not runtime angle targets or a feedback controller.
export const DRIFT_PROBE_LOW_INPUT = Object.freeze({ steering: 0.69, throttle: 0.27, brake: 0 });
export const DRIFT_PROBE_HIGH_INPUT = Object.freeze({ steering: 0.745, throttle: 0.36, brake: 0 });
// Pointer release returns through the existing actuator release rates, not DIRECT zero.
const neutral = Object.freeze({ steering: 0, throttle: 0, brake: 0,
  steeringApplyMode: 'RATE_LIMITED', pedalApplyMode: 'RATE_LIMITED' });
const mix = (a, b, f) => ({ steering: a.steering + f * (b.steering - a.steering),
  throttle: a.throttle + f * (b.throttle - a.throttle), brake: 0 });

export function entryHoldInput(t, brakeAmount = 0.3, brakeDuration = 0.35) {
  if (t < 30) return { steering: 0.69, throttle: 0.15, brake: 0 };
  if (t < 30 + brakeDuration) return { steering: 0.69, throttle: 0, brake: brakeAmount };
  return DRIFT_PROBE_LOW_INPUT;
}

export function roundTripInput(t) {
  if (t < 50) return entryHoldInput(t);
  if (t < 52) return mix(DRIFT_PROBE_LOW_INPUT, DRIFT_PROBE_HIGH_INPUT, (t - 50) / 2);
  if (t < 75) return DRIFT_PROBE_HIGH_INPUT;
  if (t < 77) return mix(DRIFT_PROBE_HIGH_INPUT, DRIFT_PROBE_LOW_INPUT, (t - 75) / 2);
  if (t < 105) return DRIFT_PROBE_LOW_INPUT;
  return neutral;
}

/** Ordinary rolling start: no sideslip seed, gear lock, recovery, or state correction. */
export function runDriftInputSchedule(inputAtTime = roundTripInput, {
  duration = 109, dt = 1 / 60, sign = 1, initialSpeed = 15,
  calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  applyMode = 'DIRECT',
} = {}) {
  if (!(duration > 0) || !(dt > 0) || !Number.isFinite(duration) || !Number.isFinite(dt)
    || ![1, -1].includes(sign) || !(initialSpeed >= 0) || !Number.isFinite(initialSpeed)) {
    throw new RangeError('probe requires finite positive duration/dt, nonnegative speed and sign +/-1');
  }
  const vehicle = createArcadeVehicle(profile, guide, height, surface, 10000, 0, initialSpeed, {
    maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
    steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
    steeringActuatorResponse: { applyRate: DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
      releaseRate: DEFAULT_BROWSER_STEERING_RESPONSE_RATE },
  }, calibration);
  const rows = [];
  let distance = 0;
  for (let i = 0; i < Math.round(duration / dt); i++) {
    const command = inputAtTime(i * dt);
    const input = { steeringApplyMode: applyMode, pedalApplyMode: applyMode,
      ...command, steering: sign * command.steering };
    updateArcadeVehicle(guide, height, surface, vehicle, input, dt);
    distance += Math.hypot(vehicle.velocityX, vehicle.velocityZ) * dt;
    rows.push({ t: (i + 1) * dt, beta: Math.atan2(vehicle.lateralSpeed, vehicle.longitudinalSpeed) / DEG,
      speed: vehicle.speed, yawRate: vehicle.yawRate, gear: vehicle.powertrain.gear,
      rpm: vehicle.powertrain.engineRpm, steer: vehicle.frontSteerAngle,
      throttle: vehicle.actuator.throttle, brake: vehicle.actuator.brake,
      frontLoad: vehicle.frontNormalLoad, rearLoad: vehicle.rearNormalLoad,
      frontWheelLocked: vehicle.control.frontWheelLocked, rearWheelLocked: vehicle.control.rearWheelLocked,
      frontWheelOmega: vehicle.frontWheelOmega, rearWheelOmega: vehicle.rearWheelOmega,
      pitch: vehicle.pitch, supported: vehicle.supported, surfaceType: vehicle.surfaceType, distance });
  }
  return { vehicle, rows };
}

export function summarizeDriftWindow(rows, from, to) {
  const samples = rows.filter(r => r.t > from && r.t <= to);
  if (samples.length === 0) throw new RangeError('diagnostic window has no samples');
  const range = key => {
    const values = samples.map(r => r[key]);
    return { mean: values.reduce((sum, n) => sum + n, 0) / values.length,
      min: Math.min(...values), max: Math.max(...values) };
  };
  return { beta: range('beta'), speed: range('speed'), yawRate: range('yawRate'),
    gears: [...new Set(samples.map(r => r.gear))],
    rearLockObserved: samples.some(r => r.rearWheelLocked) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { rows } = runDriftInputSchedule();
  console.log(JSON.stringify({ calibration: DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
    preparation: summarizeDriftWindow(rows, 25, 30),
    low: summarizeDriftWindow(rows, 45, 50), high: summarizeDriftWindow(rows, 70, 75),
    returnedLow: summarizeDriftWindow(rows, 100, 105),
    exit: summarizeDriftWindow(rows, 107, 109),
    rows: process.argv.includes('--trace') ? rows : undefined }, null, 2));
}
