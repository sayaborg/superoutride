import { clamp } from '../core/math.js';

export interface EngineTorquePoint {
  readonly rpm: number;
  readonly torqueNewtonMeters: number;
}

/** Ideal direct-drive robotized MT: no clutch, converter, engine rotor or shift-duration model. */
export interface AutomaticPowertrainProfile {
  /** Torque-sampling floor only; derived engine RPM is allowed to be zero at rest. */
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly upshiftRpm: number;
  readonly downshiftRpm: number;
  readonly finalDriveRatio: number;
  readonly efficiency: number;
  readonly gearRatios: readonly number[];
  /** Positive engine characteristic; the separate limiter alone owns fuel-cut behavior. */
  readonly torqueCurve: readonly EngineTorquePoint[];
}

export interface AutomaticPowertrainState {
  /** Sole instance-owned engine-output calibration; profile torque curves remain immutable. */
  engineTorqueMultiplier: number;
  /** The only dynamic powertrain memory is the selected gear. */
  gear: number;
  /** Derived observation caches; none is consumed as state by the next drive solve. */
  engineRpm: number;
  engineTorqueNewtonMeters: number;
  /** Requested wheel-side torque before protection/distribution, never a direct body force. */
  outputDriveTorque: number;
}

export function assertEngineTorqueMultiplier(multiplier: number): void {
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) {
    throw new RangeError('engine torque multiplier must be finite and > 0');
  }
}

/** Calibration mutation only: never rewrites RPM, wheel speed, gear or vehicle motion. */
export function setEngineTorqueMultiplier(
  state: AutomaticPowertrainState,
  multiplier: number,
): void {
  assertEngineTorqueMultiplier(multiplier);
  state.engineTorqueMultiplier = multiplier;
}

export function createAutomaticPowertrainState(
  profile: AutomaticPowertrainProfile,
  drivenWheelOmega = 0,
  engineTorqueMultiplier = 1,
): AutomaticPowertrainState {
  validateAutomaticPowertrainProfile(profile);
  assertEngineTorqueMultiplier(engineTorqueMultiplier);
  assertWheelOmega(drivenWheelOmega);
  const wheelOmega = Math.abs(drivenWheelOmega);
  let gear = 1;
  while (gear < profile.gearRatios.length
    && coupledEngineRpm(profile, wheelOmega, gear) >= profile.upshiftRpm) gear += 1;
  const engineRpm = coupledEngineRpm(profile, wheelOmega, gear);
  return {
    engineTorqueMultiplier,
    gear,
    engineRpm,
    engineTorqueNewtonMeters: sampleEngineTorque(profile, engineRpm) * engineTorqueMultiplier,
    outputDriveTorque: 0,
  };
}

/**
 * One ordinary mechanics step. RPM is algebraic in authoritative driven-wheel speed and gear.
 * An instantaneous ratio change recomputes torque in the same call, with no drive interruption.
 * dt validates the shared step contract; no powertrain lag, timer or internal integration exists.
 */
