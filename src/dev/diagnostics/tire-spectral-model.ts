/** Isolated SPECTRAL trial: one asphalt contact, scrub + squeal only. Authority: docs/audio.md. */
export const SPECTRAL_INPUTS = Object.freeze({
  longitudinalVelocity: Object.freeze({ min: -100, max: 100, step: 1, value: 25, label: 'Contact longitudinal (m/s)' }),
  lateralVelocity: Object.freeze({ min: -100, max: 100, step: 0.1, value: 4, label: 'Contact lateral (m/s)' }),
  wheelSpeed: Object.freeze({ min: -200, max: 200, step: 1, value: 25, label: 'Wheel peripheral speed (m/s)' }),
  load: Object.freeze({ min: 0, max: 30000, step: 100, value: 4000, label: 'Accepted normal load (N)' }),
  longitudinalPower: Object.freeze({ min: 0, max: 1000000, step: 100, value: 0, label: 'Longitudinal slip work (W)' }),
  lateralPower: Object.freeze({ min: 0, max: 1000000, step: 100, value: 12000, label: 'Lateral slip work (W)' }),
  demand: Object.freeze({ min: 0, max: 50, step: 0.05, value: 1.5, label: 'Demand rho (not grip remaining)' }),
});
export type SpectralObservation = { readonly [K in keyof typeof SPECTRAL_INPUTS]: number };
const inputKeys = Object.keys(SPECTRAL_INPUTS) as (keyof SpectralObservation)[];
export const SPECTRAL_SETTINGS = Object.freeze({
  minRate: 44100,
  maxRate: 192000,
  controlHz: 1000,
  seed: 0x3547ab91,
  attackSeconds: 0.015,
  releaseSeconds: 0.01,
  toneSeconds: 0.02,
  wanderSeconds: 0.15,
  wanderDepth: 0.015,
  scrubDepth: 0.08,
  scrubScaleMeters: 0.3,
  powerScaleWatts: 8000,
  directionScaleWatts: 100,
  scrubGain: 0.04,
  squealGain: 0.06,
  scrubWeights: Object.freeze([0.35, 0.65]),
  harmonicWeights: Object.freeze([0.65, 1, 0.6, 0.28]),
  dcHz: 18,
  outputHz: 8000,
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
    if (!Number.isInteger(rate) || rate < SPECTRAL_SETTINGS.minRate || rate > SPECTRAL_SETTINGS.maxRate)
      throw new RangeError('unsupported spectral rate');
    this.random = new RandomStream(seed);
    this.configure(1000, 50);
  }
  configure(frequency: number, bandwidth: number): void {
    if (
      !Number.isFinite(frequency) ||
      frequency <= 0 ||
      frequency >= 0.4 * this.rate ||
      !Number.isFinite(bandwidth) ||
      bandwidth < 50 ||
      bandwidth > 6000
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
class SmoothRandom {
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

const saturate = (x: number, half: number): number => x / (x + half);
const silentObservation = () => ({
  longitudinalVelocity: 0,
  lateralVelocity: 0,
  wheelSpeed: 0,
  load: 0,
  longitudinalPower: 0,
  lateralPower: 0,
  demand: 0,
});

/** Six fixed bands, one contact. No road layer, surface catalog, physical solve or game registration. */
export class TireSpectralSynthesis {
  private readonly bands: SpectralBand[];
  private readonly wander: SmoothRandom;
  private readonly texture: SmoothRandom;
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
  private frequency = 1100;
  private width = 50;
  private slip = 0;
  private modulation = 1;
  scrubOutput = 0;
  squealOutput = 0;
  constructor(
    private readonly rate: number,
    seed: number = SPECTRAL_SETTINGS.seed,
  ) {
    const seeds = new RandomStream(seed);
    // Consecutive xorshift states are adjacent positions in the SAME stream. Permute them
    // before seeding bands so their per-sample draws are not shared at short fixed lags.
    // Xor shifts and odd multipliers form a bijection fixing zero; nonzero seeds remain nonzero.
    const nextSeed = (): number => {
      let value = Math.floor((seeds.sample() + 1) * 2147483648);
      value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
      value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
      return (value ^ (value >>> 16)) >>> 0;
    };
    this.bands = Array.from({ length: 6 }, () => new SpectralBand(rate, nextSeed()));
    this.wander = new SmoothRandom(nextSeed());
    this.texture = new SmoothRandom(nextSeed());
    this.attack = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.attackSeconds));
    this.release = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.releaseSeconds));
    this.tone = 1 - Math.exp(-1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.outputHz) / rate);
    this.clock = rate; // First sample configures; subsequent ticks use this stream's rational clock.
  }
  update(value: SpectralObservation): void {
    for (const key of inputKeys) {
      const range = SPECTRAL_INPUTS[key];
      const number = value[key];
      if (!Number.isFinite(number) || number < range.min || number > range.max) {
        this.supported = false;
        this.workLevel = this.squeal = 0;
        throw new RangeError(`invalid spectral observation: ${key}`);
      }
    }
    for (const key of inputKeys) this.observation[key] = value[key]; // Copy values, never retain the caller.
    this.supported = value.load > 0;
    const s = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = s > 0 ? value.longitudinalPower + value.lateralPower : 0;
    this.targetWorkLevel = Math.sqrt(saturate(power, SPECTRAL_SETTINGS.powerScaleWatts));
    this.targetSqueal = value.demand ** 2 / (1 + value.demand ** 2);
    if (!this.supported) this.workLevel = this.squeal = 0; // Cut excitation, never reset resonator state.
  }
  private control(): void {
    if (!this.supported) return; // Freeze pitch/width on release; do not turn a tail into a down-chirp.
    const v = this.observation;
    const slip = Math.hypot(v.wheelSpeed - v.longitudinalVelocity, v.lateralVelocity);
    const power = v.longitudinalPower + v.lateralPower;
    const direction = v.longitudinalPower / (power + SPECTRAL_SETTINGS.directionScaleWatts);
    const targetFrequency = 1100 + 300 * saturate(slip, 6) + 120 * direction;
    const targetWidth = 50 + 20 * saturate(slip, 8) + 35 * saturate(Math.abs(v.wheelSpeed), 30);
    this.frequency += this.tone * (targetFrequency - this.frequency);
    this.width += this.tone * (targetWidth - this.width);
    this.slip += this.tone * (slip - this.slip);
    const wander = this.wander.step(1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.wanderSeconds));
    const textureHz = (160 * this.slip) / (this.slip + 160 * SPECTRAL_SETTINGS.scrubScaleMeters);
    this.modulation = 1 + SPECTRAL_SETTINGS.scrubDepth * this.texture.step(textureHz / SPECTRAL_SETTINGS.controlHz);
    this.bands[0]!.configure(700 + 300 * saturate(this.slip, 6), 900);
    this.bands[1]!.configure(2600 + 1000 * saturate(this.slip, 10), 2000);
    for (let h = 1; h <= 4; h++)
      this.bands[h + 1]!.configure(h * this.frequency * (1 + SPECTRAL_SETTINGS.wanderDepth * wander), h * this.width);
  }
  private condition(value: number, tap: number): number {
    const hp = value - this.previous[tap]! + this.dcPole * this.highpass[tap]!;
    this.previous[tap] = value;
    this.highpass[tap] = hp;
    this.lowpass[tap] = this.lowpass[tap]! + this.outputFollow * (hp - this.lowpass[tap]!);
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
        this.workLevel * SPECTRAL_SETTINGS.scrubGain * SPECTRAL_SETTINGS.scrubWeights[i]! * this.modulation,
      );
    for (let i = 0; i < 4; i++)
      squeal += this.bands[i + 2]!.sample(
        this.workLevel * this.squeal * SPECTRAL_SETTINGS.squealGain * SPECTRAL_SETTINGS.harmonicWeights[i]!,
      );
    this.scrubOutput = this.condition(scrub, 0);
    this.squealOutput = this.condition(squeal, 1);
    return this.scrubOutput + this.squealOutput;
  }
}
