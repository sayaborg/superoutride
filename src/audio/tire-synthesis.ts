import { clamp } from '../core/math.js';
import type { TireAudioObservation } from './vehicle-audio-observation.js';

const MATERIAL = {
  ASPHALT: { rolling: 0.35, squeal: 1, cutoff: 900 },
  SHOULDER: { rolling: 0.7, squeal: 0.45, cutoff: 1600 },
  GRASS: { rolling: 0.6, squeal: 0.05, cutoff: 700 },
  DIRT: { rolling: 0.8, squeal: 0.15, cutoff: 1800 },
  SAND: { rolling: 1, squeal: 0.03, cutoff: 1200 },
  VOID: { rolling: 0, squeal: 0, cutoff: 900 },
} as const;

/** Acoustic mappings, not a second friction law. Power references are listening conventions. */
export function tireParameters(tire: TireAudioObservation) {
  const material = MATERIAL[tire.surface];
  const supported = tire.load > 0 && tire.surface !== 'VOID';
  const power = supported && tire.slipSpeed > 0 ? Math.max(0, tire.longitudinalPower + tire.lateralPower) : 0;
  const intensity = Math.sqrt(power / (power + 12000));
  const lateral = power > 0 ? tire.lateralPower / power : 0;
  const onset = clamp((tire.utilization - 0.5) / 0.65, 0, 1);
  const squeal = intensity * onset * onset * (3 - 2 * onset) * material.squeal;
  return {
    rolling: supported
      ? 0.16 *
        Math.sqrt(tire.load / (tire.load + 3000)) *
        Math.sqrt(clamp(tire.rollingSpeed / 60, 0, 1)) *
        material.rolling
      : 0,
    friction: 0.16 * intensity * (1 - 0.3 * lateral),
    squeal: 0.18 * squeal * (0.75 + 0.25 * lateral),
    cutoff: material.cutoff,
  };
}

type TireParameters = ReturnType<typeof tireParameters>;

/** Constant-peak bandpass; fixed coefficients keep narrow resonances stable during control changes. */
class Bandpass {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly b: number;
  private readonly a1: number;
  private readonly a2: number;
  constructor(rate: number, hz: number, q: number) {
    const w = (2 * Math.PI * hz) / rate;
    const alpha = Math.sin(w) / (2 * q);
    this.b = alpha / (1 + alpha);
    this.a1 = (-2 * Math.cos(w)) / (1 + alpha);
    this.a2 = (1 - alpha) / (1 + alpha);
  }
  sample(x: number): number {
    const y = this.b * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** One axle, independent random/filter/envelope state. No allocation in sample(). */
export class TireSynthesis {
  private readonly low: Bandpass;
  private readonly high: Bandpass;
  private readonly attack: number;
  private readonly release: number;
  private readonly roughCoefficient: number;
  private readonly dcCoefficient: number;
  private readonly scrubCoefficient: number;
  private roadCoefficient: number;
  private targetRoadCoefficient: number;
  private target: TireParameters = { rolling: 0, friction: 0, squeal: 0, cutoff: 900 };
  private rolling = 0;
  private friction = 0;
  private squeal = 0;
  private road = 0;
  private scrub = 0;
  private dc = 0;
  private rough = 0;
  constructor(
    private readonly rate: number,
    private seed: number,
  ) {
    this.low = new Bandpass(rate, 1050, 18);
    this.high = new Bandpass(rate, 1630, 24);
    this.attack = 1 - Math.exp(-1 / (0.025 * rate));
    this.release = 1 - Math.exp(-1 / (0.065 * rate));
    this.roughCoefficient = 1 - Math.exp((-2 * Math.PI * 35) / rate);
    this.scrubCoefficient = 1 - Math.exp((-2 * Math.PI * 5500) / rate);
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * 80) / rate);
    this.roadCoefficient = this.targetRoadCoefficient = 1 - Math.exp((-2 * Math.PI * 900) / rate);
  }
  update(value: TireParameters): void {
    this.target = value;
    this.targetRoadCoefficient = 1 - Math.exp((-2 * Math.PI * value.cutoff) / this.rate);
  }
  sample(): number {
    this.rolling +=
      (this.target.rolling > this.rolling ? this.attack : this.release) * (this.target.rolling - this.rolling);
    this.friction +=
      (this.target.friction > this.friction ? this.attack : this.release) * (this.target.friction - this.friction);
    this.squeal += (this.target.squeal > this.squeal ? this.attack : this.release) * (this.target.squeal - this.squeal);
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    const noise = this.seed / 2147483648;
    this.rough += this.roughCoefficient * (noise - this.rough);
    this.dc += this.dcCoefficient * (noise - this.dc);
    const scrub = noise - this.dc;
    this.roadCoefficient += this.attack * (this.targetRoadCoefficient - this.roadCoefficient);
    this.road += this.roadCoefficient * (scrub - this.road);
    // Fixed noise-band gain compensation; narrow-band mixing increases perceived tonality.
    this.scrub += this.scrubCoefficient * (scrub - this.scrub);
    const ringing = 5 * this.low.sample(scrub) + 2.5 * this.high.sample(scrub);
    const modulation = 1 + 1.5 * this.rough;
    const x =
      this.rolling * this.road + modulation * (this.friction * (this.scrub - this.road) + this.squeal * ringing);
    return (0.35 * x) / (1 + Math.abs(x));
  }
}
