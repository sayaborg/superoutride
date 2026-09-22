import type { Writable } from '../../core/writable.js';
const WHEEL_BISECTION_ITERATIONS = 60;

import { validateTireCharacteristics, type CompiledTireCharacteristics } from './tire-friction-calibration.js';

const WHEEL_TORQUE_RESIDUAL_NEWTON_METERS = 1e-10;

export interface CompiledTireProfile extends CompiledTireCharacteristics {
  readonly lowSpeedRegularization: number;
}

interface TireSlip {
  readonly sx: number;
  readonly sy: number;
  readonly referenceSpeed: number;
}
interface TireDemand extends TireSlip {
  readonly dx: number;
  readonly dy: number;
}
interface TireForceResult extends TireDemand {
  readonly fx: number;
  readonly fy: number;
  readonly capacityX: number;
  readonly capacityY: number;
  /** Demand in the capacity ellipse, not a force magnitude or a stored contact phase. */
  readonly rho: number;
}

export interface WheelSolveInput {
  readonly omegaPrevious: number;
  readonly inertia: number;
  readonly rollingRadius: number;
  readonly longitudinalVelocity: number;
  readonly lateralVelocity: number;
  readonly normalLoad: number;
  readonly gripFactor: number;
  readonly characteristics?: CompiledTireCharacteristics;
  readonly rollingResistance: number;
  /** Actual torque delivered for this substep, after any external torque protection. */
  readonly driveTorque: number;
  readonly brakeTorque: number;
  readonly dt: number;
  readonly tire: CompiledTireProfile;
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
  return { sx: 0, sy: 0, referenceSpeed: 0, dx: 0, dy: 0, fx: 0, fy: 0, capacityX: 0, capacityY: 0, rho: 0, omega: 0 };
}
function createTireForceResult() {
  return { sx: 0, sy: 0, referenceSpeed: 0, dx: 0, dy: 0, fx: 0, fy: 0, capacityX: 0, capacityY: 0, rho: 0 };
}
function readTireForce(s: TireForceScratch, out: Writable<TireForceResult>): TireForceResult {
  out.sx = s.sx;
  out.sy = s.sy;
  out.referenceSpeed = s.referenceSpeed;
  out.dx = s.dx;
  out.dy = s.dy;
  out.fx = s.fx;
  out.fy = s.fy;
  out.capacityX = s.capacityX;
  out.capacityY = s.capacityY;
  out.rho = s.rho;
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
function writeDemand(
  out: Writable<TireDemand>,
  normalLoad: number,
  characteristics: CompiledTireCharacteristics,
): void {
  const load = Math.max(0, normalLoad);
  out.dx = load * characteristics.kX * out.sx;
  out.dy = load * characteristics.kY * out.sy;
}
function tireReferenceSpeed(vx: number, v0: number): number {
  if (!Number.isFinite(vx) || !Number.isFinite(v0) || !(v0 > 0))
    throw new RangeError('tire velocity must be finite and low-speed regularization > 0');
  return Math.hypot(vx, v0);
}
export function regularizedTireSlipAngle(vx: number, vy: number, v0: number): number {
  if (!Number.isFinite(vy)) throw new RangeError('tire lateral velocity must be finite');
  return Math.atan2(-vy, tireReferenceSpeed(vx, v0));
}
function evaluateTireForceValidated(input: WheelSolveInput, out: TireForceScratch): void {
  const omega = out.omega,
    referenceSpeed = out.referenceSpeed;
  if (!Number.isFinite(omega)) throw new RangeError('trial wheel speed must be finite');
  const characteristics = input.characteristics ?? input.tire;
  writeSlip(omega, input.rollingRadius, input.longitudinalVelocity, input.lateralVelocity, referenceSpeed, out);
  writeDemand(out, input.normalLoad, characteristics);
  forceFromDemand(out, input.normalLoad, input.gripFactor, characteristics);
}
function forceFromDemand(
  out: TireForceScratch,
  normalLoad: number,
  gripFactor: number,
  characteristics: CompiledTireCharacteristics,
): void {
  const capacityX = tireForceCapacity(normalLoad, gripFactor, characteristics.muX),
    capacityY = tireForceCapacity(normalLoad, gripFactor, characteristics.muY);
  out.capacityX = capacityX;
  out.capacityY = capacityY;
  out.fx = 0;
  out.fy = 0;
  out.rho = 0;
  if (!(capacityX > 0) || !(capacityY > 0)) return;
  const x = (characteristics.kX * out.sx) / characteristics.muX;
  const y = (characteristics.kY * out.sy) / characteristics.muY;
  const length = Math.hypot(x, y),
    rho = length / gripFactor;
  if (length === 0) return;
  out.rho = rho;
  if (rho <= characteristics.rhoKnee) {
    out.fx = out.dx;
    out.fy = out.dy;
    return;
  }
  const h = radialC1Magnitude(rho, characteristics.rhoKnee);
  out.fx = capacityX * h * (x / length);
  out.fy = capacityY * h * (y / length);
}

/** Exact algebraic simplification of the retained C1 Hermite shoulder, for any 0<a<1. */
function radialC1Magnitude(rho: number, a: number): number {
  if (!Number.isFinite(a) || !(a > 0 && a < 1) || Number.isNaN(rho)) {
    throw new RangeError('radial knee must lie in (0,1) and demand cannot be NaN');
  }
  if (!(rho > 0)) return 0;
  if (rho <= a) return rho;
  if (rho >= 2 - a) return 1;
  return rho - (rho - a) ** 2 / (4 * (1 - a));
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
 * The no-brake residual stays monotone: the monotone two-axis saturation uses fixed contact data. Bounded tire and rolling torques make the finite bracket explicit rather than
 * heuristic.
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
  validateWheelSolveInput(input);
  const {
    omegaPrevious,
    inertia,
    rollingRadius,
    normalLoad,
    gripFactor,
    characteristics = input.tire,
    rollingResistance,
    driveTorque,
    brakeTorque,
    dt,
  } = input;
  // Contact velocity is fixed throughout the scalar solve, including its final force evaluation.
  scratch.referenceSpeed = Math.hypot(input.longitudinalVelocity, input.tire.lowSpeedRegularization);
  scratch.omega = 0;
  netTorqueAtOmega(input, scratch, residual);
  const atZero = residual[0]! - driveTorque;
  let omega: number;
  let locked = false;
  if (Math.abs(atZero) <= brakeTorque) {
    omega = 0;
    locked = brakeTorque > 0;
  } else {
    const maxRoadTorque = rollingRadius * tireForceCapacity(normalLoad, gripFactor, characteristics.muX);
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
  validateWheelSolveInput(input);
  if (!Number.isFinite(omega)) throw new RangeError('trial wheel speed must be finite');
  scratch.omega = omega;
  scratch.referenceSpeed = Math.hypot(input.longitudinalVelocity, input.tire.lowSpeedRegularization);
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
      input.tire.lowSpeedRegularization,
    );
}

export function validateCompiledTireProfile(tire: CompiledTireProfile): void {
  validateTireCharacteristics(tire);
  if (!Number.isFinite(tire.lowSpeedRegularization) || !(tire.lowSpeedRegularization > 0)) {
    throw new RangeError('tire low-speed regularization must be finite and > 0');
  }
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

export function validateWheelSolveInput(input: WheelSolveInput): void {
  if (!(input.dt > 0) || !Number.isFinite(input.dt)) throw new RangeError('wheel solve dt must be finite and > 0');
  if (!(input.inertia > 0) || !Number.isFinite(input.inertia))
    throw new RangeError('wheel inertia must be finite and > 0');
  if (!(input.rollingRadius > 0) || !Number.isFinite(input.rollingRadius))
    throw new RangeError('wheel radius must be finite and > 0');
  if (!(input.brakeTorque >= 0) || !Number.isFinite(input.brakeTorque))
    throw new RangeError('brake torque must be finite and >= 0');
  if (
    !Number.isFinite(input.omegaPrevious) ||
    !Number.isFinite(input.longitudinalVelocity) ||
    !Number.isFinite(input.lateralVelocity) ||
    !Number.isFinite(input.normalLoad) ||
    !Number.isFinite(input.gripFactor) ||
    !Number.isFinite(input.rollingResistance) ||
    !Number.isFinite(input.driveTorque)
  ) {
    throw new RangeError('wheel solve inputs must be finite');
  }
  if (input.rollingResistance < 0) throw new RangeError('rolling resistance must be nonnegative');
  validateCompiledTireProfile(input.tire);
  validateTireCharacteristics(input.characteristics ?? input.tire);
}

function tireForceCapacity(normalLoad: number, gripFactor: number, mu: number): number {
  return Math.max(0, normalLoad) * Math.max(0, gripFactor) * mu;
}
