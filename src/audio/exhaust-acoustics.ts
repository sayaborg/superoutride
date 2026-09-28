// Physical assumptions of the derived values, not measured vehicle data. References and limits: docs/audio.md.
export const REFLECTION_REFERENCE = Object.freeze({
  temperatureK: 573.15, // assumed 300 C air surrogate, not exhaust composition
  pressurePa: 101325,
  radiusMeters: 0.025, // assumed 50 mm internal diameter, unflanged opening
  frequencyHz: 500, // reference frequency for the constant-loss approximation
});
const AIR = Object.freeze({ gamma: 1.4, gasConstant: 287, prandtl: 0.71 });
const waveSpeed = Math.round(Math.sqrt(AIR.gamma * AIR.gasConstant * REFLECTION_REFERENCE.temperatureK));
// Sutherland air viscosity (Pa s), then ideal-gas density. No running gas simulation.
const viscosity =
  (1.716e-5 * (REFLECTION_REFERENCE.temperatureK / 273) ** 1.5 * (273 + 111)) /
  (REFLECTION_REFERENCE.temperatureK + 111);
const density = REFLECTION_REFERENCE.pressurePa / (AIR.gasConstant * REFLECTION_REFERENCE.temperatureK);
const attenuation =
  (Math.sqrt((Math.PI * REFLECTION_REFERENCE.frequencyHz * viscosity) / density) /
    (REFLECTION_REFERENCE.radiusMeters * waveSpeed)) *
  (1 + (AIR.gamma - 1) / Math.sqrt(AIR.prandtl));

/** Pipe coefficients derived from REFLECTION_REFERENCE. Derived values: DEV controls never change them. */
export const PIPE_COEFFICIENTS = Object.freeze({
  // Rounded to control resolution; Kirchhoff thin-boundary-layer loss at the reference frequency.
  attenuationPerMeter: Math.round(attenuation * 100) / 100,
  // One-pole magnitude matches |R| ~ 1 - (ka)^2/2 at low frequency; NOT its end-correction phase.
  returnCutoffHz: Math.round(waveSpeed / (2 * Math.PI * REFLECTION_REFERENCE.radiusMeters) / 100) * 100,
  outletReflection: -1, // unflanged open-end low-frequency pressure-reflection limit
});

/**
 * Every exhaust value that is not derived: listening settings on the DEV ENGINE panel. Defaults are the
 * implementer's initial values, not values the owner chose by listening.
 */
export interface ExhaustSettings {
  readonly closedExcitation: number;
  readonly outputCutoffHz: number;
  readonly pulseVariation: number;
  readonly pumpingExcitation: number;
  readonly pulseRiseMs: number;
  readonly pulseDecayMs: number;
  readonly blipOpening: number;
  readonly blipDecaySeconds: number;
  readonly popProbability: number;
  readonly popStrength: number;
  readonly cylinderWindowCycles: number;
  readonly cylinderClosedReflection: number;
  readonly cylinderOpenReflection: number;
  readonly dcHz: number;
  readonly clipCeiling: number;
}
export const DEFAULT_EXHAUST_SETTINGS: ExhaustSettings = Object.freeze({
  closedExcitation: 0.22, // No derivation; chosen by listening. Weak combustion at closed throttle.
  pulseRiseMs: 0.2, // No derivation; chosen by listening. Full-excitation rise time constant.
  pulseDecayMs: 5, // No derivation; chosen by listening. Decay time constant; base strength is fixed at 1.
  pulseVariation: 0.2, // No derivation; chosen by listening. Absolute fraction of full excitation.
  // No derivation; chosen by listening. Firing strength during fuel cut: blowdown without combustion.
  pumpingExcitation: 0.06,
  outputCutoffHz: 7300, // No derivation; chosen by listening. Post-clip listening filter.
  // No derivation; chosen by listening. A downshift's rev-matching opening peak and its decay time; the
  // physical shift is instantaneous.
  blipOpening: 0.7,
  blipDecaySeconds: 0.08,
  // No derivation; chosen by listening. Per-firing overrun pop probability and the pop pulse strength at
  // the collector junction; the pop rate is proportional to RPM.
  popProbability: 0.12,
  popStrength: 0.5,
  // No derivation; chosen by listening. The cylinder-end boundary window as a cycle fraction, NOT the valve's
  // open duration (a 240-degree window removed the pipe resonance, so 11-7f restored this value).
  cylinderWindowCycles: 0.23,
  // No derivation; chosen by listening. Nearly rigid closed termination; magnitude < 1 absorbs energy.
  cylinderClosedReflection: 0.94,
  // No derivation; chosen by listening. Pressure-release-like open endpoint, not valve-flow physics.
  cylinderOpenReflection: -0.3,
  dcHz: 18, // No derivation; chosen by listening. Output DC-removal corner.
  clipCeiling: 0.65, // No derivation; chosen by listening. Soft-clip asymptotic bound and small-signal gain.
});

interface SettingRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly uiMin?: number;
  readonly uiMax?: number;
  readonly exclusiveMin?: boolean;
}
// One numeric authority. Optional UI limits deliberately narrow the kernel's accepted domain.
export const EXHAUST_SETTING_RANGES: Readonly<Record<keyof ExhaustSettings, SettingRange>> = Object.freeze({
  closedExcitation: Object.freeze({ min: 0, max: 1, step: 0.01, exclusiveMin: true, uiMin: 0.01 }),
  outputCutoffHz: Object.freeze({ min: 100, max: 12000, step: 100 }),
  pulseVariation: Object.freeze({ min: 0, max: 0.4, step: 0.01 }),
  // Excitation divides the rise time, so zero is excluded like closedExcitation.
  pumpingExcitation: Object.freeze({ min: 0, max: 0.5, step: 0.01, exclusiveMin: true, uiMin: 0.01 }),
  pulseRiseMs: Object.freeze({ min: 0.05, max: 2, step: 0.01 }),
  pulseDecayMs: Object.freeze({ min: 0.1, max: 30, step: 0.1 }),
  blipOpening: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  blipDecaySeconds: Object.freeze({ min: 0.02, max: 0.3, step: 0.01 }),
  popProbability: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  popStrength: Object.freeze({ min: 0, max: 1, step: 0.05 }),
  cylinderWindowCycles: Object.freeze({ min: 0.05, max: 0.6, step: 0.01 }),
  cylinderClosedReflection: Object.freeze({ min: 0.5, max: 1, step: 0.01 }),
  cylinderOpenReflection: Object.freeze({ min: -1, max: 0.5, step: 0.05 }),
  dcHz: Object.freeze({ min: 5, max: 60, step: 1 }),
  clipCeiling: Object.freeze({ min: 0.2, max: 1, step: 0.01 }),
});

export function resolveExhaustSettings(overrides: Partial<ExhaustSettings> = {}): ExhaustSettings {
  const settings = { ...DEFAULT_EXHAUST_SETTINGS };
  for (const key of Object.keys(EXHAUST_SETTING_RANGES) as (keyof ExhaustSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = EXHAUST_SETTING_RANGES[key];
    if (
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max ||
      (range.exclusiveMin && value === range.min)
    )
      throw new RangeError(`invalid exhaust settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

// Derived from REFLECTION_REFERENCE: c = sqrt(gamma R T), rounded to 1 m/s.
export const ACOUSTICS = Object.freeze({ waveSpeed });
