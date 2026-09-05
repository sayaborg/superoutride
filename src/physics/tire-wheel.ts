import {
  assertLinearStiffnessMultiplier,
  assertReferenceFrictionMultiplier,
  assertSlidingFrictionRatio,
} from './tire-friction-calibration.js';

export interface CompiledTireProfile {
  readonly muRef: number;
  readonly normalizedStiffness: number;
  readonly rhoKnee: number;
  readonly lowSpeedRegularization: number;
}

export interface TireDemand {
  readonly sx: number;
  readonly sy: number;
  readonly dx: number;
  readonly dy: number;
}

export interface TireForceResult extends TireDemand {
  readonly fx: number;
  readonly fy: number;
  readonly fmax: number;
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
  readonly referenceFrictionMultiplier?: number;
  readonly linearStiffnessMultiplier?: number;
  readonly slidingFrictionRatio?: number;
  readonly rollingResistance: number;
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

/** M9.18: one normalized stiffness, scaled by current contact load in both slip directions. */
export function tireLinearDemand(
  omega: number,
  rollingRadius: number,
  longitudinalVelocity: number,
  lateralVelocity: number,
  normalLoad: number,
  tire: CompiledTireProfile,
  linearStiffnessMultiplier = 1,
): TireDemand {
  assertLinearStiffnessMultiplier(linearStiffnessMultiplier);
  if (!Number.isFinite(normalLoad)) throw new RangeError('tire normal load must be finite');
  const stiffness = tire.normalizedStiffness * Math.max(0, normalLoad) * linearStiffnessMultiplier;
  const v0 = tire.lowSpeedRegularization;
  const referenceSpeed = Math.sqrt(longitudinalVelocity ** 2 + v0 ** 2);
  const sx = (rollingRadius * omega - longitudinalVelocity) / referenceSpeed;
  const sy = -lateralVelocity / referenceSpeed;
  return {
    sx,
    sy,
    dx: stiffness * sx,
    dy: stiffness * sy,
  };
}

/**
 * Signed lateral slip observation using the same low-speed denominator as the one-k tire law.
 * At ordinary speed this approaches the geometric tire slip angle; at rest it remains finite.
 */
export function regularizedTireSlipAngle(
  longitudinalVelocity: number,
  lateralVelocity: number,
  lowSpeedRegularization: number,
): number {
  if (!(lowSpeedRegularization > 0) || !Number.isFinite(lowSpeedRegularization)) {
    throw new RangeError('tire low-speed regularization must be finite and > 0');
  }
  if (![longitudinalVelocity, lateralVelocity].every(Number.isFinite)) {
    throw new RangeError('tire slip-angle velocities must be finite');
  }
  const referenceSpeed = Math.sqrt(longitudinalVelocity ** 2 + lowSpeedRegularization ** 2);
  return Math.atan2(-lateralVelocity, referenceSpeed);
}

export function evaluateTireForce(
  omega: number,
  rollingRadius: number,
  longitudinalVelocity: number,
  lateralVelocity: number,
  normalLoad: number,
  gripFactor: number,
  tire: CompiledTireProfile,
  referenceFrictionMultiplier = 1,
  linearStiffnessMultiplier = 1,
  slidingFrictionRatio = 1,
): TireForceResult {
  assertSlidingFrictionRatio(slidingFrictionRatio);
  const demand = tireLinearDemand(
    omega,
    rollingRadius,
    longitudinalVelocity,
    lateralVelocity,
    normalLoad,
    tire,
    linearStiffnessMultiplier,
  );
  const fmax = tireForceCapacity(
    normalLoad,
    gripFactor,
    referenceFrictionMultiplier,
    tire,
  );
  const magnitude = Math.hypot(demand.dx, demand.dy);
  if (!(fmax > 0) || !(magnitude > 0)) {
    return {
      ...demand,
      fx: 0,
      fy: 0,
      fmax,
      rho: fmax > 0 ? 0 : (magnitude > 0 ? Number.POSITIVE_INFINITY : 0),
    };
  }
  const rho = magnitude / fmax;
  const saturatedMagnitude = radialC1Magnitude(rho, tire.rhoKnee) * fmax;
  const lateralDemandRatio = Math.abs(demand.dy) / fmax;
  const slidingScale = lateralPostPeakScale(
    lateralDemandRatio,
    tire.rhoKnee,
    slidingFrictionRatio,
  );
  const scale = saturatedMagnitude / magnitude * slidingScale;
  return {
    ...demand,
    fx: demand.dx * scale,
    fy: demand.dy * scale,
    fmax,
    rho,
  };
}

/** C1 radial transition: linear through rhoKnee, constant peak magnitude from 2-rhoKnee onward. */
export function radialC1Magnitude(rho: number, rhoKnee: number): number {
  if (!(rho > 0)) return 0;
  const a = rhoKnee;
  const b = 2 - a;
  if (rho <= a) return rho;
  if (rho >= b) return 1;
  const width = b - a;
  const t = (rho - a) / width;
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
  const h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2;
  return h00 * a + h10 * width + h01;
}

/**
 * M9.15 state-free lateral post-peak falloff.
 *
 * The peak begins at the same pure-lateral demand ratio b=2-rhoKnee used by the retained one-k
 * radial shoulder. The C1 falloff now spans one whole peak-demand interval and reaches its sliding
 * plateau at 2b. Therefore a browser PEAK slip P reaches the plateau at exactly 2P. The browser may
 * expose an absolute sliding friction coefficient S while deriving this internal ratio as S/G.
 *
 * The scale depends only on lateral demand, never wheel omega, so for one wheel solve it is constant
 * with respect to the scalar root variable. This preserves the retained monotone backward-Euler
 * wheel equation while reducing deep-slide scrub without adding tire state.
 */
export function lateralPostPeakScale(
  lateralDemandRatio: number,
  rhoKnee: number,
  slidingFrictionRatio: number,
): number {
  assertSlidingFrictionRatio(slidingFrictionRatio);
  if (!(rhoKnee > 0 && rhoKnee < 1) || !Number.isFinite(rhoKnee)) {
    throw new RangeError('rhoKnee must lie in (0,1)');
  }
  if (!Number.isFinite(lateralDemandRatio)) {
    throw new RangeError('lateral demand ratio must be finite');
  }
  const rhoLat = Math.abs(lateralDemandRatio);
  const peak = 2 - rhoKnee;
  if (rhoLat <= peak || slidingFrictionRatio === 1) return 1;
  const width = peak;
  const plateau = peak + width;
  if (rhoLat >= plateau) return slidingFrictionRatio;
  const t = (rhoLat - peak) / width;
  const smooth = t * t * (3 - 2 * t);
  return 1 - (1 - slidingFrictionRatio) * smooth;
}

/**
 * Surface rolling resistance is one continuous monotone torque in the scalar wheel equation.
 * It reuses the tire low-speed regularization and owns no second low-speed threshold.
 */
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
 * The no-brake residual stays monotone: the M9.15 post-peak scale depends on fixed lateral demand,
 * not Omega. Bounded tire and rolling torques make the finite bracket explicit rather than
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
    referenceFrictionMultiplier = 1,
    linearStiffnessMultiplier = 1,
    slidingFrictionRatio = 1,
    rollingResistance,
    driveTorque,
    brakeTorque,
    dt,
    tire,
  } = input;

  const noBrakeResidual = (omega: number): number => {
    const force = evaluateTireForce(
      omega,
      rollingRadius,
      input.longitudinalVelocity,
      input.lateralVelocity,
      normalLoad,
      gripFactor,
      tire,
      referenceFrictionMultiplier,
      linearStiffnessMultiplier,
      slidingFrictionRatio,
    );
    return inertia / dt * (omega - omegaPrevious)
      - driveTorque
      + rollingRadius * force.fx
      + rollingResistanceTorque(
        omega,
        rollingRadius,
        normalLoad,
        rollingResistance,
        tire.lowSpeedRegularization,
      );
  };

  const atZero = noBrakeResidual(0);
  let omega: number;
  let locked = false;
  if (Math.abs(atZero) <= brakeTorque) {
    omega = 0;
    locked = brakeTorque > 0;
  } else {
    const fmax = tireForceCapacity(
      normalLoad,
      gripFactor,
      referenceFrictionMultiplier,
      tire,
    );
    const maxRoadTorque = rollingRadius * fmax;
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
    referenceFrictionMultiplier,
    linearStiffnessMultiplier,
    slidingFrictionRatio,
  );
  return {
    omega,
    omegaDot: (omega - omegaPrevious) / dt,
    tire: force,
    locked,
  };
}

