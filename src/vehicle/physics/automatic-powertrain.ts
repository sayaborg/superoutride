import { DefinitionDomainError } from '../../core/admission.js';
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
  /** Clutch capacity as a multiple of the curve's maximum torque; above 1. */
  readonly clutchCapacityFactor: number;
}

/** One vehicle's powertrain under the game-wide rules; friction and inertia are never vehicle values. */
export interface PowertrainConstants {
  readonly fuelCutRedlineMargin: number;
  readonly drivelineEfficiency: number;
  readonly idleFrictionTorque: number;
  readonly redlineFrictionTorque: number;
  /** kg m^2 */
  readonly engineInertia: number;
  /** Lowest wheel-derived RPM at which a slipping clutch locks: idle * (1 + margin). */
  readonly clutchLockMinimumRpm: number;
  /** Fixed engine-side torque a slipping clutch can transmit: maximum curve torque * factor. */
  readonly clutchCapacityTorque: number;
}

/**
 * Friction torque = FMEP * displacement / (2 * pi * revolutions per cycle);
 * engine inertia = displacement in litres * game-wide inertia per litre;
 * clutch capacity = maximum curve torque * game-wide capacity factor.
 */
export function resolvePowertrainConstants(
  definition: Pick<AutomaticPowertrainDefinition, 'displacementCc' | 'cycle' | 'idleRpm' | 'torqueCurve'>,
  rules: PowertrainRules,
): Readonly<PowertrainConstants> {
  const torquePerPressure = (definition.displacementCc * 1e-6) / (2 * Math.PI * (definition.cycle / 2));
  return Object.freeze({
    fuelCutRedlineMargin: rules.fuelCutRedlineMargin,
    drivelineEfficiency: rules.drivelineEfficiency,
    idleFrictionTorque: rules.idleFrictionMeanEffectivePressure * torquePerPressure,
    redlineFrictionTorque: rules.redlineFrictionMeanEffectivePressure * torquePerPressure,
    engineInertia: (definition.displacementCc / 1000) * rules.engineInertiaPerLitre,
    clutchLockMinimumRpm: definition.idleRpm * (1 + rules.clutchLockIdleMargin),
    clutchCapacityTorque:
      Math.max(...definition.torqueCurve.map((point) => point.torqueNewtonMeters)) * rules.clutchCapacityFactor,
  });
}

/** Clutch observation: LOCK is the latch; otherwise SLIP while it transmits torque, else OPEN. */
export type ClutchObservation = 'LOCK' | 'SLIP' | 'OPEN';

/**
 * The last shift, numbered from 1. Sequence 0 with direction NONE means no shift yet; an update
 * without a shift leaves the record unchanged, so each shift is read once by its sequence.
 * Engine RPM is taken before the shift and after the shift's clutch update.
 */
export interface PowertrainShiftObservation {
  sequence: number;
  direction: 'NONE' | 'UP' | 'DOWN';
  fromRpm: number;
  toRpm: number;
}

export interface AutomaticPowertrainState {
  /** Selected gear, fuel-cut and clutch-lock latches and engine speed are the only dynamic powertrain memory. */
  gear: number;
  fuelCut: boolean;
  clutchLocked: boolean;
  engineRpm: number;
  /** Derived observation caches; none is consumed as state by the next drive solve. */
  /** The engine's only command: the requested opening clamped between its lower and upper bounds. */
  effectiveOpening: number;
  /** Signed engine torque; negative while friction exceeds the opening's torque. */
  engineTorqueNewtonMeters: number;
  /** Engine-side torque the clutch transmits: signed engine torque while locked, else within capacity. */
  clutchTorqueNewtonMeters: number;
  /** Signed requested wheel-side torque before protection/distribution, never a direct body force. */
  outputDriveTorque: number;
  shift: PowertrainShiftObservation;
}

/** Starts locked at the wheel-derived RPM when a slipping clutch at idle would lock, else slips at idle. */
export function createAutomaticPowertrainState(
  definition: CompiledAutomaticPowertrainDefinition,
  constants: PowertrainConstants,
  drivenWheelOmega = 0,
): AutomaticPowertrainState {
  assertWheelOmega(drivenWheelOmega);
  const wheelOmega = Math.abs(drivenWheelOmega);
  let gear = 1;
  while (gear < definition.gearRatios.length && coupledEngineRpm(definition, wheelOmega, gear) >= definition.redlineRpm)
    gear += 1;
  const wheelRpm = coupledEngineRpm(definition, drivenWheelOmega, gear);
  const locked = wheelRpm >= constants.clutchLockMinimumRpm;
  return {
    gear,
    fuelCut: false,
    engineRpm: locked ? wheelRpm : definition.idleRpm,
    clutchLocked: locked,
    effectiveOpening: 0,
    engineTorqueNewtonMeters: 0,
    clutchTorqueNewtonMeters: 0,
    outputDriveTorque: 0,
    shift: { sequence: 0, direction: 'NONE', fromRpm: 0, toRpm: 0 },
  };
}

