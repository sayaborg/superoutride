import type { ControlSettings } from './audio-control-policy.js';
import { FrictionResonator } from './friction-resonator.js';
import type { FrictionInput } from './surface-sounds.js';
import type { UnifiedSettings } from './tire-unified-acoustics.js';

const saturate = (value: number, half: number): number => value / (value + half);

/**
 * ONE stochastic friction system: the friction resonator excited by accepted work at a slip speed on a rubbed friction
 * input, followed within the kernel and picked up through DC removal and a low-pass. The tire's Q and a wall's scraping
 * are this one system with their own settings.
 */
export class FrictionSynthesis {
  private readonly resonator: FrictionResonator;
  private readonly follow: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private active = false;
  private targetForce = 0;
  private targetFeedback = 0;
  private force = 0;
  private feedback = 0;
  private previous = 0;
  private highpass = 0;
  private filtered = 0;

  constructor(
    rate: number,
    private readonly settings: UnifiedSettings,
    control: ControlSettings,
    seed: number,
  ) {
    this.resonator = new FrictionResonator(
      rate,
      {
        feedbackMaximumPerSecond: settings.feedbackMaximumPerSecond,
        saturationPerSecond: settings.saturationPerSecond,
        noiseBandwidthHz: settings.noiseBandwidthHz,
        // One shared port couples BOTH resonances; neither is a separate R/Q generator.
        resonances: [
          {
            frequencyHz: settings.lowFrequencyHz,
            dampingPerSecond: settings.resonanceDampingPerSecond,
            participation: settings.lowParticipation,
          },
          {
            frequencyHz: settings.highFrequencyHz,
            dampingPerSecond: settings.resonanceDampingPerSecond,
            participation: Math.sqrt(1 - settings.lowParticipation ** 2),
          },
        ],
      },
      seed,
    );
    this.follow = 1 - Math.exp(-1 / (rate * control.observationSeconds));
    this.dcPole = Math.exp((-2 * Math.PI * settings.dcHz) / rate);
    this.outputFollow = 1 - Math.exp((-2 * Math.PI * settings.outputCutoffHz) / rate);
  }

  /**
   * Excite with accepted power `power` (W) at slip speed `slip` (m/s) on `friction`; without both positive the system
   * is released.
   */
  update(power: number, slip: number, friction: FrictionInput): void {
    const settings = this.settings;
    this.active = slip > 0 && power > 0;
    if (!this.active) {
      this.release();
      return;
    }
    // Authored work-to-excitation response, NOT an acoustic-power conversion.
    // Linear near zero, saturating at high work; one authority for forcing and feedback.
    const work = saturate(power, settings.powerReferenceWatts);
    this.targetForce = settings.noiseForcePerSecond * work * friction.roughness;
    this.targetFeedback =
      (settings.feedbackMaximumPerSecond * friction.susceptibility * work * saturate(slip, settings.slipHalfMps)) /
      (1 + (slip / settings.slipRolloffMps) ** 2);
  }

  /** Disable new forcing and feedback at once; stored vibration and the output filters decay. */
  release(): void {
    this.active = false;
    this.force = this.feedback = this.targetForce = this.targetFeedback = 0;
  }

  /** One sample of the picked-up output. */
  sample(): number {
    if (this.active) {
      this.force += this.follow * (this.targetForce - this.force);
      this.feedback += this.follow * (this.targetFeedback - this.feedback);
    }
    const value = this.resonator.sample(this.feedback, this.force) * this.settings.outputGainPerSecond;
    this.highpass = value - this.previous + this.dcPole * this.highpass;
    this.previous = value;
    this.filtered += this.outputFollow * (this.highpass - this.filtered);
    return this.filtered;
  }
}
