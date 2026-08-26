import { clamp } from '../core/math.js';

export interface EngineTorquePoint {
  readonly rpm: number;
  readonly torqueNewtonMeters: number;
}

export interface AutomaticPowertrainProfile {
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly upshiftRpm: number;
  readonly downshiftRpm: number;
  readonly shiftDuration: number;
  readonly engineResponseTau: number;
  readonly torqueConverterSlipRpm: number;
  readonly finalDriveRatio: number;
  readonly drivenWheelRadius: number;
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
  outputDriveForce: number;
}

export function createAutomaticPowertrainState(
  profile: AutomaticPowertrainProfile,
  longitudinalSpeed = 0,
): AutomaticPowertrainState {
  validateAutomaticPowertrainProfile(profile);
  const gear = selectInitialGear(profile, Math.abs(longitudinalSpeed));
  const coupledRpm = coupledEngineRpm(profile, Math.abs(longitudinalSpeed), gear);
  const engineRpm = clamp(coupledRpm, profile.idleRpm, profile.redlineRpm);
  return {
    engineRpm,
    gear,
    shiftTimer: 0,
    shiftDirection: 0,
    engineTorqueNewtonMeters: sampleEngineTorque(profile, engineRpm),
    outputDriveForce: 0,
  };
}

/**
 * Advance one forward automatic transmission. Longitudinal world/body speed remains external
 * authority; engine and gearbox state own only rotational/power delivery state.
 */
export function updateAutomaticPowertrain(
  state: AutomaticPowertrainState,
  profile: AutomaticPowertrainProfile,
  longitudinalSpeed: number,
  throttle: number,
  dt: number,
): number {
  const speed = Math.abs(longitudinalSpeed);
  const pedal = clamp(throttle, 0, 1);
  const currentCoupledRpm = coupledEngineRpm(profile, speed, state.gear);

  if (state.shiftTimer <= 0) {
    if (currentCoupledRpm >= profile.upshiftRpm && state.gear < profile.gearRatios.length) {
      state.gear += 1;
      state.shiftTimer = profile.shiftDuration;
      state.shiftDirection = 1;
    } else if (
      currentCoupledRpm <= profile.downshiftRpm
      && state.gear > 1
      && coupledEngineRpm(profile, speed, state.gear - 1) < profile.upshiftRpm
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

  const coupledRpm = coupledEngineRpm(profile, speed, state.gear);
  const converterSlip = pedal * profile.torqueConverterSlipRpm
    * clamp(1 - coupledRpm / profile.upshiftRpm, 0, 1);
  const rpmTarget = clamp(
    Math.max(profile.idleRpm, coupledRpm + converterSlip),
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
  state.outputDriveForce = pedal
    * state.engineTorqueNewtonMeters
    * ratio
    * profile.efficiency
    / profile.drivenWheelRadius
    * shiftDriveScale
    * redlineScale;
  return state.outputDriveForce;
}

export function sampleEngineTorque(
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

export function coupledEngineRpm(
  profile: AutomaticPowertrainProfile,
  longitudinalSpeed: number,
  gear: number,
): number {
  const wheelRadiansPerSecond = Math.abs(longitudinalSpeed) / profile.drivenWheelRadius;
  const ratio = profile.gearRatios[gear - 1]! * profile.finalDriveRatio;
  return wheelRadiansPerSecond * ratio * 60 / (2 * Math.PI);
}

export function resetAutomaticPowertrainTransient(state: AutomaticPowertrainState): void {
  state.shiftTimer = 0;
  state.shiftDirection = 0;
  state.outputDriveForce = 0;
}

function selectInitialGear(profile: AutomaticPowertrainProfile, speed: number): number {
  for (let gear = 1; gear <= profile.gearRatios.length; gear += 1) {
    if (coupledEngineRpm(profile, speed, gear) <= profile.upshiftRpm) return gear;
  }
  return profile.gearRatios.length;
}

function validateAutomaticPowertrainProfile(profile: AutomaticPowertrainProfile): void {
  if (profile.gearRatios.length === 0 || profile.gearRatios.some((ratio) => !(ratio > 0))) {
    throw new RangeError('automatic transmission requires positive forward gear ratios');
  }
  if (profile.torqueCurve.length < 2) throw new RangeError('engine torque curve requires at least two points');
  for (let i = 0; i < profile.torqueCurve.length; i += 1) {
    const point = profile.torqueCurve[i]!;
    if (!(point.rpm >= 0) || !(point.torqueNewtonMeters >= 0)) {
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
}