export function updateAutomaticPowertrain(
  state: AutomaticPowertrainState,
  profile: AutomaticPowertrainProfile,
  drivenWheelOmega: number,
  throttle: number,
  dt: number,
): number {
  assertEngineTorqueMultiplier(state.engineTorqueMultiplier);
  assertWheelOmega(drivenWheelOmega);
  if (!Number.isFinite(throttle) || !(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError('powertrain requires finite throttle and finite positive dt');
  }
  if (!Number.isInteger(state.gear) || state.gear < 1 || state.gear > profile.gearRatios.length) {
    throw new RangeError('powertrain gear must index the authored forward ratios');
  }
  const wheelOmega = Math.abs(drivenWheelOmega);
  const rpmBeforeShift = coupledEngineRpm(profile, wheelOmega, state.gear);
  if (rpmBeforeShift >= profile.upshiftRpm && state.gear < profile.gearRatios.length) {
    state.gear += 1;
  } else if (rpmBeforeShift <= profile.downshiftRpm && state.gear > 1) {
    state.gear -= 1;
  }

  state.engineRpm = coupledEngineRpm(profile, wheelOmega, state.gear);
  state.engineTorqueNewtonMeters = sampleEngineTorque(profile, state.engineRpm)
    * state.engineTorqueMultiplier;
  const ratio = profile.gearRatios[state.gear - 1]! * profile.finalDriveRatio;
  state.outputDriveTorque = clamp(throttle, 0, 1)
    * state.engineTorqueNewtonMeters
    * ratio
    * profile.efficiency
    * engineRevLimiterScale(profile, state.engineRpm);
  return state.outputDriveTorque;
}

/** Single state-free averaged fuel-cut law: full through upshift RPM, C1 zero at redline. */
export function engineRevLimiterScale(
  profile: Pick<AutomaticPowertrainProfile, 'upshiftRpm' | 'redlineRpm'>,
  rpm: number,
): number {
  const t = clamp((rpm - profile.upshiftRpm) / (profile.redlineRpm - profile.upshiftRpm), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/** No-stall launch approximation: use the idle torque below idle, without inventing engine RPM. */
export function sampleEngineTorque(
  profile: Pick<AutomaticPowertrainProfile, 'idleRpm' | 'torqueCurve'>,
  rpm: number,
): number {
  const curve = profile.torqueCurve;
  const sampleRpm = Math.max(profile.idleRpm, rpm);
  if (sampleRpm <= curve[0]!.rpm) return curve[0]!.torqueNewtonMeters;
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (sampleRpm <= b.rpm) {
      const t = (sampleRpm - a.rpm) / (b.rpm - a.rpm);
      return a.torqueNewtonMeters + (b.torqueNewtonMeters - a.torqueNewtonMeters) * t;
    }
  }
  return curve[curve.length - 1]!.torqueNewtonMeters;
}

function coupledEngineRpm(
  profile: AutomaticPowertrainProfile,
  wheelOmega: number,
  gear: number,
): number {
  return wheelOmega * profile.gearRatios[gear - 1]! * profile.finalDriveRatio * 60 / (2 * Math.PI);
}

function assertWheelOmega(omega: number): void {
  if (!Number.isFinite(omega)) throw new RangeError('driven wheel Omega must be finite');
}

export function validateAutomaticPowertrainProfile(profile: AutomaticPowertrainProfile): void {
  if (![profile.idleRpm, profile.downshiftRpm, profile.upshiftRpm, profile.redlineRpm,
    profile.finalDriveRatio, profile.efficiency].every(Number.isFinite)
    || !(0 < profile.idleRpm && profile.idleRpm < profile.downshiftRpm
      && profile.downshiftRpm < profile.upshiftRpm && profile.upshiftRpm < profile.redlineRpm)
    || !(profile.finalDriveRatio > 0) || !(profile.efficiency > 0 && profile.efficiency <= 1)) {
    throw new RangeError('powertrain requires 0 < idle < downshift < upshift < redline and positive drive scalars');
  }
  if (profile.gearRatios.length === 0) throw new RangeError('powertrain requires forward gear ratios');
  for (let i = 0; i < profile.gearRatios.length; i += 1) {
    const ratio = profile.gearRatios[i]!;
    if (!(ratio > 0) || !Number.isFinite(ratio)) throw new RangeError('gear ratios must be finite and positive');
    if (i > 0) {
      const previous = profile.gearRatios[i - 1]!;
      if (!(ratio < previous)) throw new RangeError('forward gear ratios must strictly decrease');
      // At unchanged wheel speed, a threshold shift cannot immediately request its inverse.
      if (!(profile.downshiftRpm < profile.upshiftRpm * (ratio / previous))) {
        throw new RangeError('shift RPM hysteresis must exceed every adjacent gear-ratio step');
      }
    }
  }
  if (profile.torqueCurve.length < 2) throw new RangeError('engine torque curve requires at least two points');
  for (let i = 0; i < profile.torqueCurve.length; i += 1) {
    const point = profile.torqueCurve[i]!;
    if (!(point.rpm >= 0 && point.rpm <= profile.redlineRpm)
      || !(point.torqueNewtonMeters > 0)
      || !Number.isFinite(point.rpm) || !Number.isFinite(point.torqueNewtonMeters)) {
      throw new RangeError('engine curve requires finite positive torque and RPM within the authored range');
    }
    if (i > 0 && point.rpm <= profile.torqueCurve[i - 1]!.rpm) {
      throw new RangeError('engine torque curve RPM points must increase');
    }
  }
  if (profile.torqueCurve[0]!.rpm > profile.idleRpm
    || profile.torqueCurve[profile.torqueCurve.length - 1]!.rpm < profile.upshiftRpm) {
    throw new RangeError('engine curve must cover idle through upshift RPM');
  }
}
