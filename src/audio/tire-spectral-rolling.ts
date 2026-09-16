import { SPECTRAL_SETTINGS, SPECTRAL_BAND_DOMAIN, type SpectralObservation } from './tire-spectral-acoustics.js';
import { SpectralBand, SmoothRandom, type SpectralMaterial } from './tire-spectral-primitives.js';

/** Two rotation-driven bands shared by SPECTRAL and HYBRID. No scrub or squeal work. */
export class SpectralRolling {
  private level = 0;
  private targetLevel = 0;
  private wheelFrequency = 0;
  private modulation = 1;
  private previous = 0;
  private highpass = 0;
  private lowpass = 0;
  private filtered = 0;
  private readonly attack: number;
  private readonly release: number;
  private readonly tone: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  constructor(
    rate: number,
    private readonly low: SpectralBand,
    private readonly high: SpectralBand,
    private readonly texture: SmoothRandom,
  ) {
    this.attack = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.attackSeconds));
    this.release = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.releaseSeconds));
    this.tone = 1 - Math.exp(-1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.roadOutputHz) / rate);
  }
  update(value: SpectralObservation): void {
    const level = Math.sqrt(value.load / (value.load + SPECTRAL_SETTINGS.loadScaleNewtons));
    const speed = Math.abs(value.wheelSpeed);
    this.targetLevel =
      value.wheelAngularSpeed !== 0
        ? level * (speed / (speed + SPECTRAL_SETTINGS.roadHalfSpeed)) ** SPECTRAL_SETTINGS.roadSpeedExponent
        : 0;
  }
  cutExcitation(): void {
    this.level = 0;
  }
  control(value: SpectralObservation, material: SpectralMaterial['value']): void {
    this.wheelFrequency += this.tone * (Math.abs(value.wheelAngularSpeed) / (2 * Math.PI) - this.wheelFrequency);
    const roadHz = (SPECTRAL_SETTINGS.roadTextureOrders * this.wheelFrequency) / material.scaleMeters;
    this.modulation =
      1 +
      Math.max(material.depth, SPECTRAL_SETTINGS.roadTextureDepth) *
        this.texture.step(value.wheelAngularSpeed === 0 ? 0 : roadHz / SPECTRAL_SETTINGS.controlHz);
    this.configure(this.low, SPECTRAL_SETTINGS.roadLowOrder);
    this.configure(this.high, SPECTRAL_SETTINGS.roadHighOrder);
  }
  private configure(band: SpectralBand, order: number): void {
    const frequency = Math.max(SPECTRAL_SETTINGS.roadMinimumHz, order * this.wheelFrequency);
    band.configure(
      frequency,
      Math.max(SPECTRAL_BAND_DOMAIN.minimumBandwidthHz, frequency * SPECTRAL_SETTINGS.roadBandwidthRatio),
    );
  }
  sample(supported: boolean, material: SpectralMaterial['value']): number {
    if (supported)
      this.level += (this.targetLevel > this.level ? this.attack : this.release) * (this.targetLevel - this.level);
    const road =
      this.low.sample(this.level * SPECTRAL_SETTINGS.roadGain * material.roadLow * this.modulation) +
      this.high.sample(this.level * SPECTRAL_SETTINGS.roadGain * material.roadHigh * this.modulation);
    const hp = road - this.previous + this.dcPole * this.highpass;
    this.previous = road;
    this.highpass = hp;
    this.lowpass = this.lowpass + this.outputFollow * (hp - this.lowpass);
    this.filtered += this.outputFollow * (this.lowpass - this.filtered);
    return this.filtered;
  }
}
