import type { ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { FrictionResonator } from './friction-resonator.js';
import { TireRollingSynthesis } from './tire-rolling-model.js';
import type { RollingSettings } from './tire-rolling-acoustics.js';
import { UNIFIED_SYNTHESIS as S, type UnifiedSettings } from './tire-unified-acoustics.js';
import type { SurfaceSound } from './surface-sounds.js';
import type { TireSoundObservation } from './tire-sound-transport.js';

const saturate = (value: number, half: number): number => value / (value + half);

/** R plus ONE stochastic friction system Q, from rubbing through self-excited squeal. */
export class TireUnifiedSynthesis {
  private readonly rolling: TireRollingSynthesis;
  private readonly friction: FrictionResonator;
  private readonly follow: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private readonly settings: UnifiedSettings;
  private active = false;
  private targetForce = 0;
  private targetFeedback = 0;
  private force = 0;
  private feedback = 0;
  private previous = 0;
  private highpass = 0;
  private filtered = 0;
  rollingOutput = 0;
  frictionOutput = 0;

  constructor(
    rate: number,
    private readonly surfaces: readonly SurfaceSound[],
    seed: number = S.frontSeed,
    settings: UnifiedSettings = DEFAULT_AUDIO_SETTINGS.unified,
    rolling: RollingSettings = DEFAULT_AUDIO_SETTINGS.rolling,
    control: ControlSettings = DEFAULT_AUDIO_SETTINGS.control,
  ) {
    this.settings = settings;
    this.friction = new FrictionResonator(
      rate,
      {
        feedbackMaximumPerSecond: this.settings.feedbackMaximumPerSecond,
        saturationPerSecond: this.settings.saturationPerSecond,
        noiseBandwidthHz: this.settings.noiseBandwidthHz,
        // One shared port couples BOTH resonances; neither is a separate R/Q generator.
        resonances: [
          {
            frequencyHz: this.settings.lowFrequencyHz,
            dampingPerSecond: this.settings.resonanceDampingPerSecond,
            participation: this.settings.lowParticipation,
          },
          {
            frequencyHz: this.settings.highFrequencyHz,
            dampingPerSecond: this.settings.resonanceDampingPerSecond,
            participation: Math.sqrt(1 - this.settings.lowParticipation ** 2),
          },
        ],
      },
      seed,
    );
    this.rolling = new TireRollingSynthesis(rate, surfaces, seed, rolling);
    this.follow = 1 - Math.exp(-1 / (rate * control.observationSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * this.settings.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * this.settings.outputCutoffHz) / rate);
  }

  update(value: TireSoundObservation, surfaceIndex = 0): void {
    const settings = this.settings;
    this.rolling.update(value, surfaceIndex);
    const slip = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = value.longitudinalPower + value.lateralPower;
    this.active = value.load > 0 && slip > 0 && power > 0;
    if (!this.active) {
      this.release();
      return;
    }
    const material = this.surfaces[surfaceIndex]!.friction;
    // Authored work-to-excitation response, NOT an acoustic-power conversion.
    // Linear near zero, saturating at high work; one authority for forcing and feedback.
    const work = saturate(power, settings.powerReferenceWatts);
    this.targetForce = settings.noiseForcePerSecond * work * material.roughness;
    this.targetFeedback =
      (settings.feedbackMaximumPerSecond * material.susceptibility * work * saturate(slip, settings.slipHalfMps)) /
      (1 + (slip / settings.slipRolloffMps) ** 2);
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
    this.rollingOutput = this.rolling.sample();
    return this.rollingOutput + this.frictionOutput;
  }
}
