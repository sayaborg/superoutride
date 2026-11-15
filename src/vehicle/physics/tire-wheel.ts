/**
 * m/s: smooth the tire slip denominator and rolling sign at standstill, and the speed above which ABS and MSR act. A
 * value the author chose, not derived (docs/vehicle-physics.md).
 */
export const TIRE_LOW_SPEED_REGULARIZATION = 1.0;
import type { Writable } from '../../core/writable.js';
const WHEEL_BISECTION_ITERATIONS = 60;

import {
  brushForce,
  slidingFall,
  tirePeakSlip,
  type CompiledTireCharacteristics,
} from './tire-friction-calibration.js';

// N m: absolute bisection residual budget, ~55 ulps for a 10^4 N m torque balance.
// The implied wheel-speed error is at most residual*dt/inertia for the monotone wheel equation.
const WHEEL_TORQUE_RESIDUAL_NEWTON_METERS = 1e-10;

interface TireSlip {
  readonly sx: number;
  readonly sy: number;
  readonly referenceSpeed: number;
}
interface TireForceResult extends TireSlip {
  readonly fx: number;
  readonly fy: number;
  /** The force's bound, `Ne*gripFactor*mu`. */
  readonly capacity: number;
  /** The slip over the peak slip, not a force magnitude or a stored contact phase; 1 at the peak. */
  readonly theta: number;
  /** The fall past the peak the force carries, taken at the substep's starting wheel speed; 1 up to the peak. */
  readonly fall: number;
}

export interface WheelSolveInput {
  readonly omegaPrevious: number;
  readonly inertia: number;
  readonly rollingRadius: number;
  readonly longitudinalVelocity: number;
  readonly lateralVelocity: number;
  readonly normalLoad: number;
  readonly gripFactor: number;
  readonly characteristics: CompiledTireCharacteristics;
  readonly rollingResistance: number;
  /** Actual torque delivered for this substep, after any external torque protection. */
  readonly driveTorque: number;
  readonly brakeTorque: number;
  readonly dt: number;
}
export interface WheelSolveResult {
  readonly omega: number;
  readonly omegaDot: number;
  readonly tire: TireForceResult;
  readonly locked: boolean;
}

// One caller-owned numerical trial; published results retain their existing fields.
type TireForceScratch = ReturnType<typeof createTireForceScratch>;
export function createTireForceScratch() {
  return {
    sx: 0,
    sy: 0,
    referenceSpeed: 0,
    fx: 0,
    fy: 0,
    capacity: 0,
    theta: 0,
    fall: 1,
    omega: 0,
  };
}
function createTireForceResult() {
  return {
    sx: 0,
    sy: 0,
    referenceSpeed: 0,
    fx: 0,
    fy: 0,
    capacity: 0,
    theta: 0,
    fall: 1,
  };
}
function readTireForce(s: TireForceScratch, out: Writable<TireForceResult>): TireForceResult {
  out.sx = s.sx;
  out.sy = s.sy;
  out.referenceSpeed = s.referenceSpeed;
  out.fx = s.fx;
  out.fy = s.fy;
  out.capacity = s.capacity;
  out.theta = s.theta;
  out.fall = s.fall;
  return out;
}
function writeSlip(
  omega: number,
  rollingRadius: number,
  vx: number,
  vy: number,
  referenceSpeed: number,
  out: Writable<TireSlip>,
): void {
  out.sx = (rollingRadius * omega - vx) / referenceSpeed;
  out.sy = -vy / referenceSpeed;
  out.referenceSpeed = referenceSpeed;
}
function evaluateTireForceValidated(input: WheelSolveInput, out: TireForceScratch): void {
  const omega = out.omega,
    referenceSpeed = out.referenceSpeed;
  if (!Number.isFinite(omega)) throw new RangeError('trial wheel speed must be finite');
  writeSlip(omega, input.rollingRadius, input.longitudinalVelocity, input.lateralVelocity, referenceSpeed, out);
  forceFromSlip(out, input.normalLoad, input.gripFactor, input.characteristics);
}
/** The brush's force: its bound times `H(theta)` and the fall, opposing the slip; none without load or grip. */
function forceFromSlip(
  out: TireForceScratch,
  normalLoad: number,
  gripFactor: number,
  characteristics: CompiledTireCharacteristics,
): void {
  const capacity = tireForceCapacity(normalLoad, gripFactor, characteristics.grip);
  out.capacity = capacity;
  out.fx = 0;
  out.fy = 0;
  out.theta = 0;
  if (!(capacity > 0)) return;
  const sigma = Math.hypot(out.sx, out.sy);
  if (sigma === 0) return;
  const theta = sigma / tirePeakSlip(characteristics, gripFactor);
  out.theta = theta;
  const magnitude = (capacity * brushForce(theta) * out.fall) / sigma;
  out.fx = magnitude * out.sx;
  out.fy = magnitude * out.sy;
}

