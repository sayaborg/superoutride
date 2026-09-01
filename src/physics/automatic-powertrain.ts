import { clamp } from '../core/math.js';

export interface EngineTorquePoint {
  readonly rpm: number;
  readonly torqueNewtonMeters: number;
}

/**
 * Power-delivery model only. The engine RPM state is not a second vehicle-speed authority and
 * engine rotor angular momentum is deliberately outside the Phase 9 rigid-body baseline.
 */
export interface AutomaticPowertrainProfile {
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly upshiftRpm: number;
  readonly downshiftRpm: number;
  readonly shiftDuration: number;
  readonly engineResponseTau: number;
  /** Reduced launch coupling slip; represents clutch take-up without adding clutch state. */
  readonly launchCouplingSlipRpm: number;
  readonly finalDriveRatio: number;
  readonly efficiency: number;
  readonly gearRatios: readonly number[];
  readonly torqueCurve: readonly EngineTorquePoint[];
}

export interface AutomaticPowertrainState {
  engineRpm: number;
  gear: number;
  shiftTimer: number;
  shiftDirection: -1 | 0 | 1;
  engineTorqueNewtonMeters: number;
  /** Torque delivered to the driven wheel/axle station. Never a direct body force. */
  outputDriveTorque: number;
}

export function createAutomaticPowertrainState(
  profile: AutomaticPowertrainProfile,
  drivenWheelOmega = 0,
): AutomaticPowertrainState {
  validateAutomaticPowertrainProfile(profile);
  const gear = selectInitialGear(profile, Math.abs(drivenWheelOmega));
  const coupledRpm = coupledEngineRpm(profile, Math.abs(drivenWheelOmega), gear);
  const engineRpm = clamp(coupledRpm, profile.idleRpm, profile.redlineRpm);
  return {
    engineRpm,
    gear,
    shiftTimer: 0,
    shiftDirection: 0,
    engineTorqueNewtonMeters: sampleEngineTorque(profile, engineRpm),
    outputDriveTorque: 0,
  };
}

/**
 * Advance one forward automatic transmission from the authoritative driven-wheel rotational state.
 * The returned value is wheel torque. Body force can arise only later through wheel slip and tire
 * contact.
 */
export function updateAutomaticPowertrain(
  state: AutomaticPowertrainState,
  profile: AutomaticPowertrainProfile,
  drivenWheelOmega: number,
  throttle: number,
  dt: number,
): number {
  const wheelOmega = Math.abs(drivenWheelOmega);
  const pedal = clamp(throttle, 0, 1);
  const currentCoupledRpm = coupledEngineRpm(profile, wheelOmega, state.gear);

  if (state.shiftTimer <= 0) {
    if (currentCoupledRpm >= profile.upshiftRpm && state.gear < profile.gearRatios.length) {
      state.gear += 1;
      state.shiftTimer = profile.shiftDuration;
      state.shiftDirection = 1;
    } else if (
      currentCoupledRpm <= profile.downshiftRpm
      && state.gear > 1
      && coupledEngineRpm(profile, wheelOmega, state.gear - 1) < profile.upshiftRpm
    ) {
      state.gear -= 1;
      state.shiftTimer = profile.shiftDuration;
      state.shiftDirection = -1;
    }
  }

  if (state.shiftTimer > 0) {
    state.shiftTimer = Math.max(0, state.shiftTimer - dt);
    if (state.shiftTimer === 0) state.shiftDirection = 0;
  }

  const coupledRpm = coupledEngineRpm(profile, wheelOmega, state.gear);
  const couplingSlip = pedal * profile.launchCouplingSlipRpm
    * clamp(1 - coupledRpm / profile.upshiftRpm, 0, 1);
  const rpmTarget = clamp(
    Math.max(profile.idleRpm, coupledRpm + couplingSlip),
    profile.idleRpm,
    profile.redlineRpm,
  );
  state.engineRpm += (rpmTarget - state.engineRpm)
    * (1 - Math.exp(-dt / Math.max(profile.engineResponseTau, 1e-4)));
  state.engineRpm = clamp(state.engineRpm, profile.idleRpm, profile.redlineRpm);
  state.engineTorqueNewtonMeters = sampleEngineTorque(profile, state.engineRpm);

  const ratio = profile.gearRatios[state.gear - 1]! * profile.finalDriveRatio;
  const shiftDriveScale = state.shiftTimer > 0 ? 0 : 1;
  const redlineScale = clamp(
    (profile.redlineRpm - state.engineRpm) / Math.max(profile.redlineRpm - profile.upshiftRpm, 1),
    0,
    1,
  );
  state.outputDriveTorque = pedal
    * state.engineTorqueNewtonMeters
    * ratio
    * profile.efficiency
    * shiftDriveScale
    * redlineScale;
  return state.outputDriveTorque;
}

