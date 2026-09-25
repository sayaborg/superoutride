import { DefinitionDomainError } from './definition-domain-error.js';
import { clamp } from '../../core/math.js';

interface EngineTorquePoint {
  readonly rpm: number;
  readonly torqueNewtonMeters: number;
}

/** Ideal direct-drive robotized MT: no clutch, converter, engine rotor or shift-duration model. */
export interface AutomaticPowertrainDefinition {
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
  /** The only dynamic powertrain memory is the selected gear. */
  gear: number;
  /** Derived observation caches; none is consumed as state by the next drive solve. */
  engineRpm: number;
  engineTorqueNewtonMeters: number;
  /** Requested wheel-side torque before protection/distribution, never a direct body force. */
  outputDriveTorque: number;
}

export function createAutomaticPowertrainState(
  definition: AutomaticPowertrainDefinition,
  drivenWheelOmega = 0,
): AutomaticPowertrainState {
  assertWheelOmega(drivenWheelOmega);
  const wheelOmega = Math.abs(drivenWheelOmega);
  let gear = 1;
  while (gear < definition.gearRatios.length && coupledEngineRpm(definition, wheelOmega, gear) >= definition.upshiftRpm)
    gear += 1;
  const engineRpm = coupledEngineRpm(definition, wheelOmega, gear);
  return {
    gear,
    engineRpm,
    engineTorqueNewtonMeters: sampleEngineTorque(definition, engineRpm),
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
  definition: AutomaticPowertrainDefinition,
  drivenWheelOmega: number,
  throttle: number,
  dt: number,
): number {
  assertWheelOmega(drivenWheelOmega);
  if (!Number.isFinite(throttle) || !(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError('powertrain requires finite throttle and finite positive dt');
  }
  if (!Number.isInteger(state.gear) || state.gear < 1 || state.gear > definition.gearRatios.length) {
    throw new RangeError('powertrain gear must index the authored forward ratios');
  }
  const wheelOmega = Math.abs(drivenWheelOmega);
  const rpmBeforeShift = coupledEngineRpm(definition, wheelOmega, state.gear);
  if (rpmBeforeShift >= definition.upshiftRpm && state.gear < definition.gearRatios.length) {
    state.gear += 1;
  } else if (rpmBeforeShift <= definition.downshiftRpm && state.gear > 1) {
    state.gear -= 1;
  }

  state.engineRpm = coupledEngineRpm(definition, wheelOmega, state.gear);
  state.engineTorqueNewtonMeters = sampleEngineTorque(definition, state.engineRpm);
  const ratio = definition.gearRatios[state.gear - 1]! * definition.finalDriveRatio;
  state.outputDriveTorque =
    clamp(throttle, 0, 1) *
    state.engineTorqueNewtonMeters *
    ratio *
    definition.efficiency *
    engineRevLimiterScale(definition, state.engineRpm);
  return state.outputDriveTorque;
}

/** Single state-free averaged fuel-cut law: full through upshift RPM, C1 zero at redline. */
function engineRevLimiterScale(
  definition: Pick<AutomaticPowertrainDefinition, 'upshiftRpm' | 'redlineRpm'>,
  rpm: number,
): number {
  const t = clamp((rpm - definition.upshiftRpm) / (definition.redlineRpm - definition.upshiftRpm), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/** No-stall launch approximation: use the idle torque below idle, without inventing engine RPM. */
function sampleEngineTorque(
  definition: Pick<AutomaticPowertrainDefinition, 'idleRpm' | 'torqueCurve'>,
  rpm: number,
): number {
  const curve = definition.torqueCurve;
  const sampleRpm = Math.max(definition.idleRpm, rpm);
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

function coupledEngineRpm(definition: AutomaticPowertrainDefinition, wheelOmega: number, gear: number): number {
  return (wheelOmega * definition.gearRatios[gear - 1]! * definition.finalDriveRatio * 60) / (2 * Math.PI);
}

function assertWheelOmega(omega: number): void {
  if (!Number.isFinite(omega)) throw new RangeError('driven wheel Omega must be finite');
}

export function validateAutomaticPowertrainDefinition(definition: AutomaticPowertrainDefinition): void {
  for (const field of [
    'idleRpm',
    'downshiftRpm',
    'upshiftRpm',
    'redlineRpm',
    'finalDriveRatio',
    'efficiency',
  ] as const) {
    if (!Number.isFinite(definition[field])) throw new DefinitionDomainError(field, `${field} must be finite`);
  }
  if (!(0 < definition.idleRpm)) throw new DefinitionDomainError('idleRpm', 'idleRpm must be > 0');
  if (!(definition.idleRpm < definition.downshiftRpm))
    throw new DefinitionDomainError('downshiftRpm', 'downshiftRpm must be greater than idleRpm');
  if (!(definition.downshiftRpm < definition.upshiftRpm))
    throw new DefinitionDomainError('downshiftRpm', 'downshiftRpm must be less than upshiftRpm');
  if (!(definition.upshiftRpm < definition.redlineRpm))
    throw new DefinitionDomainError('upshiftRpm', 'upshiftRpm must be less than redlineRpm');
  if (!(definition.finalDriveRatio > 0))
    throw new DefinitionDomainError('finalDriveRatio', 'finalDriveRatio must be > 0');
  if (!(definition.efficiency > 0 && definition.efficiency <= 1))
    throw new DefinitionDomainError('efficiency', 'efficiency must lie in (0,1]');
  if (definition.gearRatios.length === 0)
    throw new DefinitionDomainError('gearRatios', 'powertrain requires forward gear ratios');
  for (let i = 0; i < definition.gearRatios.length; i += 1) {
    const ratio = definition.gearRatios[i]!;
    if (!(ratio > 0) || !Number.isFinite(ratio))
      throw new DefinitionDomainError(`gearRatios/${i}`, 'gear ratios must be finite and positive');
    if (i > 0) {
      const previous = definition.gearRatios[i - 1]!;
      if (!(ratio < previous))
        throw new DefinitionDomainError(`gearRatios/${i}`, `gearRatios/${i} must be less than gearRatios/${i - 1}`);
      // At unchanged wheel speed, a threshold shift cannot immediately request its inverse.
      if (!(definition.downshiftRpm < definition.upshiftRpm * (ratio / previous))) {
        throw new DefinitionDomainError(
          'downshiftRpm',
          `downshiftRpm must be less than upshiftRpm * (gearRatios/${i} / gearRatios/${i - 1})`,
        );
      }
    }
  }
  if (definition.torqueCurve.length < 2)
    throw new DefinitionDomainError('torqueCurve', 'engine torque curve requires at least two points');
  for (let i = 0; i < definition.torqueCurve.length; i += 1) {
    const point = definition.torqueCurve[i]!;
    if (!(point.rpm >= 0 && point.rpm <= definition.redlineRpm) || !Number.isFinite(point.rpm))
      throw new DefinitionDomainError(
        `torqueCurve/${i}/rpm`,
        'torque curve rpm must be finite and lie in [0, redlineRpm]',
      );
    if (!(point.torqueNewtonMeters > 0) || !Number.isFinite(point.torqueNewtonMeters))
      throw new DefinitionDomainError(
        `torqueCurve/${i}/torqueNewtonMeters`,
        'torqueNewtonMeters must be finite and > 0',
      );
    if (i > 0 && point.rpm <= definition.torqueCurve[i - 1]!.rpm) {
      throw new DefinitionDomainError(
        `torqueCurve/${i}/rpm`,
        `torqueCurve/${i}/rpm must be greater than torqueCurve/${i - 1}/rpm`,
      );
    }
  }
  if (
    definition.torqueCurve[0]!.rpm > definition.idleRpm ||
    definition.torqueCurve[definition.torqueCurve.length - 1]!.rpm < definition.upshiftRpm
  ) {
    throw new DefinitionDomainError('torqueCurve', 'torqueCurve must cover idleRpm through upshiftRpm');
  }
}