/** Derives the clutch observation from the lock latch and the transmitted torque. */
export function observeClutch(state: Readonly<AutomaticPowertrainState>): ClutchObservation {
  if (state.clutchLocked) return 'LOCK';
  return state.clutchTorqueNewtonMeters > 0 ? 'SLIP' : 'OPEN';
}

/**
 * One step's linear drive map at the step's starting engine speed. Wheel torque is affine in the
 * opening: locked, `wheelPerEngineTorque * (opening*(curve+friction) - friction)`; slipping, the
 * same with the clutch's launch gap subtracted and clamped between zero and the clutch capacity.
 */
export interface PowertrainStep {
  locked: boolean;
  rpm: number;
  curve: number;
  friction: number;
  rpmPerTorque: number;
  /** Engine torque a slipping clutch keeps to lift the engine to peak-torque RPM; 0 when locked. */
  launchGapTorque: number;
  clutchCapacityTorque: number;
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
    clutchCapacityTorque: 0,
    wheelPerEngineTorque: 0,
    lowerOpening: 0,
    upperOpening: 1,
  };
}

/**
 * First half of one ordinary mechanics step. Shifts follow the wheel-derived RPM, at most one per
 * call. The clutch lock is a latch on the signed wheel-derived RPM: it locks when that RPM reaches
 * engine speed and the idle lock margin, and releases below idle. A clutch without capacity holds
 * no lock. The step's capacity is the constants' fixed capacity unless a caller holding the vehicle
 * passes 0. Fuel cut is a hysteretic latch on engine RPM. The returned map lets torque protection
 * bound drive torque before the opening is chosen.
 */
export function prepareAutomaticPowertrain(
  state: AutomaticPowertrainState,
  definition: CompiledAutomaticPowertrainDefinition,
  constants: PowertrainConstants,
  drivenWheelOmega: number,
  allowShift: boolean,
  dt: number,
  step: PowertrainStep,
  clutchCapacityTorque = constants.clutchCapacityTorque,
): PowertrainStep {
  assertWheelOmega(drivenWheelOmega);
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('powertrain requires finite positive dt');
  if (!Number.isInteger(state.gear) || state.gear < 1 || state.gear > definition.gearRatios.length) {
    throw new RangeError('powertrain gear must index the authored forward ratios');
  }
  const wheelOmega = Math.abs(drivenWheelOmega);
  const rpmBeforeShift = coupledEngineRpm(definition, wheelOmega, state.gear);
  const engineRpmBeforeShift = state.engineRpm;
  let shift: 'NONE' | 'UP' | 'DOWN' = 'NONE';
  if (allowShift) {
    if (rpmBeforeShift >= definition.redlineRpm && state.gear < definition.gearRatios.length) {
      state.gear += 1;
      shift = 'UP';
    } else if (state.gear > 1) {
      const currentRatio = definition.gearRatios[state.gear - 1]!;
      const lowerRatio = definition.gearRatios[state.gear - 2]!;
      if (rpmBeforeShift * (lowerRatio / currentRatio) <= definition.peakPowerRpm) {
        state.gear -= 1;
        shift = 'DOWN';
      }
    }
  }

  const wheelRpm = coupledEngineRpm(definition, drivenWheelOmega, state.gear);
  if (!(clutchCapacityTorque > 0)) state.clutchLocked = false;
  else if (!state.clutchLocked && wheelRpm >= Math.max(state.engineRpm, constants.clutchLockMinimumRpm))
    state.clutchLocked = true;
  else if (state.clutchLocked && wheelRpm < definition.idleRpm) state.clutchLocked = false;
  const locked = state.clutchLocked;
  if (locked) state.engineRpm = wheelRpm;
  const rpm = state.engineRpm;
  if (shift !== 'NONE') {
    state.shift.sequence += 1;
    state.shift.direction = shift;
    state.shift.fromRpm = engineRpmBeforeShift;
    state.shift.toRpm = rpm;
  }
  if (state.fuelCut) {
    if (rpm <= definition.redlineRpm) state.fuelCut = false;
  } else if (rpm > definition.redlineRpm * (1 + constants.fuelCutRedlineMargin)) {
    state.fuelCut = true;
  }

  const friction = engineFrictionTorque(definition, constants, rpm);
  const curve = sampleEngineTorque(definition, rpm);
  const rpmPerTorque = (dt * RPM_PER_RADIAN_PER_SECOND) / constants.engineInertia;
  step.locked = locked;
  step.rpm = rpm;
  step.curve = curve;
  step.friction = friction;
  step.rpmPerTorque = rpmPerTorque;
  step.launchGapTorque = locked ? 0 : (definition.peakTorqueRpm - rpm) / rpmPerTorque;
  step.clutchCapacityTorque = clutchCapacityTorque;
  step.wheelPerEngineTorque =
    definition.gearRatios[state.gear - 1]! * definition.finalDriveRatio * constants.drivelineEfficiency;
  step.lowerOpening = clamp(((definition.idleRpm - rpm) / rpmPerTorque + friction) / (curve + friction), 0, 1);
  step.upperOpening = state.fuelCut ? 0 : 1;
  return step;
}

