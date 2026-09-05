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
import { compileTireCharacteristics, createArcadeTireFrictionCalibration, readTireCharacteristics } from '../dist/physics/tire-friction-calibration.js';
import { setEngineTorqueMultiplier } from '../dist/physics/automatic-powertrain.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import {
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from '../dist/browser/steering-calibration-selection.js';

const DEG = Math.PI / 180;
export function createFlatProbe({ calibration = DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE, initialSpeed = 200 / 3.6 } = {}) {
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
      copy.vehicle[key] = ['profile', 'tireFrictionCalibration'].includes(key) ? descriptor.value : structuredClone(descriptor.value);
    }
  }
  return copy;
}

export function directInput(steering, throttle, brake = 0) {
  return { steering, throttle, brake, steeringApplyMode: 'DIRECT', pedalApplyMode: 'DIRECT' };
}

/** Generic transient, not a promise the current calibration produces a drift. */
export function cycleInput(t, { direction = 1 } = {}) {
  if (t >= 10) return { steering: 0, throttle: 0, brake: 0 };
  const throttle = t < 3 ? .2 : t < 6 ? .2 + .6*(t-3)/3 : .8;
  return directInput(direction*.35, throttle);
}

/** Historical no-TCS capability reference; not the browser default or universal driving recipe. */
export function researchCycleInput(t, direction = 1) {
  const knots = [[0,.273,.222],[8,.273,.222],[8.6,.422,.353],[11,.329,.671],
    [19,.329,.671],[22,.260,.771],[30,.260,.771],[33,.329,.671],[41,.329,.671]];
  if (t >= 41) return { steering:0, throttle:0, brake:0 };
  for (let i=1; i<knots.length; i++) {
    if (t <= knots[i][0]) {
      const a=knots[i-1], b=knots[i], w=(t-a[0])/(b[0]-a[0]);
      return directInput(direction*(a[1]+w*(b[1]-a[1])), a[2]+w*(b[2]-a[2]));
    }
  }
  throw new Error('unreachable schedule');
}

export function observeProbe(probe, t) {
  const { vehicle: v, guide, height, surface } = probe, p = v.profile;
  const body = arcadeBodyKinematics(v);
  const wheel = (station, steer, omega, characteristics) => {
    const c = deriveContactObservation(guide, height, surface, body, station, steer, v.course.segmentIndex);
    return evaluateTireForce(omega, c.effectiveRollingRadius, c.longitudinalVelocity,
      c.lateralVelocity, c.tireFrameValid ? c.normalLoad : 0, c.surface.material.gripFactor,
      station.tire, characteristics);
  };
  const f = wheel(p.frontStation, v.frontSteerAngle, v.frontWheelOmega, v.tireFrictionCalibration.front);
  const r = wheel(p.rearStation, 0, v.rearWheelOmega, v.tireFrictionCalibration.rear);
  return { t, beta: Math.atan2(v.lateralSpeed, v.longitudinalSpeed) / DEG, speed: v.speed,
    yawRate: v.yawRate, steer: v.frontSteerAngle / DEG, gear: v.powertrain.gear,
    rpm: v.powertrain.engineRpm, requestedDriveTorque: v.powertrain.outputDriveTorque,
    deliveredDriveTorque: v.control.deliveredDriveTorque,
    frontLoad: v.frontNormalLoad, rearLoad: v.rearNormalLoad,
    frontOmega: v.frontWheelOmega, rearOmega: v.rearWheelOmega,
    frontSx: f.sx, frontSy: f.sy, rearSx: r.sx, rearSy: r.sy,
    frontFx: f.fx, frontFy: f.fy, rearFx: r.fx, rearFy: r.fy,
    frontCapacityX: f.capacityX, frontCapacityY: f.capacityY, rearCapacityX: r.capacityX,
    rearCapacityY: r.capacityY, frontRho: f.rho, rearRho: r.rho,
    // Re-observed instantaneous power, not a second force integration or exact energy ledger.
    slipPower: f.referenceSpeed*(f.fx*f.sx+f.fy*f.sy)+r.referenceSpeed*(r.fx*r.sx+r.fy*r.sy),
    rearLocked: v.control.rearWheelLocked, x: v.x, z: v.z };
}