/**
 * The fall a substep's wheel solve takes its force with: the fall at the slip of the substep's starting wheel speed under
 * its contact velocities, held through the solve. The force then grows with the trial wheel speed as the law without
 * its fall does, so the residual stays monotone; a fall taken at the trial speed itself would let it decrease at low
 * speed under load and give the solve several roots.
 */
function startingFall(input: WheelSolveInput, scratch: TireForceScratch): number {
  writeSlip(
    input.omegaPrevious,
    input.rollingRadius,
    input.longitudinalVelocity,
    input.lateralVelocity,
    scratch.referenceSpeed,
    scratch,
  );
  const tire = input.characteristics;
  if (!(input.gripFactor > 0)) return 1;
  const theta = Math.hypot(scratch.sx, scratch.sy) / tirePeakSlip(tire, input.gripFactor);
  return slidingFall(theta, tire.slidingRatio);
}

/** Surface rolling resistance remains a separate continuous wheel torque. */
function rollingResistanceTorque(
  omega: number,
  rollingRadius: number,
  normalLoad: number,
  rollingResistance: number,
  lowSpeedRegularization: number,
): number {
  if (!(normalLoad > 0) || !(rollingResistance > 0)) return 0;
  const rollingSpeed = rollingRadius * omega;
  const smoothSign = rollingSpeed / Math.hypot(rollingSpeed, lowSpeedRegularization);
  return rollingResistance * normalLoad * rollingRadius * smoothSign;
}

/**
 * Unique scalar backward-Euler wheel root with a Coulomb brake atom at Omega=0.
 * The no-brake residual stays monotone: the monotone two-axis saturation uses fixed contact data and the fall past the
 * peak taken at the substep's starting wheel speed. Bounded tire and rolling torques make the finite bracket explicit
 * rather than heuristic.
 */
export function createWheelSolveResult() {
  return { omega: 0, omegaDot: 0, tire: createTireForceResult(), locked: false };
}

export function solveWheelOmega(
  input: WheelSolveInput,
  out: ReturnType<typeof createWheelSolveResult>,
  residual: Float64Array,
  scratch: TireForceScratch,
): WheelSolveResult {
  const {
    omegaPrevious,
    inertia,
    rollingRadius,
    normalLoad,
    gripFactor,
    characteristics,
    rollingResistance,
    driveTorque,
    brakeTorque,
    dt,
  } = input;
  // Contact velocity and the fall are fixed throughout the scalar solve, including its final force evaluation.
  scratch.referenceSpeed = Math.hypot(input.longitudinalVelocity, TIRE_LOW_SPEED_REGULARIZATION);
  scratch.fall = startingFall(input, scratch);
  scratch.omega = 0;
  netTorqueAtOmega(input, scratch, residual);
  const atZero = residual[0]! - driveTorque;
  let omega: number;
  let locked = false;
  if (Math.abs(atZero) <= brakeTorque) {
    omega = 0;
    locked = brakeTorque > 0;
  } else {
    const maxRoadTorque = rollingRadius * tireForceCapacity(normalLoad, gripFactor, characteristics.grip);
    const maxRollingTorque = rollingResistance * Math.max(0, normalLoad) * rollingRadius;
    const span =
      Math.abs(omegaPrevious) +
      (dt * (Math.abs(driveTorque) + brakeTorque + maxRoadTorque + maxRollingTorque)) / inertia +
      1;

    if (atZero < -brakeTorque) {
      omega = bisectMonotone(input, scratch, true, 0, span, residual);
    } else {
      omega = bisectMonotone(input, scratch, false, -span, 0, residual);
    }
  }

  scratch.omega = omega;
  evaluateTireForceValidated(input, scratch);
  readTireForce(scratch, out.tire);
  out.omega = omega;
  out.omegaDot = (omega - omegaPrevious) / dt;
  out.locked = locked;
  return out;
}