/**
 * Engine-side clutch torque at an engine torque. Locked, the engine torque itself. Slipping, the
 * torque that keeps the engine at peak-torque RPM, clamped between zero and the step's capacity.
 */
function clutchTorqueAt(step: PowertrainStep, engineTorque: number): number {
  return step.locked ? engineTorque : clamp(engineTorque - step.launchGapTorque, 0, step.clutchCapacityTorque);
}

/** Wheel torque the prepared step delivers at an opening. */
export function powertrainWheelTorque(step: PowertrainStep, opening: number): number {
  return clutchTorqueAt(step, opening * (step.curve + step.friction) - step.friction) * step.wheelPerEngineTorque;
}

/** The opening bounds before any drive-torque bound, applied to a requested opening. */
export function boundedOpening(
  step: PowertrainStep,
  requestedOpening: number,
  upperOpening = step.upperOpening,
  lowerOpening = step.lowerOpening,
): number {
  return Math.min(upperOpening, Math.max(lowerOpening, clamp(requestedOpening, 0, 1)));
}

/**
 * Opening whose wheel torque equals a drive-torque bound; the inverse of powertrainWheelTorque.
 * A slipping clutch never transmits negative torque, so a bound at or below zero maps to exactly
 * the opening that lifts the engine to peak-torque RPM, the largest opening that still transmits
 * nothing; a bound never limits an opening at which the clutch transmits nothing. A bound at or
 * above the clutch capacity (any bound at zero capacity) does not limit the opening. When even a
 * closed opening leaves the clutch above the bound (an engine far above peak-torque RPM), the
 * result is 0: the smallest opening, which lowers engine speed fastest, while the capacity-limited
 * clutch still exceeds the bound for those steps.
 */
function openingForWheelTorque(step: PowertrainStep, wheelTorque: number): number {
  if (step.locked) {
    const engineTorque = wheelTorque / step.wheelPerEngineTorque;
    return Math.max(0, (engineTorque + step.friction) / (step.curve + step.friction));
  }
  const clutchTorque = Math.max(0, wheelTorque / step.wheelPerEngineTorque);
  if (clutchTorque >= step.clutchCapacityTorque) return 1;
  const engineTorque = clutchTorque + step.launchGapTorque;
  return Math.max(0, (engineTorque + step.friction) / (step.curve + step.friction));
}

/**
 * Second half of the step. The effective opening, the engine's only command, is the requested
 * opening clamped between the lower bound (idle holding, then the drive-torque lower bound while
 * locked) and the upper bound (fuel cut, then the drive-torque upper bound); the upper bound wins.
 * Engine torque follows the effective opening. Locked, the engine turns with the wheels and
 * delivers its signed torque; negative torque is engine braking. Slipping, one law advances engine
 * speed: dRPM/dt = (opening torque - friction - clutch torque) / inertia, by forward Euler at the
 * step's starting RPM; the clutch transmits the torque that keeps the engine at peak-torque RPM,
 * clamped between zero and the step's capacity, so the lower bound cannot bind. Drive torque
 * reaches the wheels untrimmed.
 */
export function completeAutomaticPowertrain(
  state: AutomaticPowertrainState,
  step: PowertrainStep,
  requestedOpening: number,
  driveTorqueBounds: Readonly<{ upper: number; lower: number }>,
): number {
  const { upper, lower } = driveTorqueBounds;
  if (!Number.isFinite(requestedOpening) || Number.isNaN(upper) || Number.isNaN(lower)) {
    throw new RangeError('powertrain requires a finite requested opening and drive-torque bounds');
  }
  const upperOpening =
    upper === Infinity ? step.upperOpening : Math.min(step.upperOpening, openingForWheelTorque(step, upper));
  const lowerOpening =
    step.locked && lower !== -Infinity
      ? Math.max(step.lowerOpening, openingForWheelTorque(step, lower))
      : step.lowerOpening;
  const opening = boundedOpening(step, requestedOpening, upperOpening, lowerOpening);
  const engineTorque = opening * (step.curve + step.friction) - step.friction;
  const clutchTorque = clutchTorqueAt(step, engineTorque);
  if (!step.locked) state.engineRpm = step.rpm + (engineTorque - clutchTorque) * step.rpmPerTorque;
  state.effectiveOpening = opening;
  state.engineTorqueNewtonMeters = engineTorque;
  state.clutchTorqueNewtonMeters = clutchTorque;
  state.outputDriveTorque = clutchTorque * step.wheelPerEngineTorque;
  return state.outputDriveTorque;
}

const RPM_PER_RADIAN_PER_SECOND = 60 / (2 * Math.PI);

/** Linear in RPM from idle to redline and held at those values outside that range. */
function engineFrictionTorque(
  definition: Pick<AutomaticPowertrainDefinition, 'idleRpm' | 'redlineRpm'>,
  constants: PowertrainConstants,
  rpm: number,
): number {
  const t = clamp((rpm - definition.idleRpm) / (definition.redlineRpm - definition.idleRpm), 0, 1);
  return constants.idleFrictionTorque + (constants.redlineFrictionTorque - constants.idleFrictionTorque) * t;
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
