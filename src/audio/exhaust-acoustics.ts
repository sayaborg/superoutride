import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
// Physical assumptions of the derived values, not measured vehicle data. References and limits: docs/audio.md.
export const REFLECTION_REFERENCE = Object.freeze({
  temperatureK: 573.15, // assumed 300 C air surrogate, not exhaust composition
  pressurePa: 101325,
});
// The cylinder's blowdown: its gas when the exhaust valve opens and its valve's discharge coefficient.
export const BLOWDOWN_REFERENCE = Object.freeze({
  temperatureK: 1100, // cylinder gas at exhaust valve opening; petrol engines typically 1000-1300 K
  dischargeCoefficient: 0.65, // exhaust valve flow coefficient; measured exhaust valves 0.6-0.7 at working lift
});
const AIR = Object.freeze({ gamma: 1.4, gasConstant: 287, prandtl: 0.71 });
const waveSpeed = Math.round(Math.sqrt(AIR.gamma * AIR.gasConstant * REFLECTION_REFERENCE.temperatureK));
// Sutherland air viscosity (Pa s), then ideal-gas density. No running gas simulation.
const viscosity =
  (1.716e-5 * (REFLECTION_REFERENCE.temperatureK / 273) ** 1.5 * (273 + 111)) /
  (REFLECTION_REFERENCE.temperatureK + 111);
const density = REFLECTION_REFERENCE.pressurePa / (AIR.gasConstant * REFLECTION_REFERENCE.temperatureK);
// Kirchhoff thin-boundary-layer wall loss: alpha(f) = WALL_LOSS * sqrt(f) / radius, in Np/m.
const WALL_LOSS =
  (Math.sqrt((Math.PI * viscosity) / density) / waveSpeed) * (1 + (AIR.gamma - 1) / Math.sqrt(AIR.prandtl));

/** Unflanged open-end low-frequency pressure-reflection limit. A derived value: DEV controls never change it. */
export const OUTLET_REFLECTION = -1;

/**
 * The cutoff of the one-pole low-pass on an open end's return, `c/(2*pi*radius)` for a tube of `diameter`: its magnitude
 * matches |R| ~ 1 - (ka)^2/2 at low frequency, NOT the end correction's phase.
 */
export function openEndCutoffHz(diameter: number): number {
  return waveSpeed / (Math.PI * diameter);
}

/**
 * The cutoff of a tube of `diameter`'s first transverse mode, `1.841*c/(pi*D)`: above it the one-dimensional pipe
 * model no longer holds.
 */
export function transverseCutoffHz(diameter: number): number {
  return (1.841 * waveSpeed) / (Math.PI * diameter);
}

// Choked-flow coefficient psi* = sqrt(gamma)*(2/(gamma+1))^((gamma+1)/(2*(gamma-1))), and the cylinder gas's sound speed.
const CHOKED_FLOW = Math.sqrt(AIR.gamma) * (2 / (AIR.gamma + 1)) ** ((AIR.gamma + 1) / (2 * (AIR.gamma - 1)));
const blowdownSoundSpeed = Math.sqrt(AIR.gamma * AIR.gasConstant * BLOWDOWN_REFERENCE.temperatureK);

/**
 * The blowdown time constant `V/(A*c*psi*)` of a cylinder of `volume` (m^3) emptying through the narrower of its valve's
 * effective area (`dischargeCoefficient` times the area of `valveDiameter`) and its primary of `primaryDiameter`.
 */
export function blowdownSeconds(volume: number, valveDiameter: number, primaryDiameter: number): number {
  const valveArea = (BLOWDOWN_REFERENCE.dischargeCoefficient * Math.PI * valveDiameter ** 2) / 4;
  const primaryArea = (Math.PI * primaryDiameter ** 2) / 4;
  return volume / (Math.min(valveArea, primaryArea) * blowdownSoundSpeed * CHOKED_FLOW);
}

/** Log-spaced frequencies from 20 Hz to Nyquist at which a tube's wall-loss filter is fitted. */
const WALL_LOSS_FIT = Object.freeze({ lowestHz: 20, points: 64, iterations: 80 });

