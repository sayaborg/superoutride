/** Numerical support, not listening controls; expanding it needs domain/aliasing validation. */
export const SPECTRAL_BAND_DOMAIN = Object.freeze({
  minRate: 44100,
  maxRate: 192000,
  minimumBandwidthHz: 50,
  maximumBandwidthHz: 6000,
  maximumFrequencyRateFraction: 0.4,
});

/** Bounded, reproducible stream. Separate seed/state per band and modulation source. */
class RandomStream {
  constructor(private state: number) {
    if (!Number.isInteger(state) || state < 1 || state > 0xffffffff) throw new RangeError('invalid spectral seed');
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
export class SpectralBand {
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
    if (!Number.isInteger(rate) || rate < SPECTRAL_BAND_DOMAIN.minRate || rate > SPECTRAL_BAND_DOMAIN.maxRate)
      throw new RangeError('unsupported spectral rate');
    this.random = new RandomStream(seed);
    this.configure(1000, SPECTRAL_BAND_DOMAIN.minimumBandwidthHz);
  }
  configure(frequency: number, bandwidth: number): void {
    if (
      !Number.isFinite(frequency) ||
      frequency <= 0 ||
      frequency >= SPECTRAL_BAND_DOMAIN.maximumFrequencyRateFraction * this.rate ||
      !Number.isFinite(bandwidth) ||
      bandwidth < SPECTRAL_BAND_DOMAIN.minimumBandwidthHz ||
      bandwidth > SPECTRAL_BAND_DOMAIN.maximumBandwidthHz
    )
      throw new RangeError('invalid spectral band');
    const r = Math.exp((-Math.PI * bandwidth) / this.rate);
    const angle = (2 * Math.PI * frequency) / this.rate;
    this.cosine = r * Math.cos(angle);
    this.sine = r * Math.sin(angle);
    // Uniform [-1,1] has variance 1/3. This is analytic source scaling, never measured-output AGC.
    this.injection = Math.sqrt(3 * (1 - r * r));
  }
  get squaredNorm(): number {
    return this.x * this.x + this.y * this.y;
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

function spectralSeedSequence(seed: number): () => number {
  const seeds = new RandomStream(seed);
  // Consecutive xorshift states are adjacent positions in the SAME stream. Permute them
  // before seeding bands so their per-sample draws are not shared at short fixed lags.
  // Xor shifts and odd multipliers form a bijection fixing zero; nonzero seeds remain nonzero.
  return (): number => {
    let value = Math.floor((seeds.sample() + 1) * 2147483648);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  };
}

/** Stable component seed identities shared across compositions; no unused bands need to run. */
export function spectralComponentSeeds(seed: number) {
  const next = spectralSeedSequence(seed);
  return {
    scrub: [next(), next()] as const,
    squeal: [next(), next(), next(), next()] as const,
    wander: next(),
    scrubTexture: next(),
    road: [next(), next()] as const,
    roadTexture: next(),
  };
}
