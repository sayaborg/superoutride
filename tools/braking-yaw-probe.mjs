/** Same-reached-state input forks. Read-only force attribution, NOT a yaw controller. */
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTerrainProbe, terrainInput } from './torque-protection-terrain-probe.mjs';
import { forkProbe } from './drift-control-probe.mjs';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { updateArcadeVehicle, arcadeBodyKinematics, vehicleBodyTravelDirection } from '../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation, momentAboutCg } from '../dist/physics/vehicle-dynamics.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { steeringAutomaticMax } from '../dist/physics/vehicle-calibration.js';
import { scale3 } from '../dist/physics/vehicle-math3.js';

const DEG = 180 / Math.PI;
export const BRAKING_ACTIONS = Object.freeze([
  'holdCoast', 'holdBrake25', 'holdBrake50', 'holdBrake100', 'releaseCoast',
  'releaseBrake', 'delayedReleaseBrake', 'counterPulseBrake', 'reverseCoast', 'reverseBrake',
]);
export function brakingInput(t, action, { direction = 1, correctionSeconds = .3,
  applyMode = 'RATE_LIMITED' } = {}) {
  if (!Number.isFinite(t) || t < 0 || !BRAKING_ACTIONS.includes(action)
    || ![-1, 1].includes(direction) || !Number.isFinite(correctionSeconds) || correctionSeconds < 0
    || !['RATE_LIMITED', 'DIRECT'].includes(applyMode)) throw new RangeError('invalid braking input schedule');
  let steering = .35, brake = 0;
  if (action === 'holdBrake25') brake = .25;
  if (action === 'holdBrake50') brake = .5;
  if (['holdBrake100', 'releaseBrake', 'delayedReleaseBrake', 'counterPulseBrake', 'reverseBrake'].includes(action)) brake = 1;
  if (['releaseCoast', 'releaseBrake'].includes(action)) steering = 0;
  if (action === 'delayedReleaseBrake') steering = t < correctionSeconds ? .35 : 0;
  if (action === 'counterPulseBrake') steering = t < correctionSeconds ? -.35 : 0;
  if (['reverseCoast', 'reverseBrake'].includes(action)) steering = -.35;
  return { steering: direction * steering, throttle: 0, brake,
    steeringApplyMode: applyMode, pedalApplyMode: applyMode };
}

/** Fingerprint mechanical state and policy/calibration, without treating derived getters as authority. */
export function brakingStateFingerprint(vehicle) {
  const values = Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(vehicle))
    .filter(([, descriptor]) => 'value' in descriptor).map(([key, descriptor]) => [key, descriptor.value]));
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/** Fresh post-update observations. Contact moments are NOT the previous integrated substep wrench. */
export function observeBrakingState(probe, t) {
  const { vehicle: v, guide, height, surface } = probe, body = arcadeBodyKinematics(v);
  const station = (side, profile, steer, omega) => {
    const c = deriveContactObservation(guide, height, surface, body, profile, steer, v.course.segmentIndex);
    const f = evaluateTireForce(omega, c.effectiveRollingRadius, c.longitudinalVelocity, c.lateralVelocity,
      c.tireFrameValid ? c.normalLoad : 0, c.surface.material.gripFactor, profile.tire, v.tireFrictionCalibration[side]);
    const yawX = momentAboutCg(c, body.position, scale3(c.tireForward, f.fx)).y;
    const yawY = momentAboutCg(c, body.position, scale3(c.tireRight, f.fy)).y;
    const yawNormal = momentAboutCg(c, body.position, scale3(c.surface.normal, c.normalLoad)).y;
    const valid = f.capacityX > 0 && f.capacityY > 0;
    return { load: c.normalLoad, gap: c.gap, q: c.q, qDot: c.qDot,
      vx: c.longitudinalVelocity, vy: c.lateralVelocity, omega,
      sx: f.sx, sy: f.sy, fx: f.fx, fy: f.fy, capacityX: f.capacityX, capacityY: f.capacityY,
      normalizedFx: valid ? f.fx / f.capacityX : null, normalizedFy: valid ? f.fy / f.capacityY : null,
      ellipse: valid ? (f.fx / f.capacityX) ** 2 + (f.fy / f.capacityY) ** 2 : 0,
      dissipatedSlipPower: f.referenceSpeed * (f.fx * f.sx + f.fy * f.sy),
      yawX, yawY, yawNormal, yawContact: yawX + yawY + yawNormal,
      upright: body.up.x * c.surface.normal.x + body.up.y * c.surface.normal.y + body.up.z * c.surface.normal.z > 0 };
  };
  const front = station('front', v.profile.frontStation, v.frontSteerAngle, v.frontWheelOmega);
  const rear = station('rear', v.profile.rearStation, 0, v.rearWheelOmega);
  return { t, speed: v.speed, beta: Math.atan2(v.lateralSpeed, v.longitudinalSpeed) * DEG,
    yawRate: v.yawRate, pitch: v.pitch * DEG, steer: v.frontSteerAngle * DEG,
    automaticLimited: Math.abs(vehicleBodyTravelDirection(body, v.profile.steeringLowSpeedRegularization))
      >= steeringAutomaticMax(v.steeringCalibration),
    x: v.x, z: v.z, front, rear, control: { ...v.control },
    gear: v.powertrain.gear, rpm: v.powertrain.engineRpm };
}

