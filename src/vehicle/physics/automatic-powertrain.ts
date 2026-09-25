import { DefinitionDomainError } from './definition-domain-error.js';
import { clamp } from '../../core/math.js';

interface EngineTorquePoint {
  readonly rpm: number;
  readonly torqueNewtonMeters: number;
}

/** Automated MT with one clutch rule and an engine rotor; no converter or shift-duration model. */
export interface AutomaticPowertrainDefinition {
  /** Authored engine size and cycle; friction torque derives from them with game-wide pressures. */
  readonly displacementCc: number;
  readonly cycle: 2 | 4;
  /** Engine speed held by idle-holding torque, and the torque-sampling floor. */
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly finalDriveRatio: number;
  readonly gearRatios: readonly number[];
  readonly torqueCurve: readonly EngineTorquePoint[];
}

export interface CompiledAutomaticPowertrainDefinition extends AutomaticPowertrainDefinition {
  /** Derived once from the admitted torque curve; never authored as vehicle values. */
  readonly peakPowerRpm: number;
  /** Launch speed: the lowest RPM of the curve's maximum torque, the slipping engine's upper limit. */
  readonly peakTorqueRpm: number;
}

/** Game-wide powertrain rules converted from the driving definition; pressures are in Pa. */
export interface PowertrainRules {
  readonly fuelCutRedlineMargin: number;
  readonly idleFrictionMeanEffectivePressure: number;
  readonly redlineFrictionMeanEffectivePressure: number;
  readonly drivelineEfficiency: number;
  /** kg m^2 per litre of displacement. */
  readonly engineInertiaPerLitre: number;
  /** Fraction above idle that a slipping clutch's lock RPM keeps, leaving a gap to the idle release. */
  readonly clutchLockIdleMargin: number;
}

/** One vehicle's powertrain under the game-wide rules; friction and inertia are never vehicle values. */
export interface PowertrainCoupling {
  readonly fuelCutRedlineMargin: number;
  readonly drivelineEfficiency: number;
  readonly idleFrictionTorque: number;
  readonly redlineFrictionTorque: number;
  /** kg m^2 */
  readonly engineInertia: number;
  /** Lowest wheel-derived RPM at which a slipping clutch locks: idle * (1 + margin). */
  readonly clutchLockMinimumRpm: number;
}

/**
 * Friction torque = FMEP * displacement / (2 * pi * revolutions per cycle);
 * engine inertia = displacement in litres * game-wide inertia per litre.
 */
export function couplePowertrain(
  definition: Pick<AutomaticPowertrainDefinition, 'displacementCc' | 'cycle' | 'idleRpm'>,
  rules: PowertrainRules,
): Readonly<PowertrainCoupling> {
  const torquePerPressure = (definition.displacementCc * 1e-6) / (2 * Math.PI * (definition.cycle / 2));
  return Object.freeze({
    fuelCutRedlineMargin: rules.fuelCutRedlineMargin,
    drivelineEfficiency: rules.drivelineEfficiency,
    idleFrictionTorque: rules.idleFrictionMeanEffectivePressure * torquePerPressure,
    redlineFrictionTorque: rules.redlineFrictionMeanEffectivePressure * torquePerPressure,
    engineInertia: (definition.displacementCc / 1000) * rules.engineInertiaPerLitre,
    clutchLockMinimumRpm: definition.idleRpm * (1 + rules.clutchLockIdleMargin),
  });
}

export type ClutchState = 'LOCK' | 'SLIP';

export interface AutomaticPowertrainState {
  /** Selected gear, fuel-cut and clutch latches and engine speed are the only dynamic powertrain memory. */
  gear: number;
  fuelCut: boolean;
  clutch: ClutchState;
  engineRpm: number;
  /** Derived observation caches; none is consumed as state by the next drive solve. */
  /** The engine's only command: the requested opening clamped between its lower and upper bounds. */
  effectiveOpening: number;
  /** Signed engine torque; negative while friction exceeds the opening's torque. */
  engineTorqueNewtonMeters: number;
  /** Signed requested wheel-side torque before protection/distribution, never a direct body force. */
  outputDriveTorque: number;
}

