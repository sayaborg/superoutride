import { FrictionResonator } from './friction-resonator.js';
import { TireRollingSynthesis } from './tire-rolling-model.js';
import {
  UNIFIED_SETTINGS as S,
  UNIFIED_SURFACES,
  resolveUnifiedTuning,
  type UnifiedTuning,
} from './tire-unified-acoustics.js';
import { TIRE_SOUND_SURFACES, type TireSoundObservation } from './tire-sound-observation.js';

const saturate = (value: number, half: number): number => value / (value + half);

/** R plus ONE stochastic friction system Q, from rubbing through self-excited squeal. */
export class TireUnifiedSynthesis {
  private readonly rolling: TireRollingSynthesis;
  private readonly friction: FrictionResonator;
  private readonly follow: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private readonly settings: UnifiedTuning;
  private active = false;
  private targetForce = 0;
  private targetFeedback = 0;
  private force = 0;
  private feedback = 0;
  private previous = 0;
  private highpass = 0;
  private filtered = 0;
  roadOutput = 0;
  frictionOutput = 0;

  constructor(rate: number, seed: number = S.frontSeed, tuning: Partial<UnifiedTuning> = {}) {
    this.settings = resolveUnifiedTuning(tuning);
    const settings = this.settings;
    this.friction = new FrictionResonator(
      rate,
      {
        ...settings,
        modes: [
          { ...S.modes[0], frequencyHz: settings.lowFrequencyHz },
          { ...S.modes[1], frequencyHz: settings.highFrequencyHz },
        ],
      },
      seed,
    );
    this.rolling = new TireRollingSynthesis(rate, seed);
    this.follow = 1 - Math.exp(-1 / (rate * S.controlSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * S.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * settings.outputCutoffHz) / rate);
  }

  get frictionEnergy(): number {
    return this.friction.energy;
  }

  update(value: TireSoundObservation, surfaceIndex = 0): void {
    const S = this.settings;
    try {
      // The rolling source validates and releases its own forcing on invalid observations.
      this.rolling.update(value, surfaceIndex);
    } catch (error) {
      this.release();
      throw error;
    }
    const slip = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = value.longitudinalPower + value.lateralPower;
    this.active = value.load > 0 && slip > 0 && power > 0;
    if (!this.active) {
      this.release();
      return;
    }
    const material = UNIFIED_SURFACES[TIRE_SOUND_SURFACES[surfaceIndex]!];
    const work = Math.sqrt(saturate(power, S.powerReferenceWatts));
    this.targetForce = S.noiseForcePerSecond * work * material.roughness;
    this.targetFeedback =
      (S.feedbackMaximumPerSecond * material.susceptibility * work * saturate(slip, S.slipHalfMps)) /
      (1 + (slip / S.slipRolloffMps) ** 2);
    // Demand rho is not a second grip/onset authority. Accepted work already includes force/load.
  }

  private release(): void {
    this.active = false;
    this.force = this.feedback = this.targetForce = this.targetFeedback = 0;
  }

  sample(): number {
    if (this.active) {
      this.force += this.follow * (this.targetForce - this.force);
      this.feedback += this.follow * (this.targetFeedback - this.feedback);
    }
    const value = this.friction.sample(this.feedback, this.force) * this.settings.outputGainPerSecond;
    this.highpass = value - this.previous + this.dcPole * this.highpass;
    this.previous = value;
    this.filtered += this.outputFollow * (this.highpass - this.filtered);
    this.frictionOutput = this.filtered;
    this.roadOutput = this.rolling.sample();
    return this.roadOutput + this.frictionOutput;
  }
}