/** Exact symmetric accounting of M=N*m between two observed states, not a simulated load replacement.
 * The remainder includes force-per-load AND contact geometry/frame changes. No causal exclusivity claim.
 */
export function decomposeContactYawChange(before, after) {
  let loadContribution = 0, responseAndGeometryContribution = 0;
  for (const side of ['front', 'rear']) {
    const a = before[side], b = after[side];
    if (!(a.load > 0 && b.load > 0)) return null;
    const ma = a.yawContact / a.load, mb = b.yawContact / b.load;
    loadContribution += (b.load - a.load) * (ma + mb) / 2;
    responseAndGeometryContribution += (mb - ma) * (a.load + b.load) / 2;
  }
  const delta = after.front.yawContact + after.rear.yawContact - before.front.yawContact - before.rear.yawContact;
  return { delta, loadContribution, responseAndGeometryContribution,
    residual: delta - loadContribution - responseAndGeometryContribution };
}

export function runBrakingComparison(entry, { hz = 120, grip = 1, direction = 1,
  speed = 30, seconds = 4.5, correctionSeconds = .3, calibration = 'browser',
  applyMode = 'RATE_LIMITED', actions = BRAKING_ACTIONS, capture = false } = {}) {
  if (![60, 120, 240].includes(hz) || !Number.isFinite(seconds) || seconds <= 0
    || !Number.isInteger(seconds * hz) || !Array.isArray(actions) || actions.length === 0
    || new Set(actions).size !== actions.length) throw new RangeError('invalid braking comparison domain');
  for (const action of actions) brakingInput(0, action, { direction, correctionSeconds, applyMode });
  const parent = createTerrainProbe(entry, { speed, grip, calibration });
  for (let tick = 0; tick < hz * 1.5; tick++) {
    const input = { ...terrainInput(tick / hz, 'turnBrake', direction),
      steeringApplyMode: applyMode, pedalApplyMode: applyMode };
    updateArcadeVehicle(parent.guide, parent.height, parent.surface, parent.vehicle, input, 1 / hz);
  }
  const fingerprint = brakingStateFingerprint(parent.vehicle);
  const initial = observeBrakingState(parent, 0), results = [];
  for (const action of actions) {
    const probe = forkProbe(parent), v = probe.vehicle;
    if (probe.guide !== parent.guide || probe.height !== parent.height || probe.surface !== parent.surface
      || brakingStateFingerprint(v) !== fingerprint) throw new Error('comparison fork changed reached state/world');
    const out = { action, initialFingerprint: fingerprint, completed: false, error: null, seconds: 0,
      initialSpeed: initial.speed, finalSpeed: initial.speed, minimumSpeed: initial.speed,
      maxAbsBetaAbove15: initial.speed > 15 ? Math.abs(initial.beta) : null,
      peakAbove15: initial.speed > 15 ? initial : null, distance: 0, forwardDisplacement: 0,
      maxAbsYawRate: Math.abs(initial.yawRate), firstBeta15: null, firstBeta45: null, firstBeta90: null,
      firstAutomaticLimit: null, lockTimeBefore45: 0, liftTime: 0, infeasibleTime: 0,
      maxTorqueBudgetViolation: 0, maxEllipse: 0, maxPositiveSlipPower: 0,
      samples: [], rows: capture ? [initial] : undefined };
    for (let tick = 0; tick < seconds * hz; tick++) {
      const input = brakingInput(tick / hz, action, { direction, correctionSeconds, applyMode });
      try {
        updateArcadeVehicle(probe.guide, probe.height, probe.surface, v, input, 1 / hz);
        if (![v.x, v.y, v.z, v.velocityX, v.velocityY, v.velocityZ, v.yaw, v.pitch,
          v.yawRate, v.pitchRate, v.frontWheelOmega, v.rearWheelOmega].every(Number.isFinite)) throw new Error('nonfinite mechanics');
        const x = observeBrakingState(probe, (tick + 1) / hz), c = x.control;
        if (!x.front.upright || !x.rear.upright) throw new Error('overturned');
        out.seconds = x.t; out.finalSpeed = x.speed; out.minimumSpeed = Math.min(out.minimumSpeed, x.speed);
        out.distance += x.speed / hz; out.forwardDisplacement = x.z - initial.z;
        out.maxAbsYawRate = Math.max(out.maxAbsYawRate, Math.abs(x.yawRate));
        if (x.speed > 15) {
          if (out.maxAbsBetaAbove15 === null || Math.abs(x.beta) > out.maxAbsBetaAbove15) {
            out.maxAbsBetaAbove15 = Math.abs(x.beta); out.peakAbove15 = x;
          }
          for (const angle of [15, 45, 90]) if (Math.abs(x.beta) >= angle && out['firstBeta' + angle] === null)
            out['firstBeta' + angle] = x;
          if (Math.abs(x.beta) < 45 && (c.frontWheelLocked || c.rearWheelLocked)) out.lockTimeBefore45 += 1 / hz;
        }
        if (x.automaticLimited && out.firstAutomaticLimit === null) out.firstAutomaticLimit = x;
        out.liftTime += Number((x.front.gap > 1e-5 && x.rear.load > 0)
          || (x.rear.gap > 1e-5 && x.front.load > 0)) / hz;
        out.infeasibleTime += Number(!c.supportFeasible) / hz;
        for (const side of ['Front', 'Rear']) for (const axis of ['Drive', 'Brake']) {
          const got = c[side.toLowerCase() + axis + 'Torque'], requested = c['requested' + side + axis + 'Torque'];
          if (![got, requested].every(Number.isFinite)) throw new Error('nonfinite torque');
          out.maxTorqueBudgetViolation = Math.max(out.maxTorqueBudgetViolation, -got, got - requested);
        }
        for (const tire of [x.front, x.rear]) {
          out.maxEllipse = Math.max(out.maxEllipse, tire.ellipse);
          out.maxPositiveSlipPower = Math.max(out.maxPositiveSlipPower, -tire.dissipatedSlipPower);
        }
        if ([.1, .2, .3, .5, 1].some(t => tick + 1 === Math.round(t * hz))) out.samples.push({ ...x,
          contactYawChange: decomposeContactYawChange(initial, x) });
        if (capture && (tick + 1) % (hz / 20) === 0) out.rows.push(x);
        if (tick === seconds * hz - 1) out.completed = true;
      } catch (error) { out.error = String(error); break; }
    }
    results.push(out);
    if (brakingStateFingerprint(parent.vehicle) !== fingerprint) throw new Error('replay mutated its parent');
  }
  return { id: entry.profile.id, hz, grip, direction, calibration, applyMode, speed, seconds,
    correctionSeconds, prefixSeconds: 1.5, initialFingerprint: fingerprint, initial, results };
}