/** Inverse of the SAME backward-Euler wheel equation, before the signed brake atom.
 * Fixed contact data only. A control boundary may restrict torque, never overwrite Omega.
 */
export function wheelRequiredNetTorque(
  input: WheelSolveInput,
  omega: number,
  scratch: TireForceScratch,
  residual: Float64Array,
): number {
  if (!Number.isFinite(omega)) throw new RangeError('trial wheel speed must be finite');
  scratch.referenceSpeed = Math.hypot(input.longitudinalVelocity, TIRE_LOW_SPEED_REGULARIZATION);
  scratch.fall = startingFall(input, scratch);
  scratch.omega = omega;
  netTorqueAtOmega(input, scratch, residual);
  return residual[0]!;
}

function netTorqueAtOmega(input: WheelSolveInput, scratch: TireForceScratch, residual: Float64Array): void {
  const omega = scratch.omega;
  evaluateTireForceValidated(input, scratch);
  residual[0]! =
    (input.inertia / input.dt) * (omega - input.omegaPrevious) +
    input.rollingRadius * scratch.fx +
    rollingResistanceTorque(
      omega,
      input.rollingRadius,
      input.normalLoad,
      input.rollingResistance,
      TIRE_LOW_SPEED_REGULARIZATION,
    );
}

function wheelResidual(input: WheelSolveInput, scratch: TireForceScratch, positive: boolean, out: Float64Array): void {
  netTorqueAtOmega(input, scratch, out);
  const residual = out[0]! - input.driveTorque;
  out[0]! = positive ? residual + input.brakeTorque : residual - input.brakeTorque;
}

function bisectMonotone(
  input: WheelSolveInput,
  scratch: TireForceScratch,
  positive: boolean,
  lowerInput: number,
  upperInput: number,
  residual: Float64Array,
): number {
  let lower = lowerInput;
  let upper = upperInput;
  scratch.omega = lower;
  wheelResidual(input, scratch, positive, residual);
  const fLower = residual[0]!;
  scratch.omega = upper;
  wheelResidual(input, scratch, positive, residual);
  const fUpper = residual[0]!;
  if (fLower > 0 || fUpper < 0) {
    throw new Error(`wheel root bracket invalid: [${fLower}, ${fUpper}]`);
  }
  for (let i = 0; i < WHEEL_BISECTION_ITERATIONS; i += 1) {
    const mid = (lower + upper) * 0.5;
    scratch.omega = mid;
    wheelResidual(input, scratch, positive, residual);
    const fMid = residual[0]!;
    if (Math.abs(fMid) < WHEEL_TORQUE_RESIDUAL_NEWTON_METERS) return mid;
    if (fMid < 0) {
      lower = mid;
    } else {
      upper = mid;
    }
  }
  return (lower + upper) * 0.5;
}

/**
 * Finiteness of the values that change every substep: wheel state, contact observations and torque
 * requests. Compiled station, tire, material and step values are admitted products and are not rechecked.
 */
export function validateWheelSolveInput(input: WheelSolveInput): void {
  if (!(input.brakeTorque >= 0) || !Number.isFinite(input.brakeTorque))
    throw new RangeError('brake torque must be finite and >= 0');
  if (
    !Number.isFinite(input.omegaPrevious) ||
    !Number.isFinite(input.longitudinalVelocity) ||
    !Number.isFinite(input.lateralVelocity) ||
    !Number.isFinite(input.normalLoad) ||
    !Number.isFinite(input.gripFactor) ||
    !Number.isFinite(input.driveTorque)
  ) {
    throw new RangeError('wheel solve inputs must be finite');
  }
}

function tireForceCapacity(normalLoad: number, gripFactor: number, mu: number): number {
  return Math.max(0, normalLoad) * Math.max(0, gripFactor) * mu;
}
