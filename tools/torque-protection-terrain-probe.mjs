/** Input-only finite terrain probes of the production solver. No recovery or state correction. */
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
import { setEngineTorqueMultiplier } from '../dist/physics/automatic-powertrain.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from '../dist/browser/tire-friction-selection.js';
import { DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER, DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE } from '../dist/browser/steering-calibration-selection.js';

const DEG = 180 / Math.PI, START = 1000, LENGTH = 10000;
export const TERRAIN_CASES = Object.freeze({
  lowGripDrive: Object.freeze({ grip: .25, kind: 'drive', speed: 15, seconds: 6 }),
  lowGripBrake: Object.freeze({ grip: .25, kind: 'brake', speed: 30, seconds: 10 }),
  uphillDrive: Object.freeze({ grade: .10, kind: 'drive', speed: 15, seconds: 6 }),
  downhillBrake: Object.freeze({ grade: -.10, kind: 'brake', speed: 30, seconds: 8 }),
  gripDropBrake: Object.freeze({ grip: 1, gripAfter: .25, changeS: START + 35, kind: 'brake', speed: 30, seconds: 10 }),
  turnDrive: Object.freeze({ kind: 'turnDrive', speed: 30, seconds: 6 }),
  turnBrake: Object.freeze({ kind: 'turnBrake', speed: 30, seconds: 6 }),
  lowGripReversal: Object.freeze({ grip: .25, kind: 'reversal', speed: 30, seconds: 6 }),
  crestCoast: Object.freeze({ terrain: 'crest', kind: 'coast', speed: 70, seconds: 5 }),
  crestDrive: Object.freeze({ terrain: 'crest', kind: 'drive', speed: 70, seconds: 5 }),
});

