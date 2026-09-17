import { StochasticResonator } from './stochastic-resonator.js';
import { SmoothRandom, spectralComponentSeeds } from './spectral-noise.js';
import { MODAL_SETTINGS as S, MODAL_SURFACES, resolveModalTuning, type ModalTuning } from './tire-modal-acoustics.js';
import {
  TIRE_SOUND_SURFACES,
  validateTireSoundObservation,
  type TireSoundObservation,
} from './tire-sound-observation.js';

const saturate = (value: number, half: number): number => value / (value + half);

/** Four stochastic self-exciting bands, ONE Q output. No R, S or separate amplitude state. */
export class TireModalSynthesis {
  private readonly bands: StochasticResonator[];
  private readonly wander: SmoothRandom;
  private readonly settings: ModalTuning;
  private readonly attack: number;
  private readonly releaseFollow: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private active = false;
  private targetNoise = 0;
  private targetFeedback = 0;
  private targetPitch: number;
  private targetWidth: number;
  private noise = 0;
  private feedback = 0;
  private pitch: number;
  private width: number;
  private clock: number;
  private previous = 0;
  private highpass = 0;
  private filtered = 0;
  frictionOutput = 0;

  constructor(
    private readonly rate: number,
    seed: number = S.frontSeed,
    tuning: Partial<ModalTuning> = {},
  ) {
    this.settings = resolveModalTuning(tuning);
    const seeds = spectralComponentSeeds(seed);
    this.bands = seeds.squeal.map((value) => new StochasticResonator(rate, this.settings.saturation, value));
    this.wander = new SmoothRandom(seeds.wander);
    this.pitch = this.targetPitch = this.settings.pitchBaseHz;
    this.width = this.targetWidth = this.settings.bandwidthHz;
    this.attack = 1 - Math.exp(-1 / (S.controlHz * S.attackSeconds));
    this.releaseFollow = 1 - Math.exp(-1 / (S.controlHz * S.releaseSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * S.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * S.outputCutoffHz) / rate);
    this.clock = rate;
    this.configureBands(this.pitch);
  }

  get vibrationNorm(): number {
    return this.bands.reduce((sum, band) => sum + band.squaredNorm, 0);
  }

  update(value: TireSoundObservation, surfaceIndex = 0): void {
    try {
      validateTireSoundObservation(value, surfaceIndex);
    } catch (error) {
      this.release();
      throw error;
    }
    const slip = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = value.longitudinalPower + value.lateralPower;
    if (value.load === 0 || slip === 0 || power === 0) {
      this.release();
      return;
    }
    this.active = true;
    const settings = this.settings;
    const material = MODAL_SURFACES[TIRE_SOUND_SURFACES[surfaceIndex]!];
    // Work fraction is linear near zero: no low-speed boost, acoustic-watt claim or second load factor.
    const work = saturate(power, settings.powerReferenceWatts);
    this.targetNoise = settings.noiseRms * material.roughness * work;
    this.targetFeedback =
      (settings.feedbackMaximum * material.susceptibility * work * saturate(slip, settings.slipHalfMps)) /
      (1 + (slip / settings.slipRolloffMps) ** 2);
    // Explicitly authored HYBRID pitch control, NOT a predicted tire eigenfrequency.
    this.targetPitch =
      settings.pitchBaseHz +
      S.pitchSlipHz * saturate(slip, S.pitchSlipHalfMps) +
      (S.pitchLongitudinalHz * value.longitudinalPower) / power;
    this.targetWidth =
      settings.bandwidthHz +
      S.slipBandwidthHz * saturate(slip, S.slipBandwidthHalfMps) +
      S.wheelBandwidthHz * saturate(Math.abs(value.wheelSpeed), S.wheelBandwidthHalfMps);
  }

  private release(): void {
    this.active = false;
    this.noise = this.feedback = this.targetNoise = this.targetFeedback = 0;
    for (const band of this.bands) band.release();
  }

  private configureBands(center: number): void {
    for (let i = 0; i < this.bands.length; i++)
      this.bands[i]!.configure((i + 1) * center, (i + 1) * this.width, this.feedback, this.noise);
  }

  private control(): void {
    if (!this.active) return; // Freeze color on passive release; no synthetic down-chirp.
    this.noise += (this.targetNoise > this.noise ? this.attack : this.releaseFollow) * (this.targetNoise - this.noise);
    this.feedback +=
      (this.targetFeedback > this.feedback ? this.attack : this.releaseFollow) * (this.targetFeedback - this.feedback);
    this.pitch += this.attack * (this.targetPitch - this.pitch);
    this.width += this.attack * (this.targetWidth - this.width);
    this.configureBands(
      this.pitch * (1 + this.settings.wanderDepth * this.wander.step(1 / (S.controlHz * S.wanderSeconds))),
    );
  }

  sample(): number {
    if (this.clock >= this.rate) {
      this.clock -= this.rate;
      this.control();
    }
    this.clock += S.controlHz;
    let value = 0;
    for (let i = 0; i < this.bands.length; i++) value += S.harmonicWeights[i]! * this.bands[i]!.sample();
    value *= this.settings.outputGain;
    this.highpass = value - this.previous + this.dcPole * this.highpass;
    this.previous = value;
    this.filtered += this.outputFollow * (this.highpass - this.filtered);
    this.frictionOutput = this.filtered;
    return this.frictionOutput;
  }
}
