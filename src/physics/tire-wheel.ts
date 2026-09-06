import {
  validateTireCharacteristics,
  type CompiledTireCharacteristics,
} from './tire-friction-calibration.js';

export interface CompiledTireProfile extends CompiledTireCharacteristics {
  readonly lowSpeedRegularization: number;
}

export interface TireSlip {
  readonly sx: number;
  readonly sy: number;
  readonly referenceSpeed: number;
}
export interface TireDemand extends TireSlip {
  readonly dx: number;
  readonly dy: number;
}
export interface TireForceResult extends TireDemand {
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

/** Shared kinematics for tire evaluation, diagnostics and a future independent torque controller. */
export function deriveTireSlip(
  omega: number, rollingRadius: number, longitudinalVelocity: number,
  lateralVelocity: number, lowSpeedRegularization: number,
): TireSlip {
  const referenceSpeed = tireReferenceSpeed(longitudinalVelocity, lowSpeedRegularization);
  if (![omega, rollingRadius, lateralVelocity].every(Number.isFinite) || !(rollingRadius > 0)) {
    throw new RangeError('tire motion must be finite and rolling radius > 0');
  }
  return { sx: (rollingRadius * omega - longitudinalVelocity) / referenceSpeed,
    sy: -lateralVelocity / referenceSpeed, referenceSpeed };
}

function tireReferenceSpeed(vx: number, v0: number): number {
  if (!Number.isFinite(vx) || !Number.isFinite(v0) || !(v0 > 0)) {
    throw new RangeError('tire velocity must be finite and low-speed regularization > 0');
  }
  return Math.hypot(vx, v0);
}

export function regularizedTireSlipAngle(vx: number, vy: number, v0: number): number {
  if (!Number.isFinite(vy)) throw new RangeError('tire lateral velocity must be finite');
  return Math.atan2(-vy, tireReferenceSpeed(vx, v0));
}

export function tireLinearDemand(
  omega: number, rollingRadius: number, longitudinalVelocity: number, lateralVelocity: number,
  normalLoad: number, tire: CompiledTireProfile, characteristics: CompiledTireCharacteristics = tire,
): TireDemand {
  if (!Number.isFinite(normalLoad)) throw new RangeError('tire normal load must be finite');
  const slip = deriveTireSlip(omega, rollingRadius, longitudinalVelocity, lateralVelocity,
    tire.lowSpeedRegularization);
  const load = Math.max(0, normalLoad);
  return { ...slip, dx: load * characteristics.kX * slip.sx,
    dy: load * characteristics.kY * slip.sy };
}

/** One load-homogeneous, dissipative two-axis force. No post-peak multiplier or drift state. */
export function evaluateTireForce(
  omega: number, rollingRadius: number, longitudinalVelocity: number, lateralVelocity: number,
  normalLoad: number, gripFactor: number, tire: CompiledTireProfile,
  characteristics: CompiledTireCharacteristics = tire,
): TireForceResult {
  validateTireCharacteristics(characteristics);
  if (!Number.isFinite(gripFactor)) throw new RangeError('surface grip must be finite');
  const demand = tireLinearDemand(omega, rollingRadius, longitudinalVelocity, lateralVelocity,
    normalLoad, tire, characteristics);
  const capacityX = tireForceCapacity(normalLoad, gripFactor, characteristics.muX);
  const capacityY = tireForceCapacity(normalLoad, gripFactor, characteristics.muY);
  if (!(capacityX > 0) || !(capacityY > 0)) {
    return { ...demand, fx: 0, fy: 0, capacityX, capacityY, rho: 0 };
  }
  // Cancel N analytically. Never divide by tiny contact loads or invent a stiffness floor.
  const x = characteristics.kX * demand.sx / characteristics.muX;
  const y = characteristics.kY * demand.sy / characteristics.muY;
  const length = Math.hypot(x, y);
  const rho = length / gripFactor;
  if (length === 0) return { ...demand, fx: 0, fy: 0, capacityX, capacityY, rho: 0 };
  if (rho <= characteristics.rhoKnee) {
    return { ...demand, fx: demand.dx, fy: demand.dy, capacityX, capacityY, rho };
  }
  const h = radialC1Magnitude(rho, characteristics.rhoKnee);
  return { ...demand, fx: capacityX * h * (x / length),
    fy: capacityY * h * (y / length), capacityX, capacityY, rho };
}

/** Exact algebraic simplification of the retained C1 Hermite shoulder, for any 0<a<1. */
export function radialC1Magnitude(rho: number, a: number): number {
  if (!Number.isFinite(a) || !(a > 0 && a < 1) || Number.isNaN(rho)) {
    throw new RangeError('radial knee must lie in (0,1) and demand cannot be NaN');
  }
  if (!(rho > 0)) return 0;
  if (rho <= a) return rho;
  if (rho >= 2 - a) return 1;
  return rho - (rho - a) ** 2 / (4 * (1 - a));
}

/** Surface rolling resistance remains a separate continuous wheel torque. */
export function rollingResistanceTorque(
  omega: number,
  rollingRadius: number,
  normalLoad: number,
  rollingResistance: number,
  lowSpeedRegularization: number,
): number {
  if (!(normalLoad > 0) || !(rollingResistance > 0)) return 0;
  const rollingSpeed = rollingRadius * omega;
  const smoothSign = rollingSpeed / Math.sqrt(rollingSpeed ** 2 + lowSpeedRegularization ** 2);
  return rollingResistance * normalLoad * rollingRadius * smoothSign;
}

/**
 * Unique scalar backward-Euler wheel root with a Coulomb brake atom at Omega=0.
 * The no-brake residual stays monotone: the monotone two-axis saturation uses fixed contact data. Bounded tire and rolling torques make the finite bracket explicit rather than
 * heuristic.
 */
export function solveWheelOmega(input: WheelSolveInput): WheelSolveResult {
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
    tire,
  } = input;