function sampleEngineTorque(
  profile: AutomaticPowertrainProfile,
  rpm: number,
): number {
  const curve = profile.torqueCurve;
  if (rpm <= curve[0]!.rpm) return curve[0]!.torqueNewtonMeters;
  if (rpm >= curve[curve.length - 1]!.rpm) return curve[curve.length - 1]!.torqueNewtonMeters;
  for (let i = 0; i < curve.length - 1; i += 1) {
    const a = curve[i]!;
    const b = curve[i + 1]!;
    if (rpm <= b.rpm) {
      const t = (rpm - a.rpm) / (b.rpm - a.rpm);
      return a.torqueNewtonMeters + (b.torqueNewtonMeters - a.torqueNewtonMeters) * t;
    }
  }
  return curve.at(-1)!.torqueNewtonMeters;
}

function coupledEngineRpm(
  profile: AutomaticPowertrainProfile,
  drivenWheelOmega: number,
  gear: number,
): number {
  const ratio = profile.gearRatios[gear - 1]! * profile.finalDriveRatio;
  return Math.abs(drivenWheelOmega) * ratio * 60 / (2 * Math.PI);
}

function selectInitialGear(profile: AutomaticPowertrainProfile, wheelOmega: number): number {
  for (let gear = 1; gear <= profile.gearRatios.length; gear += 1) {
    if (coupledEngineRpm(profile, wheelOmega, gear) <= profile.upshiftRpm) return gear;
  }
  return profile.gearRatios.length;
}

export function validateAutomaticPowertrainProfile(profile: AutomaticPowertrainProfile): void {
  if (profile.gearRatios.length === 0 || profile.gearRatios.some(
    (ratio) => !(ratio > 0) || !Number.isFinite(ratio),
  )) {
    throw new RangeError('automatic transmission requires positive forward gear ratios');
  }
  if (profile.torqueCurve.length < 2) throw new RangeError('engine torque curve requires at least two points');
  for (let i = 0; i < profile.torqueCurve.length; i += 1) {
    const point = profile.torqueCurve[i]!;
    if (!(point.rpm >= 0) || !(point.torqueNewtonMeters >= 0)
      || !Number.isFinite(point.rpm) || !Number.isFinite(point.torqueNewtonMeters)) {
      throw new RangeError('engine torque curve values must be non-negative');
    }
    if (i > 0 && point.rpm <= profile.torqueCurve[i - 1]!.rpm) {
      throw new RangeError('engine torque curve RPM points must increase');
    }
  }
  if (!(profile.idleRpm < profile.downshiftRpm && profile.downshiftRpm < profile.upshiftRpm)) {
    throw new RangeError('automatic shift RPM thresholds must be ordered above idle');
  }
  if (!(profile.upshiftRpm < profile.redlineRpm)) {
    throw new RangeError('automatic upshift RPM must remain below redline');
  }
  if (!(profile.idleRpm > 0)
    || !(profile.shiftDuration > 0)
    || !(profile.engineResponseTau > 0)
    || !(profile.launchCouplingSlipRpm >= 0)
    || !(profile.finalDriveRatio > 0)
    || !(profile.efficiency > 0 && profile.efficiency <= 1)
    || ![
      profile.idleRpm,
      profile.redlineRpm,
      profile.upshiftRpm,
      profile.downshiftRpm,
      profile.shiftDuration,
      profile.engineResponseTau,
      profile.launchCouplingSlipRpm,
      profile.finalDriveRatio,
      profile.efficiency,
    ].every(Number.isFinite)) {
    throw new RangeError('automatic powertrain scalar values must be finite and physically bounded');
  }
}