/**
 * The pole `p` of the one-pole low-pass `y += (1 - p) * (x - y)`, unity at DC, whose magnitude in dB best fits one
 * traversal's wall loss `-alpha(f) * length` (least squares over log-spaced frequencies from 20 Hz to Nyquist at `rate`)
 * for a tube of `diameter`. Golden-section search over `p` in [0, 1); computed once per tube when a sound is assembled.
 */
export function wallLossPole(length: number, diameter: number, rate: number): number {
  const { lowestHz, points, iterations } = WALL_LOSS_FIT;
  const cosines = new Float64Array(points);
  const targets = new Float64Array(points);
  const decibelsPerNeper = 20 / Math.LN10;
  for (let k = 0; k < points; k++) {
    const hz = lowestHz * (rate / 2 / lowestHz) ** (k / (points - 1));
    cosines[k] = Math.cos((2 * Math.PI * hz) / rate);
    targets[k] = (-decibelsPerNeper * WALL_LOSS * Math.sqrt(hz) * length) / (diameter / 2);
  }
  const cost = (p: number) => {
    let sum = 0;
    for (let k = 0; k < points; k++) {
      const decibels = 10 * Math.log10(((1 - p) * (1 - p)) / (1 - 2 * p * cosines[k]! + p * p));
      sum += (decibels - targets[k]!) ** 2;
    }
    return sum;
  };
  const ratio = (Math.sqrt(5) - 1) / 2;
  let low = 0,
    high = 1 - 1e-9;
  for (let i = 0; i < iterations; i++) {
    const left = high - ratio * (high - low),
      right = low + ratio * (high - low);
    if (cost(left) <= cost(right)) high = right;
    else low = left;
  }
  return (low + high) / 2;
}

/**
 * Every exhaust value that is not derived: listening settings on the DEV ENGINE panel. Defaults, in
 * `DEFAULT_AUDIO_SETTINGS`, are the implementer's initial values, not values the owner chose by listening.
 */
export interface ExhaustSettings {
  readonly closedExcitation: number;
  readonly pulseVariation: number;
  readonly pumpingExcitation: number;
  readonly pulseRiseMs: number;
  readonly blipOpening: number;
  readonly blipDecaySeconds: number;
  readonly clipCeiling: number;
}

interface SettingRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
// One numeric authority: each range is both the accepted domain and the DEV control's.
export const EXHAUST_SETTING_RANGES: Readonly<Record<keyof ExhaustSettings, SettingRange>> = Object.freeze({
  // Excitation divides the rise time, so its least value is one control step, never zero.
  closedExcitation: Object.freeze({ min: 0.01, max: 1, step: 0.01 }),
  pulseVariation: Object.freeze({ min: 0, max: 0.4, step: 0.01 }),
  pumpingExcitation: Object.freeze({ min: 0.01, max: 0.5, step: 0.01 }),
  pulseRiseMs: Object.freeze({ min: 0.05, max: 2, step: 0.01 }),
  blipOpening: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  blipDecaySeconds: Object.freeze({ min: 0.02, max: 0.3, step: 0.01 }),
  clipCeiling: Object.freeze({ min: 0.2, max: 1, step: 0.01 }),
});

/**
 * The listening stage's smooth, bounded saturation `ceiling*x/(1+|x|)`: small-signal gain and asymptotic bound
 * `ceiling`, with no table clipping or unconstrained feedback gain.
 */
export function softClip(x: number, ceiling: number): number {
  return (ceiling * x) / (1 + Math.abs(x));
}

export function resolveExhaustSettings(overrides: Partial<ExhaustSettings> = {}): ExhaustSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS.exhaust };
  for (const key of Object.keys(EXHAUST_SETTING_RANGES) as (keyof ExhaustSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = EXHAUST_SETTING_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max)
      throw new RangeError(`invalid exhaust settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

// Derived from REFLECTION_REFERENCE: c = sqrt(gamma R T), rounded to 1 m/s.
export const ACOUSTICS = Object.freeze({ waveSpeed });
