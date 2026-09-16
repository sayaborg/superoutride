import { TireSynthesis, type TireParameters } from './tire-synthesis.js';
import { SPECTRAL_INPUT_KEYS, SPECTRAL_SETTINGS, type SpectralObservation } from './tire-spectral-acoustics.js';
import {
  SpectralBand,
  SmoothRandom,
  spectralComponentSeeds,
  spectralSquealBandwidth,
  SpectralMaterial,
  validateSpectralObservation,
} from './tire-spectral-primitives.js';
import { SpectralRolling } from './tire-spectral-rolling.js';
import { TIRE_CONTROL_RANGES } from './tire-sound-controls.js';

/** Listening settings, not measured tire acoustics. The CURRENT dynamics law is shared. */
export const HYBRID_SETTINGS = Object.freeze({
  // Require stronger excitation before Hopf growth; CURRENT retains its original threshold.
  excitationThreshold: 0.2,
  // Preserve CURRENT's Hz excursions while lifting its 650 Hz base to SPECTRAL's 1100 Hz base.
  pitchOffsetHz: 450,
  // A fixed pickup gain, not RMS matching. Strong Hopf vibration uses the full spectral palette.
  squealGain: SPECTRAL_SETTINGS.squealGain,
  harmonicAmplitudeReference: 0.5,
});

/** CURRENT dynamics into four finite-width Q bands, plus shared SPECTRAL R. No S synthesis. */
export class TireHybridSynthesis {
  private readonly controller: TireSynthesis;
  private readonly bands: SpectralBand[];
  private readonly wander: SmoothRandom;
  private readonly rolling: SpectralRolling;
  private readonly material = new SpectralMaterial();
  private observation = {
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 0,
    wheelAngularSpeed: 0,
    load: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    demand: 0,
  };
  private supported = false;
  private clock: number;
  private width: number = SPECTRAL_SETTINGS.squealBaseBandwidthHz;
  private readonly tone: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private previous = 0;
  private highpass = 0;
  roadOutput = 0;
  squealOutput = 0;
  constructor(
    private readonly rate: number,
    seed: number,
    controlSeed: number,
  ) {
    this.controller = new TireSynthesis(rate, controlSeed, HYBRID_SETTINGS.excitationThreshold);
    const seeds = spectralComponentSeeds(seed);
    this.bands = seeds.squeal.map((value) => new SpectralBand(rate, value));
    this.wander = new SmoothRandom(seeds.wander);
    this.rolling = new SpectralRolling(
      rate,
      new SpectralBand(rate, seeds.road[0]),
      new SpectralBand(rate, seeds.road[1]),
      new SmoothRandom(seeds.roadTexture),
    );
    this.tone = 1 - Math.exp(-1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.outputHz) / rate);
    this.clock = rate;
  }
  update(value: SpectralObservation, current: TireParameters, surfaceIndex = 0): void {
    try {
      validateSpectralObservation(value, surfaceIndex);
      for (const key of ['squeal', 'pitch'] as const) {
        const number = current[key],
          range = TIRE_CONTROL_RANGES[key];
        if (!Number.isFinite(number) || number < range.minValue || number > range.maxValue)
          throw new RangeError(`invalid hybrid ${key}`);
      }
    } catch (error) {
      this.release();
      throw error;
    }
    for (const key of SPECTRAL_INPUT_KEYS) this.observation[key] = value[key];
    this.material.setSurface(surfaceIndex);
    this.supported = value.load > 0;
    this.rolling.update(value);
    this.controller.update({ squeal: this.supported ? current.squeal : 0, pitch: current.pitch });
    if (!this.supported) this.release();
  }
  private release(): void {
    this.supported = false;
    this.rolling.cutExcitation();
    this.controller.update({ squeal: 0, pitch: this.controller.frequency });
  }
  private control(): void {
    if (!this.supported) return; // Freeze band pitch/width on loss of support; retain finite tails.
    const v = this.observation;
    this.material.follow(this.tone);
    this.rolling.control(v, this.material.value);
    const slip = Math.hypot(v.wheelSpeed - v.longitudinalVelocity, v.lateralVelocity);
    const targetWidth = spectralSquealBandwidth(slip, v.wheelSpeed);
    this.width += this.tone * (targetWidth - this.width);
    const wander = this.wander.step(1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.wanderSeconds));
    const frequency =
      (this.controller.frequency + HYBRID_SETTINGS.pitchOffsetHz) * (1 + SPECTRAL_SETTINGS.wanderDepth * wander);
    for (let i = 0; i < this.bands.length; i++) this.bands[i]!.configure((i + 1) * frequency, (i + 1) * this.width);
  }
  sample(): number {
    this.controller.advance();
    if (this.clock >= this.rate) {
      this.clock -= this.rate;
      this.control();
    }
    this.clock += SPECTRAL_SETTINGS.controlHz;
    const amplitude = this.controller.amplitude;
    const shape = Math.min(1, amplitude / HYBRID_SETTINGS.harmonicAmplitudeReference);
    let squeal = 0,
      harmonicShape = 1;
    for (let i = 0; i < this.bands.length; i++) {
      squeal += this.bands[i]!.sample(
        amplitude * HYBRID_SETTINGS.squealGain * SPECTRAL_SETTINGS.harmonicWeights[i]! * harmonicShape,
      );
      harmonicShape *= shape;
    }
    const hp = squeal - this.previous + this.dcPole * this.highpass;
    this.previous = squeal;
    this.highpass = hp;
    this.squealOutput += this.outputFollow * (hp - this.squealOutput);
    this.roadOutput = this.rolling.sample(this.supported, this.material.value);
    return this.roadOutput + this.squealOutput;
  }
}
