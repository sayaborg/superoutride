// Reference conditions, not measured vehicle data. References and limits: docs/audio.md.
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

export interface ExhaustSettings {
  readonly attenuationPerMeter: number;
  readonly returnCutoffHz: number;
  readonly outletReflection: number;
  readonly closedExcitation: number;
  readonly outputCutoffHz: number;
  readonly pulseVariation: number;
  readonly pumpingExcitation: number;
  readonly pulseRiseDegrees: number;
  readonly pulseDecayDegrees: number;
}
export const DEFAULT_EXHAUST_SETTINGS: ExhaustSettings = Object.freeze({
  // Rounded to control resolution; Kirchhoff thin-boundary-layer loss at the reference frequency.
  attenuationPerMeter: Math.round(attenuation * 100) / 100,
  // One-pole magnitude matches |R| ~ 1 - (ka)^2/2 at low frequency; NOT its end-correction phase.
  returnCutoffHz: Math.round(waveSpeed / (2 * Math.PI * REFLECTION_REFERENCE.radiusMeters) / 100) * 100,
  outletReflection: -1, // unflanged open-end low-frequency pressure-reflection limit
  closedExcitation: 0.22, // retained authored control; cannot be inferred from pipe acoustics
  // Crank-angle constants: blowdown is a crank-angle phenomenon, so pulses last longer at low RPM.
  // Defaults equal the former 0.2 ms rise and 5 ms decay at 3000 RPM, where 1 ms = 18 degrees.
  pulseRiseDegrees: 3.6, // common provisional full-excitation rise
  pulseDecayDegrees: 90, // common provisional decay; base strength is fixed at 1
  pulseVariation: 0.2, // absolute full-excitation fraction; acoustic sketch, not measured combustion variance
  // Firing strength during fuel cut: exhaust-valve blowdown without combustion. Provisional listening value,
  // separate from closedExcitation, which is weak combustion at closed throttle.
  pumpingExcitation: 0.06,
  outputCutoffHz: 7300, // post-clip listening filter; not measured muffler transmission loss
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
  outletReflection: Object.freeze({ min: -1, max: 0, step: 0.01 }),
  returnCutoffHz: Object.freeze({ min: 100, max: 10000, step: 100, uiMin: 500 }),
  attenuationPerMeter: Object.freeze({ min: 0, max: 1, step: 0.01, uiMax: 0.3 }),
  closedExcitation: Object.freeze({ min: 0, max: 1, step: 0.01, exclusiveMin: true, uiMin: 0.01 }),
  outputCutoffHz: Object.freeze({ min: 100, max: 12000, step: 100 }),
  pulseVariation: Object.freeze({ min: 0, max: 0.4, step: 0.01 }),
  // Excitation divides the rise time, so zero is excluded like closedExcitation.
  pumpingExcitation: Object.freeze({ min: 0, max: 0.5, step: 0.01, exclusiveMin: true, uiMin: 0.01 }),
  pulseRiseDegrees: Object.freeze({ min: 0.2, max: 36, step: 0.1 }),
  pulseDecayDegrees: Object.freeze({ min: 2, max: 360, step: 1 }),
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

/**
 * A short opening peak that sounds like a rev-matching throttle blip on a downshift. It is not a
 * physical shift duration; the physical shift is instantaneous. Provisional listening values.
 */
export const DOWNSHIFT_BLIP = Object.freeze({ opening: 0.7, decaySeconds: 0.08 });

export const ACOUSTICS = Object.freeze({
  waveSpeed, // fixed air-surrogate reference; not measured temperature
  cylinderClosedReflection: 0.94, // nearly rigid effective termination; magnitude < 1 absorbs energy
  cylinderOpenReflection: -0.3, // pressure-release-like endpoint; positive impedance, not valve-flow physics
});
// Listening-output conditioning: DC removal and bounded amplitude; not exhaust properties.
export const OUTPUT = Object.freeze({ dcHz: 18, ceiling: 0.65 });