/** Exact constant-grade diagnostic reader, not a cosine-interpolated HeightProfile segment. */
function gradeHeight(length, grade) {
  const sample = s => {
    if (!Number.isFinite(s) || s < 0 || s > length) throw new RangeError('grade fixture outside open domain');
    return { y: grade * (s - START), dYdS: grade };
  };
  return Object.freeze({ courseLength: length, samplePhysicsDifferential: sample, samplePhysics: s => sample(s).y });
}
export function createTerrainProbe(entry, options = {}) {
  const { grip = 1, gripAfter = grip, changeS = LENGTH, grade = 0, terrain = 'flat', speed = 30,
    calibration = 'browser', protectedRun = true, engine = 1 } = options;
  if (![grip, gripAfter, changeS, grade, speed].every(Number.isFinite) || grip < 0 || gripAfter < 0
    || changeS < 0 || changeS > LENGTH || speed < 0 || !['flat', 'crest'].includes(terrain)
    || !['browser', 'stock'].includes(calibration) || typeof protectedRun !== 'boolean'
    || (terrain === 'crest' && grade !== 0)) throw new RangeError('invalid terrain probe configuration');
  const guide = compileGuidePath(compileRasterPath([{ x: 0, z: 0 }, { x: 0, z: LENGTH }]),
    { lMax: 500, mMin: .25, dCam: 5 });
  const height = terrain === 'crest'
    ? new HeightProfile(LENGTH, [{ s: 0, y: 0 }, { s: START + 30, y: 0 },
      { s: START + 70, y: 2 }, { s: START + 110, y: 0 }, { s: LENGTH, y: 0 }])
    : gradeHeight(LENGTH, grade);
  const base = new SurfaceMap(LENGTH, [{ sStart: 0, name: 'Terrain protection diagnostic',
    bands: [{ lMin: -500, lMax: 500, type: 'ASPHALT' }] }]);
  // Change grip only; preserve asphalt rolling resistance to isolate friction effects.
  const surface = Object.freeze({ courseLength: LENGTH, sample(s, l) {
    const value = base.sample(s, l);
    return { ...value, material: { ...value.material,
      gripFactor: value.material.supported ? (s >= changeS ? gripAfter : grip) : 0 } };
  } });
  const rate = DEFAULT_BROWSER_STEERING_RESPONSE_RATE;
  const vehicle = createArcadeVehicle(entry.profile, guide, height, surface, START, 0, speed,
    { maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER, steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
      steeringActuatorResponse: { applyRate: rate, releaseRate: rate } },
    calibration === 'browser' ? DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION : undefined,
    protectedRun ? entry.torqueProtection : undefined);
  setEngineTorqueMultiplier(vehicle.powertrain, engine);
  return { guide, height, surface, vehicle };
}
export function terrainInput(t, kind, direction = 1) {
  const neutral = { steering: 0, throttle: false, brake: false };
  if (t < .5 || kind === 'coast') return neutral;
  if (kind === 'drive') return { ...neutral, throttle: true };
  if (kind === 'brake') return { ...neutral, brake: true };
  if (kind === 'turnDrive') return { steering: direction * .35, throttle: t >= 1.5, brake: false };
  if (kind === 'turnBrake') return { steering: direction * .35, throttle: false, brake: t >= 1.5 };
  if (kind === 'reversal') return { steering: direction * (t < 1.5 ? .35 : -.35), throttle: false, brake: t >= 1.5 };
  throw new RangeError(`unknown input schedule: ${kind}`);
}
export function runTerrainProbe(entry, options = {}) {
  const { hz = 120, seconds = 6, kind = 'drive', direction = 1, capture = false, ...fixture } = options;
  if (![60, 120, 240].includes(hz) || !(seconds > 0) || !Number.isFinite(seconds)
    || !['drive', 'brake', 'turnDrive', 'turnBrake', 'reversal', 'coast'].includes(kind)
    || ![-1, 1].includes(direction)) throw new RangeError('invalid terrain probe run');
  const p = createTerrainProbe(entry, fixture), v = p.vehicle;
  const out = { id: entry.profile.id, hz, requestedSeconds: seconds, kind, direction,
    calibration: fixture.calibration ?? 'browser', protectedRun: fixture.protectedRun ?? true,
    engine: fixture.engine ?? 1, seconds: 0, completed: false, error: null, overturned: false,
    initialSpeed: v.speed, finalSpeed: v.speed, minSpeed: v.speed, distance: 0,
    maxAbsBeta: 0, maxAbsMovingBeta: 0, speedAtMaxMovingBeta: null, timeAtMaxMovingBeta: null, maxAbsBetaAbove15: 0, maxAbsYawRate: 0, maxAbsPitch: Math.abs(v.pitch) * DEG,
    frontLiftTime: 0, rearLiftTime: 0, airborneTime: 0, recontacts: 0,
    supportLimitedTime: 0, infeasibleTime: 0, infeasibleNonzeroTorque: 0, torqueBudgetViolation: 0,
    maxEllipse: 0, maxPositiveSlipPower: 0, zeroLoadForceViolation: 0,
    gripTransition: false, minGrip: null, maxGrip: 0, rows: [] };
  let wasAir = false, previousGrip = null;
  const ticks = Math.round(hz * seconds);
  if (ticks < 1) throw new RangeError('probe duration must contain at least one tick');
  for (let tick = 0; tick < ticks; tick++) {
    try {
      updateArcadeVehicle(p.guide, p.height, p.surface, v, terrainInput(tick / hz, kind, direction), 1 / hz);
      const body = arcadeBodyKinematics(v);
      const f = deriveContactObservation(p.guide, p.height, p.surface, body, v.profile.frontStation, v.frontSteerAngle, v.course.segmentIndex);
      const r = deriveContactObservation(p.guide, p.height, p.surface, body, v.profile.rearStation, 0, v.course.segmentIndex);
      if (![v.x, v.y, v.z, v.velocityX, v.velocityY, v.velocityZ, v.pitch, v.yaw,
        v.pitchRate, v.yawRate, v.frontWheelOmega, v.rearWheelOmega, v.frontSteerAngle,
        v.powertrain.engineRpm].every(Number.isFinite)) throw new Error('nonfinite mechanics');
      out.seconds = (tick + 1) / hz; out.finalSpeed = v.speed;
      out.minSpeed = Math.min(out.minSpeed, v.speed); out.distance += v.speed / hz;
      const beta = Math.atan2(v.lateralSpeed, v.longitudinalSpeed) * DEG;
      out.maxAbsBeta = Math.max(out.maxAbsBeta, Math.abs(beta));
      if (v.speed > 5 && Math.abs(beta) > out.maxAbsMovingBeta) {
        out.maxAbsMovingBeta = Math.abs(beta); out.speedAtMaxMovingBeta = v.speed; out.timeAtMaxMovingBeta = out.seconds;
      }
      if (v.speed > 15) out.maxAbsBetaAbove15 = Math.max(out.maxAbsBetaAbove15, Math.abs(beta));
      out.maxAbsYawRate = Math.max(out.maxAbsYawRate, Math.abs(v.yawRate));
      out.maxAbsPitch = Math.max(out.maxAbsPitch, Math.abs(v.pitch) * DEG);
      out.frontLiftTime += Number(f.gap > 1e-5 && r.normalLoad > 0) / hz;
      out.rearLiftTime += Number(r.gap > 1e-5 && f.normalLoad > 0) / hz;
      const air = f.gap > 1e-5 && r.gap > 1e-5;
      out.airborneTime += Number(air) / hz;
      if (wasAir && (f.normalLoad > 0 || r.normalLoad > 0)) out.recontacts++;
      wasAir = air || (wasAir && !(f.normalLoad > 0 || r.normalLoad > 0));
      const c = v.control;
      out.supportLimitedTime += Number(c.supportTorqueScale < 1) / hz;
      out.infeasibleTime += Number(!c.supportFeasible) / hz;
      if (!Number.isFinite(c.supportTorqueScale) || c.supportTorqueScale < 0 || c.supportTorqueScale > 1)
        throw new Error('invalid support scale');
      if (!c.supportFeasible) out.infeasibleNonzeroTorque = Math.max(out.infeasibleNonzeroTorque,
        Math.abs(c.frontDriveTorque) + Math.abs(c.rearDriveTorque) + Math.abs(c.frontBrakeTorque) + Math.abs(c.rearBrakeTorque));
      for (const side of ['Front', 'Rear']) for (const axis of ['Drive', 'Brake']) {
        const got = c[side.toLowerCase() + axis + 'Torque'], requested = c['requested' + side + axis + 'Torque'];
        if (![got, requested].every(Number.isFinite)) throw new Error('nonfinite delivered torque');
        out.torqueBudgetViolation = Math.max(out.torqueBudgetViolation, -got, got - requested);
      }
      out.torqueBudgetViolation = Math.max(out.torqueBudgetViolation,
        Math.abs(c.deliveredDriveTorque - c.frontDriveTorque - c.rearDriveTorque));
      const forces = [f, r].map((contact, i) => {
        const force = evaluateTireForce(i ? v.rearWheelOmega : v.frontWheelOmega,
          contact.effectiveRollingRadius, contact.longitudinalVelocity, contact.lateralVelocity,
          contact.tireFrameValid ? contact.normalLoad : 0, contact.surface.material.gripFactor,
          contact.profile.tire, i ? v.tireFrictionCalibration.rear : v.tireFrictionCalibration.front);
        if (force.capacityX > 0 && force.capacityY > 0) out.maxEllipse = Math.max(out.maxEllipse,
          (force.fx / force.capacityX) ** 2 + (force.fy / force.capacityY) ** 2);
        out.maxPositiveSlipPower = Math.max(out.maxPositiveSlipPower,
          -force.referenceSpeed * (force.fx * force.sx + force.fy * force.sy));
        if (!contact.normalLoad || !contact.tireFrameValid) out.zeroLoadForceViolation = Math.max(
          out.zeroLoadForceViolation, Math.abs(force.fx), Math.abs(force.fy));
        out.minGrip = Math.min(out.minGrip ?? Infinity, contact.surface.material.gripFactor);
        out.maxGrip = Math.max(out.maxGrip, contact.surface.material.gripFactor);
        return force;
      });
      const grip = f.surface.material.gripFactor;
      if (previousGrip !== null && grip !== previousGrip) out.gripTransition = true;
      previousGrip = grip;
      if (capture && (tick + 1) % (hz / 20) === 0) out.rows.push({ t: out.seconds, speed: v.speed, beta,
        pitch: v.pitch * DEG, pitchRate: v.pitchRate, yawRate: v.yawRate,
        frontGap: f.gap, rearGap: r.gap, frontLoad: f.normalLoad, rearLoad: r.normalLoad,
        frontSx: forces[0].sx, rearSx: forces[1].sx, grip, ...c });
      out.overturned = [f, r].some(contact => body.up.x * contact.surface.normal.x
        + body.up.y * contact.surface.normal.y + body.up.z * contact.surface.normal.z <= 0);
      if (out.overturned) break;
      if (tick === ticks - 1) out.completed = true;
    } catch (error) { out.error = String(error); break; }
  }
  if (!capture) delete out.rows;
  return out;
}
async function main() {
  const args = process.argv.slice(2);
  let hz = 120, out, calibration = 'browser';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hz') hz = Number(args[++i]);
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--calibration') calibration = args[++i];
    else throw new RangeError(`unknown option ${args[i]}`);
  }
  const rows = [];
  for (const entry of VEHICLE_CATALOG) for (const [name, options] of Object.entries(TERRAIN_CASES)) {
    const result = { name, ...runTerrainProbe(entry, { ...options, hz, calibration }) };
    rows.push(result); console.log(JSON.stringify(result));
  }
  if (out) await writeFile(out, JSON.stringify({ node: process.version, hz, calibration,
    observation: 'Outer-tick post-update contact samples; control telemetry is the final internal substep. Not continuous-time certification.', rows }, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error); process.exitCode = 1; });
