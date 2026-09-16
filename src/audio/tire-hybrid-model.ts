import { clamp } from '../core/math.js';
import { SpectralBand, SmoothRandom, spectralComponentSeeds } from './spectral-noise.js';
import { HYBRID_SETTINGS as S, HYBRID_SURFACES } from './tire-hybrid-acoustics.js';
import { TireRollingSynthesis } from './tire-rolling-model.js';
import { TIRE_SOUND_INPUT_KEYS, TIRE_SOUND_SURFACES, type TireSoundObservation } from './tire-sound-observation.js';

const smoothstep = (value: number, low: number, high: number): number => {
  const x = clamp((value - low) / (high - low), 0, 1);
  return x * x * (3 - 2 * x);
};
const saturate = (value: number, half: number): number => value / (value + half);
type Material = { -readonly [K in keyof (typeof HYBRID_SURFACES)['ASPHALT']]: number };
const MATERIAL_KEYS = Object.keys(HYBRID_SURFACES.ASPHALT) as (keyof Material)[];

/** One read-only axle: rotation-driven R, slip-work-driven S, and friction-fed surrogate Q. */
export class TireHybridSynthesis {
  private readonly rolling: TireRollingSynthesis;
  private readonly scrub: SpectralBand[];
  private readonly squeal: SpectralBand[];
  private readonly scrubTexture: SmoothRandom;
  private readonly wander: SmoothRandom;
  private readonly material: Material = { ...HYBRID_SURFACES.ASPHALT };
  private targetMaterial: Readonly<Material> = HYBRID_SURFACES.ASPHALT;
  private readonly attack: number;
  private readonly release: number;
  private readonly tone: number;
  private readonly dcPole: number;
  private readonly outputFollow: readonly number[];
  private readonly previous = new Float64Array(2);
  private readonly highpass = new Float64Array(2);
  private readonly filtered = new Float64Array(2);
  private readonly observation = {
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
  private sliding = false;
  private targetWork = 0;
  private targetDrive = 0;
  private targetPitch: number = S.pitchBaseHz;
  private work = 0;
  private drive = 0;
  private energy = 0;
  private pitch: number = S.pitchBaseHz;
  private slip = 0;
  private width: number = S.squealBaseBandwidthHz;
  private scrubModulation = 1;
  private clock: number;
  roadOutput = 0;
  scrubOutput = 0;
  squealOutput = 0;

  constructor(
    private readonly rate: number,
    seed: number = S.frontSeed,
  ) {
    const seeds = spectralComponentSeeds(seed);
    this.rolling = new TireRollingSynthesis(rate, seed);
    this.scrub = seeds.scrub.map((v) => new SpectralBand(rate, v));
    this.squeal = seeds.squeal.map((v) => new SpectralBand(rate, v));
    this.scrubTexture = new SmoothRandom(seeds.scrubTexture);
    this.wander = new SmoothRandom(seeds.wander);
    this.attack = 1 - Math.exp(-1 / (rate * S.attackSeconds));
    this.release = 1 - Math.exp(-1 / (rate * S.releaseSeconds));
    this.tone = 1 - Math.exp(-1 / (S.controlHz * S.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * S.dcHz) / rate);
    this.outputFollow = [S.scrubOutputHz, S.squealOutputHz].map((hz) => 1 - Math.exp((-2 * Math.PI * hz) / rate));
    this.clock = rate;
  }

  update(value: TireSoundObservation, surfaceIndex = 0): void {
    try {
      this.rolling.update(value, surfaceIndex);
    } catch (error) {
      this.releaseContact();
      throw error;
    }
    // Copy the snapshot: worklet and standalone callers reuse inputs. No audio-rate allocation.
    for (const key of TIRE_SOUND_INPUT_KEYS) this.observation[key] = value[key];
    this.targetMaterial = HYBRID_SURFACES[TIRE_SOUND_SURFACES[surfaceIndex]!];
    this.supported = value.load > 0;
    if (!this.supported) {
      this.releaseContact();
      return;
    }
    const slip = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = slip > 0 ? value.longitudinalPower + value.lateralPower : 0;
    this.sliding = power > 0;
    this.targetWork = Math.sqrt(saturate(power, S.powerReferenceWatts));
    this.targetDrive =
      (this.targetWork *
        smoothstep(value.demand, S.demandStart, S.demandFull) *
        smoothstep(slip, S.slipStartMps, S.slipFullMps)) /
      (1 + (slip / S.slipRolloffMps) ** 2);
    if (this.sliding) {
      this.targetPitch =
        S.pitchBaseHz +
        S.pitchSlipHz * saturate(slip, S.pitchSlipHalfMps) +
        S.pitchLongitudinalHz * (value.longitudinalPower / power);
    } else {
      this.work = this.drive = 0; // Stop friction excitation on grip recovery; preserve vibration tails.
    }
  }

  private releaseContact(): void {
    this.supported = this.sliding = false;
    this.work = this.drive = 0;
    this.targetWork = this.targetDrive = 0;
  }

  /** Speed/length is Hz. The saturation and authored length are sound-design choices. */
  private textureRate(speed: number): number {
    return S.textureMaximumHz * saturate(speed, S.textureMaximumHz * this.material.textureLengthMeters);
  }

  private control(): void {
    if (!this.supported) return;
    const v = this.observation;
    for (const key of MATERIAL_KEYS) this.material[key] += this.tone * (this.targetMaterial[key] - this.material[key]);
    if (!this.sliding) return; // Freeze S/Q color on passive release; no artificial down-chirp.
    const slip = Math.hypot(v.wheelSpeed - v.longitudinalVelocity, v.lateralVelocity);
    this.slip += this.tone * (slip - this.slip);
    this.scrubModulation =
      1 + this.material.textureDepth * this.scrubTexture.step(this.textureRate(this.slip) / S.controlHz);
    for (let i = 0; i < this.scrub.length; i++) {
      const band = S.scrubBands[i]!;
      this.scrub[i]!.configure(band.baseHz + band.slipHz * saturate(this.slip, S.scrubSlipHalfMps), band.bandwidthHz);
    }
    const targetWidth =
      S.squealBaseBandwidthHz +
      S.squealSlipBandwidthHz * saturate(slip, S.squealSlipBandwidthHalfMps) +
      S.squealWheelBandwidthHz * saturate(Math.abs(v.wheelSpeed), S.squealWheelBandwidthHalfMps);
    this.width += this.tone * (targetWidth - this.width);
    const center = this.pitch * (1 + S.wanderDepth * this.wander.step(1 / (S.controlHz * S.wanderSeconds)));
    for (let i = 0; i < this.squeal.length; i++) this.squeal[i]!.configure((i + 1) * center, (i + 1) * this.width);
  }

  get squealAmplitude(): number {
    return Math.sqrt(this.energy);
  }
  get squealFrequency(): number {
    return this.pitch;
  }

  private condition(value: number, tap: number): number {
    const hp = value - this.previous[tap]! + this.dcPole * this.highpass[tap]!;
    this.previous[tap] = value;
    this.highpass[tap] = hp;
    this.filtered[tap] = this.filtered[tap]! + this.outputFollow[tap]! * (hp - this.filtered[tap]!);
    return this.filtered[tap]!;
  }

  sample(): number {
    if (this.sliding) {
      this.work += (this.targetWork > this.work ? this.attack : this.release) * (this.targetWork - this.work);
      this.drive += (this.targetDrive > this.drive ? this.attack : this.release) * (this.targetDrive - this.drive);
      this.pitch += this.attack * (this.targetPitch - this.pitch);
    }
    if (this.clock >= this.rate) {
      this.clock -= this.rate;
      this.control();
    }
    this.clock += S.controlHz;
    const excitation = this.sliding ? this.drive * this.material.squeal : 0;
    // Energy form of the Hopf radial law: E'=2*sigma*E-2*beta*E²+D.
    // Positive rational step; seed power is authored normalized noise energy, not joules.
    const injected = this.energy + (S.seedEnergyPerSecond * excitation * excitation) / this.rate;
    this.energy =
      (injected * (1 + (2 * S.growthPerSecond * (excitation - S.excitationThreshold)) / this.rate)) /
      (1 + (2 * S.saturationPerSecond * injected) / this.rate);
    const a = this.squealAmplitude,
      shape = Math.min(1, a / S.harmonicAmplitudeReference);
    let scrub = 0,
      squeal = 0,
      harmonicShape = 1;
    for (let i = 0; i < this.scrub.length; i++)
      scrub += this.scrub[i]!.sample(
        this.work * S.scrubGain * (i === 0 ? this.material.scrubLow : this.material.scrubHigh) * this.scrubModulation,
      );
    for (let i = 0; i < this.squeal.length; i++) {
      squeal += this.squeal[i]!.sample(a * S.squealGain * S.harmonicWeights[i]! * harmonicShape);
      harmonicShape *= shape;
    }
    this.roadOutput = this.rolling.sample();
    this.scrubOutput = this.condition(scrub, 0);
    this.squealOutput = this.condition(squeal, 1);
    return this.roadOutput + this.scrubOutput + this.squealOutput;
  }
}