async function main() {
  const args = process.argv.slice(2);
  let hz = 120, out, id, capture = false, calibration = 'browser', applyMode = 'RATE_LIMITED';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hz') hz = Number(args[++i]);
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--id') id = args[++i];
    else if (args[i] === '--capture') capture = true;
    else if (args[i] === '--calibration') calibration = args[++i];
    else if (args[i] === '--apply-mode') applyMode = args[++i];
    else throw new RangeError(`unknown argument ${args[i]}`);
  }
  if (args.includes('--out') && !out) throw new RangeError('--out needs a path');
  const entries = id === undefined ? VEHICLE_CATALOG : VEHICLE_CATALOG.filter(e => e.profile.id === id);
  if (entries.length === 0 || (args.includes('--id') && id === undefined)) throw new RangeError('unknown/missing vehicle id');
  const comparisons = [];
  for (const entry of entries) for (const grip of [1, .25]) {
    const comparison = runBrakingComparison(entry, { hz, grip, calibration, applyMode, capture });
    comparisons.push(comparison);
    console.log(JSON.stringify({ id: entry.profile.id, grip, outcomes: comparison.results.map(r => ({
      action: r.action, completed: r.completed, maxAbsBetaAbove15: r.maxAbsBetaAbove15, error: r.error })) }));
  }
  if (out) await writeFile(out, JSON.stringify({ node: process.version,
    scope: 'Input-only matched forks; sampled post-update contact moments, not exact integrated wrench or yaw certification.',
    comparisons }, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error); process.exitCode = 1; });