/** Starts locked at the wheel-derived RPM when a slipping clutch at idle would lock, else slips at idle. */
export function createAutomaticPowertrainState(
  definition: CompiledAutomaticPowertrainDefinition,
  coupling: PowertrainCoupling,
  drivenWheelOmega = 0,
): AutomaticPowertrainState {
  assertWheelOmega(drivenWheelOmega);
  const wheelOmega = Math.abs(drivenWheelOmega);
  let gear = 1;
  while (gear < definition.gearRatios.length && coupledEngineRpm(definition, wheelOmega, gear) >= definition.redlineRpm)
    gear += 1;
  const wheelRpm = coupledEngineRpm(definition, drivenWheelOmega, gear);
  const locked = wheelRpm >= coupling.clutchLockMinimumRpm;
  return {
    gear,
    fuelCut: false,
    engineRpm: locked ? wheelRpm : definition.idleRpm,
    clutch: locked ? 'LOCK' : 'SLIP',
    effectiveOpening: 0,
    engineTorqueNewtonMeters: 0,
    outputDriveTorque: 0,
  };
}

/**
 * One step's linear drive map at the step's starting engine speed. Wheel torque is affine in the
 * opening: locked, `wheelPerEngineTorque * (opening*(curve+friction) - friction)`; slipping, the
 * same with the clutch's launch gap subtracted and floored at zero.
 */
export interface PowertrainStep {
  locked: boolean;
  rpm: number;
  curve: number;
  friction: number;
  rpmPerTorque: number;
  /** Engine torque a slipping clutch keeps to lift the engine to peak-torque RPM; 0 when locked. */
  launchGapTorque: number;
  wheelPerEngineTorque: number;
  /** Idle-holding opening. */
  lowerOpening: number;
  /** 0 during fuel cut, else 1. */
  upperOpening: number;
}

export function createPowertrainStep(): PowertrainStep {
  return {
    locked: false,
    rpm: 0,
    curve: 0,
    friction: 0,
    rpmPerTorque: 0,
    launchGapTorque: 0,
    wheelPerEngineTorque: 0,
    lowerOpening: 0,
    upperOpening: 1,
  };
}

/**
 * First half of one ordinary mechanics step. Shifts follow the wheel-derived RPM, at most one per
 * call. The clutch is a latch on the signed wheel-derived RPM: it locks when that RPM reaches
 * engine speed and the idle lock margin, and releases below idle. Fuel cut is a hysteretic latch
 * on engine RPM. The returned map lets torque protection bound drive torque before the opening
 * is chosen.
 */
export function prepareAutomaticPowertrain(
  state: AutomaticPowertrainState,
  definition: CompiledAutomaticPowertrainDefinition,
  coupling: PowertrainCoupling,
  drivenWheelOmega: number,
  allowShift: boolean,
  dt: number,
  step: PowertrainStep,
): PowertrainStep {
  assertWheelOmega(drivenWheelOmega);
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('powertrain requires finite positive dt');
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

  const wheelRpm = coupledEngineRpm(definition, drivenWheelOmega, state.gear);
  if (state.clutch === 'SLIP' && wheelRpm >= Math.max(state.engineRpm, coupling.clutchLockMinimumRpm))
    state.clutch = 'LOCK';
  else if (state.clutch === 'LOCK' && wheelRpm < definition.idleRpm) state.clutch = 'SLIP';
  const locked = state.clutch === 'LOCK';
  if (locked) state.engineRpm = wheelRpm;
  const rpm = state.engineRpm;
  if (state.fuelCut) {
    if (rpm <= definition.redlineRpm) state.fuelCut = false;
  } else if (rpm > definition.redlineRpm * (1 + coupling.fuelCutRedlineMargin)) {
    state.fuelCut = true;
  }

  const friction = engineFrictionTorque(definition, coupling, rpm);
  const curve = sampleEngineTorque(definition, rpm);
  const rpmPerTorque = (dt * RPM_PER_RADIAN_PER_SECOND) / coupling.engineInertia;
  step.locked = locked;
  step.rpm = rpm;
  step.curve = curve;
  step.friction = friction;
  step.rpmPerTorque = rpmPerTorque;
  step.launchGapTorque = locked ? 0 : (definition.peakTorqueRpm - rpm) / rpmPerTorque;
  step.wheelPerEngineTorque =
    definition.gearRatios[state.gear - 1]! * definition.finalDriveRatio * coupling.drivelineEfficiency;
  step.lowerOpening = clamp(((definition.idleRpm - rpm) / rpmPerTorque + friction) / (curve + friction), 0, 1);
  step.upperOpening = state.fuelCut ? 0 : 1;
  return step;
}

/** Wheel torque the prepared step delivers at an opening. */
export function powertrainWheelTorque(step: PowertrainStep, opening: number): number {
  const engineTorque = opening * (step.curve + step.friction) - step.friction;
  const clutchTorque = step.locked ? engineTorque : Math.max(0, engineTorque - step.launchGapTorque);
  return clutchTorque * step.wheelPerEngineTorque;
}