  const noBrakeResidual = (omega: number): number =>
    netTorqueAtOmega(input, omega) - driveTorque;

  const atZero = noBrakeResidual(0);
  let omega: number;
  let locked = false;
  if (Math.abs(atZero) <= brakeTorque) {
    omega = 0;
    locked = brakeTorque > 0;
  } else {
    const maxRoadTorque = rollingRadius * tireForceCapacity(normalLoad, gripFactor, characteristics.muX);
    const maxRollingTorque = rollingResistance * Math.max(0, normalLoad) * rollingRadius;
    const span = Math.abs(omegaPrevious)
      + dt * (Math.abs(driveTorque) + brakeTorque + maxRoadTorque + maxRollingTorque) / inertia
      + 1;

    if (atZero < -brakeTorque) {
      const residual = (candidate: number) => noBrakeResidual(candidate) + brakeTorque;
      omega = bisectMonotone(residual, 0, span);
    } else {
      const residual = (candidate: number) => noBrakeResidual(candidate) - brakeTorque;
      omega = bisectMonotone(residual, -span, 0);
    }
  }

  const force = evaluateTireForce(
    omega,
    rollingRadius,
    input.longitudinalVelocity,
    input.lateralVelocity,
    normalLoad,
    gripFactor,
    tire,
    characteristics,
  );
  return {
    omega,
    omegaDot: (omega - omegaPrevious) / dt,
    tire: force,
    locked,
  };
}


/** Inverse of the SAME backward-Euler wheel equation, before the signed brake atom.
 * Fixed contact data only. A control boundary may restrict torque, never overwrite Omega.
 */
export function wheelRequiredNetTorque(input: WheelSolveInput, omega: number): number {
  validateWheelSolveInput(input);
  if (!Number.isFinite(omega)) throw new RangeError('trial wheel speed must be finite');
  return netTorqueAtOmega(input, omega);
}

function netTorqueAtOmega(input: WheelSolveInput, omega: number): number {
  const force = evaluateTireForce(omega, input.rollingRadius, input.longitudinalVelocity,
    input.lateralVelocity, input.normalLoad, input.gripFactor, input.tire,
    input.characteristics ?? input.tire);
  return input.inertia / input.dt * (omega - input.omegaPrevious)
    + input.rollingRadius * force.fx
    + rollingResistanceTorque(omega, input.rollingRadius, input.normalLoad,
      input.rollingResistance, input.tire.lowSpeedRegularization);
}

/** Linear-region lateral reserve in the same demand ellipse; diagnostic only. */
export function usefulLateralCapacity(
  longitudinalLinearDemand: number, normalLoad: number, gripFactor: number,
  tire: CompiledTireProfile, characteristics: CompiledTireCharacteristics = tire,
): number {
  const bx = tireForceCapacity(normalLoad, gripFactor, characteristics.muX);
  const by = tireForceCapacity(normalLoad, gripFactor, characteristics.muY);
  if (!(bx > 0)) return 0;
  return by * Math.sqrt(Math.max(0, characteristics.rhoKnee ** 2 - (longitudinalLinearDemand / bx) ** 2));
}

export function validateCompiledTireProfile(tire: CompiledTireProfile): void {
  validateTireCharacteristics(tire);
  if (!Number.isFinite(tire.lowSpeedRegularization) || !(tire.lowSpeedRegularization > 0)) {
    throw new RangeError('tire low-speed regularization must be finite and > 0');
  }
}

function bisectMonotone(fn: (value: number) => number, lowerInput: number, upperInput: number): number {
  let lower = lowerInput;
  let upper = upperInput;
  const fLower = fn(lower);
  const fUpper = fn(upper);
  if (fLower > 0 || fUpper < 0) {
    throw new Error(`wheel root bracket invalid: [${fLower}, ${fUpper}]`);
  }
  for (let i = 0; i < 60; i += 1) {
    const mid = (lower + upper) * 0.5;
    const fMid = fn(mid);
    if (Math.abs(fMid) < 1e-10) return mid;
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
  if (!(input.inertia > 0) || !Number.isFinite(input.inertia)) throw new RangeError('wheel inertia must be finite and > 0');
  if (!(input.rollingRadius > 0) || !Number.isFinite(input.rollingRadius)) throw new RangeError('wheel radius must be finite and > 0');
  if (!(input.brakeTorque >= 0) || !Number.isFinite(input.brakeTorque)) throw new RangeError('brake torque must be finite and >= 0');
  if (![input.omegaPrevious, input.longitudinalVelocity, input.lateralVelocity, input.normalLoad,
    input.gripFactor, input.rollingResistance, input.driveTorque].every(Number.isFinite)) {
    throw new RangeError('wheel solve inputs must be finite');
  }
  validateCompiledTireProfile(input.tire);
  validateTireCharacteristics(input.characteristics ?? input.tire);
}


function tireForceCapacity(normalLoad: number, gripFactor: number, mu: number): number {
  return Math.max(0, normalLoad) * Math.max(0, gripFactor) * mu;
}
