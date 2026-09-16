import {
  TIRE_SOUND_INPUT_KEYS,
  validateTireSoundObservation,
  type TireSoundObservation,
} from './tire-sound-observation.js';
import { SPECTRAL_SETTINGS } from './tire-spectral-acoustics.js';

import { SpectralBand, SmoothRandom, spectralComponentSeeds } from './spectral-noise.js';
import { spectralSquealBandwidth, SpectralMaterial } from './tire-spectral-primitives.js';
import { SpectralRolling } from './tire-spectral-rolling.js';

const saturate = (x: number, half: number): number => x / (x + half);
const silentObservation = () => ({
  longitudinalVelocity: 0,
  lateralVelocity: 0,
  wheelSpeed: 0,
  wheelAngularSpeed: 0,
  load: 0,
  longitudinalPower: 0,
  lateralPower: 0,
  demand: 0,
});

/** Eight fixed bands per contact. Read-only observations; no physical solve or model/vehicle branches. */
export class TireSpectralSynthesis {
  private readonly bands: SpectralBand[];
  private readonly wander: SmoothRandom;
  private readonly texture: SmoothRandom;
  private readonly roadTexture: SmoothRandom;
  private readonly textureMaterial = new SpectralMaterial();
  private readonly rolling: SpectralRolling;
  roadOutput = 0;
  private readonly attack: number;
  private readonly release: number;
  private readonly tone: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private readonly previous = new Float64Array(2);
  private readonly highpass = new Float64Array(2);
  private readonly lowpass = new Float64Array(2);
  private observation = silentObservation();
  private supported = false;
  private clock: number;
  private targetWorkLevel = 0;
  private targetSqueal = 0;
  private workLevel = 0;
  private squeal = 0;
  private frequency: number = SPECTRAL_SETTINGS.squealBaseHz;
  private width: number = SPECTRAL_SETTINGS.squealBaseBandwidthHz;
  private slip = 0;
  private modulation = 1;
  scrubOutput = 0;
  squealOutput = 0;
  constructor(
    private readonly rate: number,
    seed: number = SPECTRAL_SETTINGS.seed,
  ) {
    const seeds = spectralComponentSeeds(seed);
    this.bands = [...seeds.scrub, ...seeds.squeal, ...seeds.road].map((value) => new SpectralBand(rate, value));
    this.wander = new SmoothRandom(seeds.wander);
    this.texture = new SmoothRandom(seeds.scrubTexture);
    this.roadTexture = new SmoothRandom(seeds.roadTexture);
    this.rolling = new SpectralRolling(rate, this.bands[6]!, this.bands[7]!, this.roadTexture);
    this.attack = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.attackSeconds));
    this.release = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.releaseSeconds));
    this.tone = 1 - Math.exp(-1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.outputHz) / rate);
    this.clock = rate; // First sample configures; subsequent ticks use this stream's rational clock.
  }
  update(value: TireSoundObservation, surfaceIndex = 0): void {
    try {
      validateTireSoundObservation(value, surfaceIndex);
    } catch (error) {
      this.cutExcitation();
      throw error;
    }
    for (const key of TIRE_SOUND_INPUT_KEYS) this.observation[key] = value[key];
    this.textureMaterial.setSurface(surfaceIndex);
    this.supported = value.load > 0;
    this.rolling.update(value);
    const s = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = s > 0 ? value.longitudinalPower + value.lateralPower : 0;
    this.targetWorkLevel = Math.sqrt(saturate(power, SPECTRAL_SETTINGS.powerScaleWatts));
    this.targetSqueal = value.demand ** 2 / (1 + value.demand ** 2);
    if (!this.supported) this.cutExcitation();
  }
  private cutExcitation(): void {
    this.supported = false;
    this.workLevel = this.squeal = 0;
    this.rolling.cutExcitation(); // Preserve resonator/filter tails.
  }
  private control(): void {
    if (!this.supported) return; // Freeze pitch/width on release; do not turn a tail into a down-chirp.
    const v = this.observation;
    const slip = Math.hypot(v.wheelSpeed - v.longitudinalVelocity, v.lateralVelocity);
    const power = v.longitudinalPower + v.lateralPower;
    const direction = v.longitudinalPower / (power + SPECTRAL_SETTINGS.directionScaleWatts);
    const targetFrequency =
      SPECTRAL_SETTINGS.squealBaseHz +
      SPECTRAL_SETTINGS.squealSlipHz * saturate(slip, SPECTRAL_SETTINGS.squealSlipHalfSpeed) +
      SPECTRAL_SETTINGS.squealLongitudinalHz * direction;
    const targetWidth = spectralSquealBandwidth(slip, v.wheelSpeed);
    this.frequency += this.tone * (targetFrequency - this.frequency);
    this.width += this.tone * (targetWidth - this.width);
    this.slip += this.tone * (slip - this.slip);
    const wander = this.wander.step(1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.wanderSeconds));
    this.textureMaterial.follow(this.tone);
    const material = this.textureMaterial.value;
    const textureHz =
      (SPECTRAL_SETTINGS.scrubTextureMaximumHz * this.slip) /
      (this.slip + SPECTRAL_SETTINGS.scrubTextureMaximumHz * material.scaleMeters);
    this.modulation = 1 + material.depth * this.texture.step(textureHz / SPECTRAL_SETTINGS.controlHz);
    this.rolling.control(v, material);
    for (let i = 0; i < SPECTRAL_SETTINGS.scrubBands.length; i++) {
      const band = SPECTRAL_SETTINGS.scrubBands[i]!;
      this.bands[i]!.configure(band.baseHz + band.slipHz * saturate(this.slip, band.slipHalfSpeed), band.bandwidthHz);
    }
    for (let h = 1; h <= 4; h++)
      this.bands[h + 1]!.configure(h * this.frequency * (1 + SPECTRAL_SETTINGS.wanderDepth * wander), h * this.width);
  }
  private condition(value: number, tap: number): number {
    const hp = value - this.previous[tap]! + this.dcPole * this.highpass[tap]!;
    this.previous[tap] = value;
    this.highpass[tap] = hp;
    const follow = this.outputFollow;
    this.lowpass[tap] = this.lowpass[tap]! + follow * (hp - this.lowpass[tap]!);
    return this.lowpass[tap]!;
  }
  sample(): number {
    if (this.clock >= this.rate) {
      this.clock -= this.rate;
      this.control();
    }
    this.clock += SPECTRAL_SETTINGS.controlHz;
    if (this.supported) {
      this.workLevel +=
        (this.targetWorkLevel > this.workLevel ? this.attack : this.release) * (this.targetWorkLevel - this.workLevel);
      this.squeal += (this.targetSqueal > this.squeal ? this.attack : this.release) * (this.targetSqueal - this.squeal);
    }
    let scrub = 0,
      squeal = 0;
    for (let i = 0; i < 2; i++)
      scrub += this.bands[i]!.sample(
        this.workLevel *
          SPECTRAL_SETTINGS.scrubGain *
          (i === 0 ? this.textureMaterial.value.scrubLow : this.textureMaterial.value.scrubHigh) *
          this.modulation,
      );
    // Like amplitude-dependent harmonics, without replacing finite-width bands by a periodic tone.
    // At strong sustained excitation the accepted palette is unchanged. Recovery loses upper bands
    // faster than the fundamental, rather than turning down a fixed-spectrum recording.
    const shape = Math.min(1, (this.workLevel * this.squeal) / SPECTRAL_SETTINGS.harmonicShapeReference);
    let harmonicShape = 1;
    for (let i = 0; i < 4; i++) {
      squeal += this.bands[i + 2]!.sample(
        this.workLevel *
          this.squeal *
          SPECTRAL_SETTINGS.squealGain *
          SPECTRAL_SETTINGS.harmonicWeights[i]! *
          this.textureMaterial.value.squeal *
          harmonicShape,
      );
      harmonicShape *= shape;
    }
    this.scrubOutput = this.condition(scrub, 0);
    this.squealOutput = this.condition(squeal, 1);
    this.roadOutput = this.rolling.sample(this.supported, this.textureMaterial.value);
    return this.scrubOutput + this.squealOutput + this.roadOutput;
  }
}
