import {
  SPECTRAL_INPUTS,
  SPECTRAL_BAND_DOMAIN,
  SPECTRAL_INPUT_KEYS,
  SPECTRAL_SETTINGS,
  SPECTRAL_TEXTURES,
  type SpectralObservation,
} from './tire-spectral-acoustics.js';

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
  private readonly material = { ...SPECTRAL_TEXTURES[0]! };
  private targetMaterial = SPECTRAL_TEXTURES[0]!;
  private rollingLevel = 0;
  private targetRollingLevel = 0;
  private wheelFrequency = 0;
  private roadModulation = 1;
  roadOutput = 0;
  private readonly attack: number;
  private readonly release: number;
  private readonly tone: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private readonly roadFollow: number;
  private roadFiltered = 0;
  private readonly previous = new Float64Array(3);
  private readonly highpass = new Float64Array(3);
  private readonly lowpass = new Float64Array(3);
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
    // Keep the established S/Q random streams independent of rolling and output solo controls.
    this.bands.push(new SpectralBand(rate, nextSeed()), new SpectralBand(rate, nextSeed()));
    this.roadTexture = new SmoothRandom(nextSeed());
    this.attack = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.attackSeconds));
    this.release = 1 - Math.exp(-1 / (rate * SPECTRAL_SETTINGS.releaseSeconds));
    this.tone = 1 - Math.exp(-1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.outputHz) / rate);
    this.roadFollow = 1 - Math.exp((-2 * Math.PI * SPECTRAL_SETTINGS.roadOutputHz) / rate);
    this.clock = rate; // First sample configures; subsequent ticks use this stream's rational clock.
  }
  update(value: SpectralObservation, surfaceIndex = 0): void {
    if (!Number.isInteger(surfaceIndex) || surfaceIndex < 0 || surfaceIndex >= SPECTRAL_TEXTURES.length) {
      this.cutExcitation();
      throw new RangeError('invalid spectral surface');
    }
    for (const key of SPECTRAL_INPUT_KEYS) {
      const range = SPECTRAL_INPUTS[key];
      const number = value[key];
      if (!Number.isFinite(number) || number < range.min || number > range.max) {
        this.cutExcitation();
        throw new RangeError(`invalid spectral observation: ${key}`);
      }
    }
    for (const key of SPECTRAL_INPUT_KEYS) this.observation[key] = value[key]; // Copy values, never retain the caller.
    this.targetMaterial = SPECTRAL_TEXTURES[surfaceIndex]!;
    this.supported = value.load > 0;
    const level = Math.sqrt(saturate(value.load, SPECTRAL_SETTINGS.loadScaleNewtons));
    // R is rotation-driven. A locked translating tire has S (sliding), not rolling excitation.
    const rotating = value.wheelAngularSpeed !== 0;
    this.targetRollingLevel = rotating
      ? level *
        saturate(Math.abs(value.wheelSpeed), SPECTRAL_SETTINGS.roadHalfSpeed) ** SPECTRAL_SETTINGS.roadSpeedExponent
      : 0;
    const s = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = s > 0 ? value.longitudinalPower + value.lateralPower : 0;
    this.targetWorkLevel = Math.sqrt(saturate(power, SPECTRAL_SETTINGS.powerScaleWatts));
    this.targetSqueal = value.demand ** 2 / (1 + value.demand ** 2);
    if (!this.supported) this.cutExcitation();
  }
  private cutExcitation(): void {
    this.supported = false;
    this.workLevel = this.squeal = this.rollingLevel = 0; // Preserve resonator/filter tails.
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
    const targetWidth =
      SPECTRAL_SETTINGS.squealBaseBandwidthHz +
      SPECTRAL_SETTINGS.squealSlipBandwidthHz * saturate(slip, SPECTRAL_SETTINGS.squealBandwidthSlipHalfSpeed) +
      SPECTRAL_SETTINGS.squealWheelBandwidthHz *
        saturate(Math.abs(v.wheelSpeed), SPECTRAL_SETTINGS.squealBandwidthWheelHalfSpeed);
    this.frequency += this.tone * (targetFrequency - this.frequency);
    this.width += this.tone * (targetWidth - this.width);
    this.slip += this.tone * (slip - this.slip);
    const wander = this.wander.step(1 / (SPECTRAL_SETTINGS.controlHz * SPECTRAL_SETTINGS.wanderSeconds));
    const material = this.material,
      target = this.targetMaterial;
    material.roadLow += this.tone * (target.roadLow - material.roadLow);
    material.roadHigh += this.tone * (target.roadHigh - material.roadHigh);
    material.scrubLow += this.tone * (target.scrubLow - material.scrubLow);
    material.scrubHigh += this.tone * (target.scrubHigh - material.scrubHigh);
    material.squeal += this.tone * (target.squeal - material.squeal);
    material.scaleMeters += this.tone * (target.scaleMeters - material.scaleMeters);
    material.depth += this.tone * (target.depth - material.depth);
    const textureHz =
      (SPECTRAL_SETTINGS.scrubTextureMaximumHz * this.slip) /
      (this.slip + SPECTRAL_SETTINGS.scrubTextureMaximumHz * material.scaleMeters);
    this.modulation = 1 + material.depth * this.texture.step(textureHz / SPECTRAL_SETTINGS.controlHz);
    this.wheelFrequency += this.tone * (Math.abs(v.wheelAngularSpeed) / (2 * Math.PI) - this.wheelFrequency);
    // Random amplitude texture traverses wheel angle, not an independent time/vehicle-speed clock.
    const roadHz = (SPECTRAL_SETTINGS.roadTextureOrders * this.wheelFrequency) / material.scaleMeters;
    this.roadModulation =
      1 +
      Math.max(material.depth, SPECTRAL_SETTINGS.roadTextureDepth) *
        this.roadTexture.step(v.wheelAngularSpeed === 0 ? 0 : roadHz / SPECTRAL_SETTINGS.controlHz);
    for (let i = 0; i < 2; i++) {
      const order = i === 0 ? SPECTRAL_SETTINGS.roadLowOrder : SPECTRAL_SETTINGS.roadHighOrder;
      const frequency = Math.max(SPECTRAL_SETTINGS.roadMinimumHz, order * this.wheelFrequency);
      this.bands[i + 6]!.configure(
        frequency,
        Math.max(SPECTRAL_BAND_DOMAIN.minimumBandwidthHz, frequency * SPECTRAL_SETTINGS.roadBandwidthRatio),
      );
    }
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
    const follow = tap === 2 ? this.roadFollow : this.outputFollow;
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
      this.rollingLevel +=
        (this.targetRollingLevel > this.rollingLevel ? this.attack : this.release) *
        (this.targetRollingLevel - this.rollingLevel);
    }
    let scrub = 0,
      squeal = 0;
    for (let i = 0; i < 2; i++)
      scrub += this.bands[i]!.sample(
        this.workLevel *
          SPECTRAL_SETTINGS.scrubGain *
          (i === 0 ? this.material.scrubLow : this.material.scrubHigh) *
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
          this.material.squeal *
          harmonicShape,
      );
      harmonicShape *= shape;
    }
    this.scrubOutput = this.condition(scrub, 0);
    this.squealOutput = this.condition(squeal, 1);
    const road =
      this.bands[6]!.sample(
        this.rollingLevel * SPECTRAL_SETTINGS.roadGain * this.material.roadLow * this.roadModulation,
      ) +
      this.bands[7]!.sample(
        this.rollingLevel * SPECTRAL_SETTINGS.roadGain * this.material.roadHigh * this.roadModulation,
      );
    this.roadFiltered += this.roadFollow * (this.condition(road, 2) - this.roadFiltered);
    this.roadOutput = this.roadFiltered;
    return this.scrubOutput + this.squealOutput + this.roadOutput;
  }
}
