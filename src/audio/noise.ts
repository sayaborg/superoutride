/** Numerical support, not listening controls; expanding it needs domain/aliasing validation. */
export const NOISE_BAND_DOMAIN = Object.freeze({
  minRate: 44100,
  maxRate: 192000,
  minimumBandwidthHz: 50,
  maximumBandwidthHz: 6000,
  maximumFrequencyRateFraction: 0.4,
});

/** Bounded, reproducible stream. Separate seed/state per band and modulation generator. */
export class RandomStream {
  constructor(private state: number) {
    if (!Number.isInteger(state) || state < 1 || state > 0xffffffff) throw new RangeError('invalid noise seed');
    this.state |= 0;
  }
  sample(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return ((this.state >>> 0) + 0.5) / 2147483648 - 1;
  }
}

/** Isotropic AR(1) rotation; B is nominal pole bandwidth, not exact wide-band FWHM. */
export class NoiseBand {
  private x = 0;
  private y = 0;
  private cosine = 0;
  private sine = 0;
  private injection = 0;
  private readonly random: RandomStream;
  constructor(
    private readonly rate: number,
    seed: number,
  ) {
    if (!Number.isInteger(rate) || rate < NOISE_BAND_DOMAIN.minRate || rate > NOISE_BAND_DOMAIN.maxRate)
      throw new RangeError('unsupported noise rate');
    this.random = new RandomStream(seed);
    this.configure(1000, NOISE_BAND_DOMAIN.minimumBandwidthHz);
  }
  configure(frequency: number, bandwidth: number): void {
    if (
      !Number.isFinite(frequency) ||
      frequency <= 0 ||
      frequency >= NOISE_BAND_DOMAIN.maximumFrequencyRateFraction * this.rate ||
      !Number.isFinite(bandwidth) ||
      bandwidth < NOISE_BAND_DOMAIN.minimumBandwidthHz ||
      bandwidth > NOISE_BAND_DOMAIN.maximumBandwidthHz
    )
      throw new RangeError('invalid noise band');
    const r = Math.exp((-Math.PI * bandwidth) / this.rate);
    const angle = (2 * Math.PI * frequency) / this.rate;
    this.cosine = r * Math.cos(angle);
    this.sine = r * Math.sin(angle);
    // Uniform [-1,1] has variance 1/3. This is analytic excitation scaling, never measured-output AGC.
    this.injection = Math.sqrt(3 * (1 - r * r));
  }
  sample(amplitude: number): number {
    if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > 1) throw new RangeError('invalid band excitation');
    const strength = amplitude * this.injection;
    const x = this.cosine * this.x - this.sine * this.y + strength * this.random.sample();
    this.y = this.sine * this.x + this.cosine * this.y + strength * this.random.sample();
    this.x = x;
    return x;
  }
}

/** C1 random interpolation at bounded modulation rates, not contact events or a squeal clock. */
export class SmoothRandom {
  private phase = 0;
  private left: number;
  private right: number;
  private readonly random: RandomStream;
  constructor(seed: number) {
    this.random = new RandomStream(seed);
    this.left = this.random.sample();
    this.right = this.random.sample();
  }
  step(cycles: number): number {
    this.phase += cycles;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.left = this.right;
      this.right = this.random.sample();
    }
    const p = this.phase;
    return this.left + (this.right - this.left) * p * p * (3 - 2 * p);
  }
}

/** Derive a reproducible independent stream from an authored nonnegative stream ID. */
export function deriveNoiseSeed(seed: number, stream: number): number {
  if (!Number.isSafeInteger(stream) || stream < 0) throw new RangeError('invalid noise stream ID');
  const seeds = new RandomStream(seed);
  let value = 0;
  for (let i = 0; i <= stream; i++) value = Math.floor((seeds.sample() + 1) * 2147483648);
  // Permute adjacent xorshift states before using them as separate per-sample streams.
  // The bijection fixes zero, so nonzero seeds stay nonzero.
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
