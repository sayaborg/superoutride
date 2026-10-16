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

/** One traversal's Kirchhoff wall loss `alpha(f)*length` in nepers at `hz`, for a tube of `length` and `diameter`. */
export function wallLossNepers(length: number, diameter: number, hz: number): number {
  return (WALL_LOSS * Math.sqrt(hz) * length) / (diameter / 2);
}

/**
 * The wall loss's shelves: one first-order shelf at each corner, `ratio` apart, the same for every tube; a shelf's zero
 * is capped at `zeroCap` of the rate, the domain's edge for tubes beyond the data (no catalog tube reaches it).
 */
const WALL_LOSS_SHELVES = Object.freeze({ cornersHz: Object.freeze([20, 160, 1280, 10240]), ratio: 8, zeroCap: 0.49 });

/**
 * Each shelf's bilinear coefficients `[b0, b1, a1]` for one traversal of a tube of `length` and `diameter` at `rate`,
 * targeting `ln|H(f)| = -kappa*sqrt(f)`: shelf k at corner `f_k` is `kappa*(sqrt(2)*ln(r)/pi)*sqrt(f_k)` nepers deep, the
 * lowest also carrying the omitted shelves below it (times `sqrt(r)/(sqrt(r)-1)`).
 */
export function wallLossSections(length: number, diameter: number, rate: number): Float64Array {
  const { cornersHz, ratio, zeroCap } = WALL_LOSS_SHELVES;
  const kappa = wallLossNepers(length, diameter, 1);
  const out = new Float64Array(cornersHz.length * 3);
  const K = 2 * rate;
  cornersHz.forEach((fp, k) => {
    let depth = kappa * ((Math.SQRT2 * Math.log(ratio)) / Math.PI) * Math.sqrt(fp);
    if (k === 0) depth *= Math.sqrt(ratio) / (Math.sqrt(ratio) - 1);
    const fz = Math.min(fp * Math.exp(depth), zeroCap * rate);
    const wp = K * Math.tan((Math.PI * fp) / rate),
      wz = K * Math.tan((Math.PI * fz) / rate);
    const g = wp / wz,
      a0 = K + wp;
    out[3 * k] = (g * (K + wz)) / a0; // b0
    out[3 * k + 1] = (g * (wz - K)) / a0; // b1
    out[3 * k + 2] = (wp - K) / a0; // a1
  });
  return out;
}

/** The wall loss's poles `a1_k` at `rate`: one per shelf, shared by every tube. */
export function wallLossPoles(rate: number): Float64Array {
  const K = 2 * rate;
  return Float64Array.from(WALL_LOSS_SHELVES.cornersHz, (fp) => {
    const wp = K * Math.tan((Math.PI * fp) / rate);
    return (wp - K) / (K + wp);
  });
}

/**
 * A tube's wall-loss weights `[C, R_0, R_1, R_2, R_3]` at `rate`: its shelves in series, `prod (b0_k + b1_k w)/(1 +
 * a1_k w)` with `w = z^-1`, as partial fractions `C + sum R_k/(1 + a1_k w)` over `wallLossPoles`. `C = prod b1_k/a1_k`;
 * `R_k` is the residue at `w = -1/a1_k`.
 */
export function wallLossWeights(length: number, diameter: number, rate: number): Float64Array {
  const s = wallLossSections(length, diameter, rate);
  const shelves = WALL_LOSS_SHELVES.cornersHz.length;
  const b0 = (k: number) => s[3 * k]!,
    b1 = (k: number) => s[3 * k + 1]!,
    a = (k: number) => s[3 * k + 2]!;
  const out = new Float64Array(shelves + 1);
  let direct = 1;
  for (let k = 0; k < shelves; k++) direct *= b1(k) / a(k);
  out[0] = direct;
  for (let k = 0; k < shelves; k++) {
    const w = -1 / a(k);
    let residue = b0(k) + b1(k) * w;
    for (let j = 0; j < shelves; j++) if (j !== k) residue *= (b0(j) + b1(j) * w) / (1 + a(j) * w);
    out[k + 1] = residue;
  }
  return out;
}

/**
 * Every exhaust value that is not derived: listening settings on the DEV ENGINE panel. Defaults, in
 * `DEFAULT_AUDIO_SETTINGS`, are the owner's, chosen by listening.
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

/**
 * The listening stage's drive into the soft clip: the gain `10^((targetLufs - lufs)/20)` that brings an engine of
 * measured loudness `lufs` to `targetLufs`, or 1 for an engine not measured (a delivery without measured products).
 */
export function engineDriveGain(targetLufs: number, lufs: number | null): number {
  return lufs === null ? 1 : 10 ** ((targetLufs - lufs) / 20);
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
