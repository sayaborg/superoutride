// Reference conditions, not measured vehicle data. Sources and limits: docs/audio.md.
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

interface ExhaustTuning {
  readonly attenuationPerMeter: number;
  readonly returnCutoffHz: number;
  readonly outletReflection: number;
  readonly closedExcitation: number;
  readonly outputCutoffHz: number;
  readonly pulseVariation: number;
}
export const DEFAULT_EXHAUST_TUNING: ExhaustTuning = Object.freeze({
  // Rounded to slider resolution; Kirchhoff thin-boundary-layer loss at the reference frequency.
  attenuationPerMeter: Math.round(attenuation * 100) / 100,
  // One-pole magnitude matches |R| ~ 1 - (ka)^2/2 at low frequency; NOT its end-correction phase.
  returnCutoffHz: Math.round(waveSpeed / (2 * Math.PI * REFLECTION_REFERENCE.radiusMeters) / 100) * 100,
  outletReflection: -1, // unflanged open-end low-frequency pressure-reflection limit
  closedExcitation: 0.22, // retained authored control; cannot be inferred from pipe acoustics
  pulseVariation: 0.06, // symmetric event-strength variation; acoustic sketch, not measured combustion variance
  outputCutoffHz: 7300, // post-clip listening filter; not measured muffler transmission loss
});
export const ACOUSTICS = Object.freeze({
  waveSpeed, // fixed air-surrogate reference; not measured temperature
  sourceClosedReflection: 0.94, // nearly rigid effective termination; magnitude < 1 absorbs energy
  sourceOpenReflection: -0.3, // pressure-release-like endpoint; positive impedance, not valve-flow physics
  sourceWindowCycles: 0.23, // empirical periodic boundary; NOT valve timing
});
// Presentation response time, not mechanical inertia.
export const CONTROL_SECONDS = 0.025;
// Listening-output conditioning: DC removal and bounded amplitude; not exhaust properties.
export const OUTPUT = Object.freeze({ dcHz: 18, ceiling: 0.65 });