export function runProbe(probe, seconds, inputAtTime, { hz = 60 } = {}) {
  if (![60, 120, 240].includes(hz) || !(seconds > 0) || !Number.isFinite(seconds)) {
    throw new RangeError('probe needs positive finite seconds and hz=60/120/240');
  }
  const dt = 1 / hz, rows = [], v = probe.vehicle;
  const start = { x:v.x, z:v.z, speed:v.speed };
  let brakeTicks = 0;
  let distance = 0, maxAbsBeta = 0, minSpeed = Infinity, rearLockTicks = 0, unsupportedTicks = 0;
  for (let tick = 0; tick < Math.round(seconds * hz); tick++) {
    const input = inputAtTime(tick / hz);
    brakeTicks += Number(Number(input.brake) > 0);
    const vx=v.velocityX, vz=v.velocityZ;
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
      curvature: Math.hypot(vx,vz)>0 ? (vz*(v.velocityX-vx)-vx*(v.velocityZ-vz))/dt/Math.hypot(vx,vz)**3 : null,
      steeringInput: input.steering, throttleInput: Number(input.throttle), brakeInput: Number(input.brake),
      steeringActuator: v.actuator.steering, throttleActuator: v.actuator.throttle, brakeActuator: v.actuator.brake,
    });
  }
  return { hz, seconds, distance, initialSpeed:start.speed, exitSpeed:v.speed,
    forwardDisplacement:v.z-start.z, netDisplacement:Math.hypot(v.x-start.x,v.z-start.z),
    maxAbsBeta, minSpeed, brakeTicks, rearLockTicks, unsupportedTicks, rows };
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

/** Ascending then descending inputs share the state reached through ordinary motion. */
export function runThrottleSweep(probe, { hz=60, direction=1, steering=.35,
  levels=[.1,.2,.3,.4,.5,.6,.7,.8,.9,1], dwell=3 }={}) {
  if (!levels.length || !levels.every(x=>Number.isFinite(x)&&x>=0&&x<=1)) throw new RangeError('invalid throttle sweep');
  const points=[...levels.map(th=>({th,leg:'up'})), ...[...levels].reverse().map(th=>({th,leg:'down'}))];
  const samples=[];
  for (const p of points) {
    const trace=runProbe(probe,dwell,()=>directInput(direction*steering,p.th),{hz});
    const {rows,...metrics}=trace;
    samples.push({...p,metrics,window:summarizeWindow(trace,Math.max(.1,dwell-1),dwell),rows});
  }
  return {meaning:'finite-time hysteresis, not steady equilibria or a continuity proof',hz,dwell,steering,samples};
}

async function main() {
  const args=process.argv.slice(2);
  let hz=60,direction=1,out,mode='transient',speed=200,engine=1,characteristics;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--hz') hz=Number(args[++i]);
    else if(args[i]==='--out') out=args[++i];
    else if(args[i]==='--mirror') direction=-1;
    else if(args[i]==='--mode') mode=args[++i];
    else if(args[i]==='--speed') speed=Number(args[++i]);
    else if(args[i]==='--engine') engine=Number(args[++i]);
    else if(args[i]==='--tire') characteristics=JSON.parse(args[++i]);
    else throw new Error(`unknown argument: ${args[i]}`);
  }
  if(args.includes('--out')&&!out) throw new Error('--out requires a path');
  if(!['transient','sweep','reference'].includes(mode)) throw new Error('mode must be transient, sweep or reference');
  if(!Number.isFinite(speed)||speed<0) throw new RangeError('speed must be finite km/h >= 0');
  if(mode==='reference') { // Explicit research fixture, NEVER applied by the browser.
    characteristics={gripX:.75,gripY:3,peakSlipX:.02,peakSlipY:.08,knee:.74};
    engine=3; speed=200;
  }
  const calibration=characteristics ? createArcadeTireFrictionCalibration(compileTireCharacteristics(characteristics))
    : DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION;
  const probe=createFlatProbe({calibration,initialSpeed:speed/3.6});
  setEngineTorqueMultiplier(probe.vehicle.powertrain,engine);
  const trace=mode==='sweep' ? runThrottleSweep(probe,{hz,direction})
    : runProbe(probe,mode==='reference'?44:13,t=>mode==='reference'?researchCycleInput(t,direction):cycleInput(t,{direction}),{hz});
  const report={milestone:'M9.20',mode,hz,direction,engine,initialKmh:speed,
    characteristics:readTireCharacteristics(calibration.front),trace};
  const {rows,samples,...summary}=trace;
  console.log(JSON.stringify({...report,trace:{...summary,...(samples?{windows:samples.map(({th,leg,window})=>({th,leg,window}))}:{})}},null,2));
  if(out) await writeFile(out,JSON.stringify(report,null,2)+'\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
