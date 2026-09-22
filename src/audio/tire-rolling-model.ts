import { NoiseBand, SmoothRandom, deriveNoiseSeed, NOISE_BAND_DOMAIN } from './noise.js';
import { ROLLING_SETTINGS as S, ROLLING_SURFACES } from './tire-rolling-acoustics.js';
import {
  TIRE_SOUND_SURFACES,
  validateTireSoundObservation,
  type TireSoundObservation,
} from './tire-sound-observation.js';

const saturate = (value: number, half: number): number => value / (value + half);
type Material = { -readonly [K in keyof (typeof ROLLING_SURFACES)['ASPHALT']]: number };
const MATERIAL_KEYS = Object.keys(ROLLING_SURFACES.ASPHALT) as (keyof Material)[];

/** Rotation-driven R, shared by composition without constructing or processing friction voices. */
export class TireRollingSynthesis {
  private readonly bands: NoiseBand[];
  private readonly texture: SmoothRandom;
  private readonly material: Material = { ...ROLLING_SURFACES.ASPHALT };
  private targetMaterial: Readonly<Material> = ROLLING_SURFACES.ASPHALT;
  private readonly attack: number;
  private readonly release: number;
  private readonly tone: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private previous = 0;
  private highpass = 0;
  private filtered = 0;
  private lowpass = 0;
  private supported = false;
  private wheelSpeed = 0;
  private wheelAngularSpeed = 0;
  private wheelFrequency = 0;
  private targetLevel = 0;
  private level = 0;
  private modulation = 1;
  private clock: number;

  constructor(
    private readonly rate: number,
    seed: number,
  ) {
    this.bands = S.bandStreams.map((stream) => new NoiseBand(rate, deriveNoiseSeed(seed, stream)));
    this.texture = new SmoothRandom(deriveNoiseSeed(seed, S.textureStream));
    this.attack = 1 - Math.exp(-1 / (rate * S.attackSeconds));
    this.release = 1 - Math.exp(-1 / (rate * S.releaseSeconds));
    this.tone = 1 - Math.exp(-1 / (S.controlHz * S.toneSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * S.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * S.outputHz) / rate);
    this.clock = rate;
  }

  update(value: TireSoundObservation, surfaceIndex = 0): void {
    try {
      validateTireSoundObservation(value, surfaceIndex);
    } catch (error) {
      this.releaseContact();
      throw error;
    }
    this.targetMaterial = ROLLING_SURFACES[TIRE_SOUND_SURFACES[surfaceIndex]!];
    this.supported = value.load > 0;
    if (!this.supported) {
      this.releaseContact();
      return;
    }
    // Copy the controls: callers reuse their completed observation objects.
    this.wheelSpeed = value.wheelSpeed;
    this.wheelAngularSpeed = value.wheelAngularSpeed;
    this.targetLevel =
      value.wheelAngularSpeed !== 0
        ? Math.sqrt(saturate(value.load, S.loadHalfNewtons)) *
          saturate(Math.abs(value.wheelSpeed), S.speedHalfMps) ** S.speedExponent
        : 0;
  }

  private releaseContact(): void {
    this.supported = false;
    this.level = this.targetLevel = 0;
  }

  private control(): void {
    if (!this.supported) return;
    for (const key of MATERIAL_KEYS) this.material[key] += this.tone * (this.targetMaterial[key] - this.material[key]);
    this.wheelFrequency += this.tone * (Math.abs(this.wheelAngularSpeed) / (2 * Math.PI) - this.wheelFrequency);
    // Speed/length is Hz; the saturation and texture length are authored acoustic choices.
    const textureRate =
      S.textureMaximumHz * saturate(Math.abs(this.wheelSpeed), S.textureMaximumHz * this.material.textureLengthMeters);
    this.modulation =
      1 +
      Math.max(this.material.textureDepth, S.textureMinimumDepth) *
        this.texture.step(this.wheelAngularSpeed === 0 ? 0 : textureRate / S.controlHz);
    for (let i = 0; i < this.bands.length; i++) {
      const hz = Math.max(S.minimumHz, S.orders[i]! * this.wheelFrequency);
      this.bands[i]!.configure(hz, Math.max(NOISE_BAND_DOMAIN.minimumBandwidthHz, hz * S.bandwidthRatio));
    }
  }

  sample(): number {
    if (this.supported)
      this.level += (this.targetLevel > this.level ? this.attack : this.release) * (this.targetLevel - this.level);
    if (this.clock >= this.rate) {
      this.clock -= this.rate;
      this.control();
    }
    this.clock += S.controlHz;
    let value = 0;
    for (let i = 0; i < this.bands.length; i++)
      value += this.bands[i]!.sample(
        this.level * S.gain * (i === 0 ? this.material.low : this.material.high) * this.modulation,
      );
    const hp = value - this.previous + this.dcPole * this.highpass;
    this.previous = value;
    this.highpass = hp;
    this.filtered += this.outputFollow * (hp - this.filtered);
    this.lowpass += this.outputFollow * (this.filtered - this.lowpass);
    return this.lowpass;
  }
}
