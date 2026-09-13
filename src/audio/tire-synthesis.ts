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

interface TireParameters {
  readonly rolling: number;
  readonly friction: number;
  /** Dimensionless acoustic excitation; crossing the oscillator threshold permits growth. */
  readonly squeal: number;
  readonly cutoff: number;
  readonly pitch: number;
}

/** Acoustic mappings, not a second friction law. Power references are listening conventions. */
export function tireParameters(tire: TireAudioObservation): TireParameters {
  const material = MATERIAL[tire.surface];
  const supported = tire.load > 0 && tire.surface !== 'VOID';
  const power = supported && tire.slipSpeed > 0 ? Math.max(0, tire.longitudinalPower + tire.lateralPower) : 0;
  const intensity = Math.sqrt(power / (power + 12000));
  const lateral = power > 0 ? tire.lateralPower / power : 0;
  const onset = clamp((tire.utilization - 0.5) / 0.65, 0, 1);
  const slip = clamp((tire.slipSpeed - 0.5) / 1.5, 0, 1);
  // Axle-scale listening controls, not measured local tread friction or a universal onset speed.
  const slidingWindow = (slip * slip * (3 - 2 * slip)) / (1 + (tire.slipSpeed / 45) ** 2);
  const squeal = intensity * onset * onset * (3 - 2 * onset) * slidingWindow * material.squeal;
  return {
    rolling: supported
      ? 0.16 *
        Math.sqrt(tire.load / (tire.load + 3000)) *
        Math.sqrt(clamp(tire.rollingSpeed / 60, 0, 1)) *
        material.rolling
      : 0,
    friction: 0.16 * intensity * (1 - 0.3 * lateral),
    squeal: squeal * (0.85 + 0.15 * lateral),
    pitch: 650 + (350 * tire.slipSpeed) / (tire.slipSpeed + 6) + 220 * (1 - lateral),
    cutoff: material.cutoff,
  };
}

/** One axle, independent random/filter/envelope state. No allocation in sample(). */
export class TireSynthesis {
  private readonly oscillatorStep: number;
  private readonly detune: number;
  private rotationX = 1;
  private rotationY = 0;
  private rotationCountdown = 0;
  private x = 0;
  private y = 0;
  private pitch = 900;
  private readonly attack: number;
  private readonly release: number;
  private readonly roughCoefficient: number;
  private readonly dcCoefficient: number;
  private readonly scrubCoefficient: number;
  private roadCoefficient: number;
  private targetRoadCoefficient: number;
  private target: TireParameters = { rolling: 0, friction: 0, squeal: 0, cutoff: 900, pitch: 900 };
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
    this.oscillatorStep = 1 / rate;
    // Tiny reproducible per-source detuning avoids coherent front/rear tones, not stereo localization.
    this.detune = 1 + 0.006 * (((seed >>> 8) & 255) / 127.5 - 1);
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
    // Broadband friction remains separate from tonal self-excitation.
    this.scrub += this.scrubCoefficient * (scrub - this.scrub);
    this.pitch += this.attack * (this.target.pitch - this.pitch);
    if (this.rotationCountdown-- === 0) {
      // Coefficient cadence belongs to this stream, independent of host render-block partitioning.
      const angle = 2 * Math.PI * this.pitch * this.detune * (1 + 0.025 * this.rough) * this.oscillatorStep;
      this.rotationX = Math.cos(angle);
      this.rotationY = Math.sin(angle);
      this.rotationCountdown = 31;
    }
    // Acoustic Hopf normal form: z' = (sigma - beta |z|² + i omega) z + seed noise.
    // Positive growth above onset, nonlinear radial damping, exact phase rotation.
    // This rational radial step avoids the runaway of explicit cubic damping at large amplitudes.
    const excitation = clamp(this.squeal, 0, 1);
    this.x += 8 * excitation * noise * this.oscillatorStep;
    const radiusSquared = this.x * this.x + this.y * this.y;
    const gain =
      (1 + 140 * (excitation - 0.12) * this.oscillatorStep) / (1 + 150 * radiusSquared * this.oscillatorStep);
    const x = gain * (this.rotationX * this.x - this.rotationY * this.y);
    this.y = gain * (this.rotationY * this.x + this.rotationX * this.y);
    this.x = x;
    // Phase-locked harmonics grow with oscillation amplitude; no unrelated second whistle.
    const ringing = this.y + 0.32 * (2 * this.x * this.y) + 0.12 * this.y * (3 * this.x * this.x - this.y * this.y);
    const modulation = 1 + 1.5 * this.rough;
    const mixed = this.rolling * this.road + modulation * (this.friction * (this.scrub - this.road) + 0.32 * ringing);
    return (0.35 * mixed) / (1 + Math.abs(mixed));
  }
}
