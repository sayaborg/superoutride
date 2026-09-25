import { DefinitionDomainError } from './definition-domain-error.js';
import { clamp } from '../../core/math.js';

interface EngineTorquePoint {
  readonly rpm: number;
  readonly torqueNewtonMeters: number;
}

/** Ideal direct-drive robotized MT: no clutch, converter, engine rotor or shift-duration model. */
export interface AutomaticPowertrainDefinition {
  /** Authored engine size and cycle; reserved for subsequent friction/inertia rules. */
  readonly displacementCc: number;
  readonly cycle: 2 | 4;
  /** Torque-sampling floor only; derived engine RPM is allowed to be zero at rest. */
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly finalDriveRatio: number;
  readonly efficiency: number;
  readonly gearRatios: readonly number[];
  readonly torqueCurve: readonly EngineTorquePoint[];
}

export interface CompiledAutomaticPowertrainDefinition extends AutomaticPowertrainDefinition {
  /** Derived once from the admitted torque curve; never authored as a vehicle value. */
  readonly peakPowerRpm: number;
}

export interface AutomaticPowertrainState {
  /** Selected gear and fuel-cut latch are the only dynamic powertrain memory. */
  gear: number;
  fuelCut: boolean;
  /** Derived observation caches; none is consumed as state by the next drive solve. */
  engineRpm: number;
  engineTorqueNewtonMeters: number;
  /** Requested wheel-side torque before protection/distribution, never a direct body force. */
  outputDriveTorque: number;
}

export function createAutomaticPowertrainState(
  definition: CompiledAutomaticPowertrainDefinition,
  drivenWheelOmega = 0,
): AutomaticPowertrainState {
  assertWheelOmega(drivenWheelOmega);
  const wheelOmega = Math.abs(drivenWheelOmega);
  let gear = 1;
  while (gear < definition.gearRatios.length && coupledEngineRpm(definition, wheelOmega, gear) >= definition.redlineRpm)
    gear += 1;
  const engineRpm = coupledEngineRpm(definition, wheelOmega, gear);
  return {
    gear,
    fuelCut: false,
    engineRpm,
    engineTorqueNewtonMeters: sampleEngineTorque(definition, engineRpm),
    outputDriveTorque: 0,
  };
}

/**
 * One ordinary mechanics step. RPM is algebraic in authoritative driven-wheel speed and gear.
 * At most one instantaneous ratio change occurs per call, with no drive interruption.
 * Fuel cut is a hysteretic latch above redline; dt validates the shared step contract.
 */
export function updateAutomaticPowertrain(
  state: AutomaticPowertrainState,
  definition: CompiledAutomaticPowertrainDefinition,
  drivenWheelOmega: number,
  throttle: number,
  allowShift: boolean,
  fuelCutRedlineMargin: number,
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
  if (allowShift) {
    if (rpmBeforeShift >= definition.redlineRpm && state.gear < definition.gearRatios.length) {
      state.gear += 1;
    } else if (state.gear > 1) {
      const currentRatio = definition.gearRatios[state.gear - 1]!;
      const lowerRatio = definition.gearRatios[state.gear - 2]!;
      if (rpmBeforeShift * (lowerRatio / currentRatio) <= definition.peakPowerRpm) state.gear -= 1;
    }
  }

  state.engineRpm = coupledEngineRpm(definition, wheelOmega, state.gear);
  if (state.fuelCut) {
    if (state.engineRpm <= definition.redlineRpm) state.fuelCut = false;
  } else if (state.engineRpm > definition.redlineRpm * (1 + fuelCutRedlineMargin)) {
    state.fuelCut = true;
  }

  state.engineTorqueNewtonMeters = state.fuelCut ? 0 : sampleEngineTorque(definition, state.engineRpm);
  const ratio = definition.gearRatios[state.gear - 1]! * definition.finalDriveRatio;
  state.outputDriveTorque = clamp(throttle, 0, 1) * state.engineTorqueNewtonMeters * ratio * definition.efficiency;
  return state.outputDriveTorque;
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

/** Exact maximum of rpm*torque on the piecewise-linear torque curve. */
function peakPowerPoint(curve: readonly EngineTorquePoint[]): { readonly rpm: number; readonly pathIndex: number } {
  let peakRpm = curve[0]!.rpm;
  let peakPower = peakRpm * curve[0]!.torqueNewtonMeters;
  let pathIndex = 0;
  const take = (rpm: number, torque: number, index: number) => {
    const power = rpm * torque;
    if (power > peakPower || (power === peakPower && rpm > peakRpm)) {
      peakPower = power;
      peakRpm = rpm;
      pathIndex = index;
    }
  };
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    take(b.rpm, b.torqueNewtonMeters, i);
    const slope = (b.torqueNewtonMeters - a.torqueNewtonMeters) / (b.rpm - a.rpm);
    if (slope >= 0) continue;
    const intercept = a.torqueNewtonMeters - slope * a.rpm;
    const stationaryRpm = -intercept / (2 * slope);
    if (stationaryRpm > a.rpm && stationaryRpm < b.rpm) {
      const torque = a.torqueNewtonMeters + slope * (stationaryRpm - a.rpm);
      take(stationaryRpm, torque, i);
    }
  }
  return { rpm: peakRpm, pathIndex };
}

export function compileAutomaticPowertrainDefinition(
  definition: AutomaticPowertrainDefinition,
): Readonly<CompiledAutomaticPowertrainDefinition> {
  if (!(definition.displacementCc > 0) || !Number.isFinite(definition.displacementCc))
    throw new DefinitionDomainError('displacementCc', 'displacementCc must be finite and > 0');
  if (definition.cycle !== 2 && definition.cycle !== 4)
    throw new DefinitionDomainError('cycle', 'cycle must be 2 or 4 strokes');
  for (const field of ['idleRpm', 'redlineRpm', 'finalDriveRatio', 'efficiency'] as const) {
    if (!Number.isFinite(definition[field])) throw new DefinitionDomainError(field, `${field} must be finite`);
  }
  if (!(0 < definition.idleRpm)) throw new DefinitionDomainError('idleRpm', 'idleRpm must be > 0');
  if (!(definition.idleRpm < definition.redlineRpm))
    throw new DefinitionDomainError('redlineRpm', 'redlineRpm must be greater than idleRpm');
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
    definition.torqueCurve[definition.torqueCurve.length - 1]!.rpm < definition.redlineRpm
  ) {
    throw new DefinitionDomainError('torqueCurve', 'torqueCurve must cover idleRpm through redlineRpm');
  }
  const { rpm: peakPowerRpm, pathIndex: peakPowerPathIndex } = peakPowerPoint(definition.torqueCurve);
  if (!(peakPowerRpm < definition.redlineRpm)) {
    throw new DefinitionDomainError(
      `torqueCurve/${peakPowerPathIndex}/rpm`,
      'peak-power RPM derived from torqueCurve must be less than redlineRpm',
    );
  }
  return Object.freeze({
    ...definition,
    gearRatios: Object.freeze([...definition.gearRatios]),
    torqueCurve: Object.freeze(definition.torqueCurve.map((point) => Object.freeze({ ...point }))),
    peakPowerRpm,
  });
}