export function usefulLateralCapacity(
  longitudinalLinearDemand: number,
  normalLoad: number,
  gripFactor: number,
  tire: CompiledTireProfile,
  referenceFrictionMultiplier = 1,
): number {
  const fmax = tireForceCapacity(
    normalLoad,
    gripFactor,
    referenceFrictionMultiplier,
    tire,
  );
  const useful = tire.rhoKnee * fmax;
  return Math.sqrt(Math.max(0, useful ** 2 - longitudinalLinearDemand ** 2));
}

export function validateCompiledTireProfile(tire: CompiledTireProfile): void {
  if (![tire.muRef, tire.normalizedStiffness, tire.rhoKnee, tire.lowSpeedRegularization]
    .every(Number.isFinite)) throw new RangeError('tire profile values must be finite');
  if (!(tire.muRef > 0)) throw new RangeError('tire muRef must be > 0');
  if (!(tire.normalizedStiffness > 0)) throw new RangeError('normalized tire stiffness must be > 0');
  if (!(tire.rhoKnee > 0 && tire.rhoKnee < 1)) throw new RangeError('rhoKnee must lie in (0,1)');
  if (!(tire.lowSpeedRegularization > 0)) throw new RangeError('tire low-speed regularization must be > 0');
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

function validateWheelSolveInput(input: WheelSolveInput): void {
  if (!(input.dt > 0) || !Number.isFinite(input.dt)) throw new RangeError('wheel solve dt must be finite and > 0');
  if (!(input.inertia > 0) || !Number.isFinite(input.inertia)) throw new RangeError('wheel inertia must be finite and > 0');
  if (!(input.rollingRadius > 0) || !Number.isFinite(input.rollingRadius)) throw new RangeError('wheel radius must be finite and > 0');
  if (!(input.brakeTorque >= 0) || !Number.isFinite(input.brakeTorque)) throw new RangeError('brake torque must be finite and >= 0');
  if (![input.omegaPrevious, input.longitudinalVelocity, input.lateralVelocity, input.normalLoad,
    input.gripFactor, input.rollingResistance, input.driveTorque].every(Number.isFinite)) {
    throw new RangeError('wheel solve inputs must be finite');
  }
  validateCompiledTireProfile(input.tire);
  assertReferenceFrictionMultiplier(input.referenceFrictionMultiplier ?? 1);
  assertLinearStiffnessMultiplier(input.linearStiffnessMultiplier ?? 1);
  assertSlidingFrictionRatio(input.slidingFrictionRatio ?? 1);
}

function tireForceCapacity(
  normalLoad: number,
  gripFactor: number,
  referenceFrictionMultiplier: number,
  tire: CompiledTireProfile,
): number {
  assertReferenceFrictionMultiplier(referenceFrictionMultiplier);
  return Math.max(
    0,
    tire.muRef
      * referenceFrictionMultiplier
      * Math.max(0, gripFactor)
      * Math.max(0, normalLoad),
  );
}
