import { RandomStream, SPECTRAL_BAND_DOMAIN } from './spectral-noise.js';

// Numerical transport limits, not acoustic thresholds.
const MAXIMUM_FEEDBACK = 6;
const MAXIMUM_NOISE_RMS = 1;

/**
 * Noisy Hopf resonator: dz = [d*(feedback-1-saturation*|z|²)+i*w]*z*dt
 *                         + sqrt(2*d)*noiseRms*dW.
 * x/y ARE the sound state; no independent amplitude envelope. d=pi*bandwidth.
 * Normalized coordinates, not metres, joules or a solved rubber contact.
 */
export class StochasticResonator {
  private x = 0;
  private y = 0;
  private cosine = 1;
  private sine = 0;
  private growth = 0;
  private passive = 0;
  private injection = 0;
  private cubicStep = 0;
  private readonly random: RandomStream;

  constructor(
    private readonly rate: number,
    private readonly saturation: number,
    seed: number,
  ) {
    if (!Number.isInteger(rate) || rate < SPECTRAL_BAND_DOMAIN.minRate || rate > SPECTRAL_BAND_DOMAIN.maxRate)
      throw new RangeError('unsupported resonator rate');
    if (!Number.isFinite(saturation) || saturation <= 0) throw new RangeError('invalid resonator saturation');
    this.random = new RandomStream(seed);
  }

  configure(frequency: number, bandwidth: number, feedback: number, noiseRms: number): void {
    if (
      !Number.isFinite(frequency) ||
      frequency <= 0 ||
      frequency >= this.rate * SPECTRAL_BAND_DOMAIN.maximumFrequencyRateFraction ||
      !Number.isFinite(bandwidth) ||
      bandwidth < SPECTRAL_BAND_DOMAIN.minimumBandwidthHz ||
      bandwidth > SPECTRAL_BAND_DOMAIN.maximumBandwidthHz ||
      !Number.isFinite(feedback) ||
      feedback < 0 ||
      feedback > MAXIMUM_FEEDBACK ||
      !Number.isFinite(noiseRms) ||
      noiseRms < 0 ||
      noiseRms > MAXIMUM_NOISE_RMS
    )
      throw new RangeError('invalid stochastic resonator controls');
    const damping = Math.PI * bandwidth;
    const sigma = damping * (feedback - 1);
    this.growth = Math.exp(sigma / this.rate);
    this.passive = Math.exp(-damping / this.rate);
    const angle = (2 * Math.PI * frequency) / this.rate;
    this.cosine = Math.cos(angle);
    this.sine = Math.sin(angle);
    // Exact linear-noise covariance; uniform innovations match its first two moments,
    // not a Gaussian process. Analytic normalization, never measured-output AGC.
    const varianceTime = sigma === 0 ? 2 / this.rate : Math.expm1((2 * sigma) / this.rate) / sigma;
    this.injection = noiseRms * Math.sqrt(3 * damping * varianceTime);
    this.cubicStep = (2 * damping * this.saturation) / this.rate;
  }

  /** Cut new work immediately while retaining vibration, pitch, noise stream and passive decay. */
  release(): void {
    this.growth = this.passive;
    this.injection = 0;
  }

  get squaredNorm(): number {
    return this.x * this.x + this.y * this.y;
  }

  sample(): number {
    // Exact linear rotation/growth plus stochastic forcing, then exact cubic dissipation.
    // First-order splitting of the full system, not an exact stochastic solution.
    const x = this.growth * (this.cosine * this.x - this.sine * this.y) + this.injection * this.random.sample();
    const y = this.growth * (this.sine * this.x + this.cosine * this.y) + this.injection * this.random.sample();
    const shrink = 1 / Math.sqrt(1 + this.cubicStep * (x * x + y * y));
    this.x = x * shrink;
    this.y = y * shrink;
    return this.x;
  }
}