/** The opening bounds before any drive-torque bound, applied to a requested opening. */
export function boundedOpening(
  step: PowertrainStep,
  requestedOpening: number,
  upperOpening = step.upperOpening,
): number {
  return Math.min(upperOpening, Math.max(step.lowerOpening, clamp(requestedOpening, 0, 1)));
}

/**
 * Largest opening whose wheel torque stays within a drive-torque upper bound; the inverse of
 * powertrainWheelTorque. A slipping clutch never transmits negative torque, so a bound at or
 * below zero allows exactly the opening that lifts the engine to peak-torque RPM.
 */
function openingForWheelTorque(step: PowertrainStep, wheelTorque: number): number {
  const clutchTorque = wheelTorque / step.wheelPerEngineTorque;
  const engineTorque = step.locked ? clutchTorque : Math.max(0, clutchTorque) + step.launchGapTorque;
  return Math.max(0, (engineTorque + step.friction) / (step.curve + step.friction));
}

/**
 * Second half of the step. The effective opening, the engine's only command, is the requested
 * opening clamped between the lower bound (idle holding) and the upper bound (fuel cut, then the
 * drive-torque upper bound); the upper bound wins. Engine torque follows the effective opening.
 * Locked, the engine turns with the wheels and delivers its signed torque. Slipping, one law
 * advances engine speed: dRPM/dt = (opening torque - friction - clutch torque) / inertia, by
 * forward Euler at the step's starting RPM; the clutch transmits only the positive excess that
 * would carry the engine past peak-torque RPM. Drive torque reaches the wheels untrimmed.
 */
export function completeAutomaticPowertrain(
  state: AutomaticPowertrainState,
  step: PowertrainStep,
  requestedOpening: number,
  driveTorqueUpperBound: number,
): number {
  if (!Number.isFinite(requestedOpening) || Number.isNaN(driveTorqueUpperBound)) {
    throw new RangeError('powertrain requires a finite requested opening and a drive-torque bound');
  }
  const upperOpening =
    driveTorqueUpperBound === Infinity
      ? step.upperOpening
      : Math.min(step.upperOpening, openingForWheelTorque(step, driveTorqueUpperBound));
  const opening = boundedOpening(step, requestedOpening, upperOpening);
  const engineTorque = opening * (step.curve + step.friction) - step.friction;
  const clutchTorque = step.locked ? engineTorque : Math.max(0, engineTorque - step.launchGapTorque);
  if (!step.locked) state.engineRpm = step.rpm + (engineTorque - clutchTorque) * step.rpmPerTorque;
  state.effectiveOpening = opening;
  state.engineTorqueNewtonMeters = engineTorque;
  state.outputDriveTorque = clutchTorque * step.wheelPerEngineTorque;
  return state.outputDriveTorque;
}

const RPM_PER_RADIAN_PER_SECOND = 60 / (2 * Math.PI);

/** Linear in RPM from idle to redline and held at those values outside that range. */
function engineFrictionTorque(
  definition: Pick<AutomaticPowertrainDefinition, 'idleRpm' | 'redlineRpm'>,
  coupling: PowertrainCoupling,
  rpm: number,
): number {
  const t = clamp((rpm - definition.idleRpm) / (definition.redlineRpm - definition.idleRpm), 0, 1);
  return coupling.idleFrictionTorque + (coupling.redlineFrictionTorque - coupling.idleFrictionTorque) * t;
}

/** Below idle, sample the idle torque. */
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
  for (const field of ['idleRpm', 'redlineRpm', 'finalDriveRatio'] as const) {
    if (!Number.isFinite(definition[field])) throw new DefinitionDomainError(field, `${field} must be finite`);
  }
  if (!(0 < definition.idleRpm)) throw new DefinitionDomainError('idleRpm', 'idleRpm must be > 0');
  if (!(definition.idleRpm < definition.redlineRpm))
    throw new DefinitionDomainError('redlineRpm', 'redlineRpm must be greater than idleRpm');
  if (!(definition.finalDriveRatio > 0))
    throw new DefinitionDomainError('finalDriveRatio', 'finalDriveRatio must be > 0');
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
  const peakTorque = definition.torqueCurve.reduce((best, point) =>
    point.torqueNewtonMeters > best.torqueNewtonMeters ? point : best,
  );
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
    peakTorqueRpm: peakTorque.rpm,
  });
}
