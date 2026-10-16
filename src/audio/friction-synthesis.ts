import type { ControlSettings } from './audio-control-policy.js';
import { FrictionResonator } from './friction-resonator.js';
import type { SurfaceSound } from './surface-sounds.js';
import type { UnifiedSettings } from './tire-unified-acoustics.js';

/** The load the pickup gain is per: a unit, 1 kN, not a listening value. */
const LOAD_UNIT_NEWTONS = 1000;

/**
 * The tire's Q, ONE stochastic friction system: the friction resonator excited by a contact's sliding on a surface's
 * friction input, followed within the kernel and picked up through DC removal and a low-pass. Whether it squeals is
 * intensive (the slip speed and the surface), how strongly it sounds extensive (the friction power):
 * - feedback `a = feedbackMaximumPerSecond × susceptibility × g(s)`, `g(s) = s/(s+slipHalfMps)/(1+(s/slipRolloffMps)²)`;
 * - forcing `sigma = noiseForcePerSecond × roughness × sqrt(P/N)`, from the friction power per load `P/N` (m/s);
 * - the cubic term `a/s²`, so the vibration's speed stops at the slip speed (`FrictionResonator`);
 * - output: the port's displacement × `outputGainPerSecond × sqrt(N / 1 kN)`, the sliding area at a constant contact
 *   pressure, so forced sound power follows the friction power.
 */
export class FrictionSynthesis {
  private readonly resonator: FrictionResonator;
  private readonly follow: number;
  private readonly dcPole: number;
  private readonly outputFollow: number;
  private active = false;
  private excited = false;
  private targetForce = 0;
  private targetFeedback = 0;
  private targetSlip = 0;
  private targetGain = 0;
  private force = 0;
  private feedback = 0;
  private slip = 0;
  private gain = 0;
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
   * Slide at slip speed `slip` (m/s) with friction power `power` (W) under load `load` (N) on `friction`; without all
   * three positive the system is released. The slip speed starts from its first observation, not from 0.
   */
  update(slip: number, power: number, load: number, friction: SurfaceSound['friction']): void {
    const settings = this.settings;
    this.active = slip > 0 && power > 0 && load > 0;
    if (!this.active) {
      this.release();
      return;
    }
    this.targetFeedback =
      (settings.feedbackMaximumPerSecond * friction.susceptibility * (slip / (slip + settings.slipHalfMps))) /
      (1 + (slip / settings.slipRolloffMps) ** 2);
    this.targetForce = (settings.noiseForcePerSecond * friction.roughness * Math.sqrt(power)) / Math.sqrt(load);
    this.targetSlip = slip;
    this.targetGain = settings.outputGainPerSecond * Math.sqrt(load / LOAD_UNIT_NEWTONS);
    if (!this.excited) this.slip = slip;
    this.excited = true;
  }

  /** Stop forcing and feedback at once; the slip speed and the gain hold while stored vibration and the filters decay. */
  release(): void {
    this.active = false;
    this.force = this.feedback = this.targetForce = this.targetFeedback = 0;
  }

  /** One sample of the picked-up output. */
  sample(): number {
    if (this.active) {
      this.force += this.follow * (this.targetForce - this.force);
      this.feedback += this.follow * (this.targetFeedback - this.feedback);
      this.slip += this.follow * (this.targetSlip - this.slip);
      this.gain += this.follow * (this.targetGain - this.gain);
    }
    const value = this.resonator.sample(this.feedback, this.slip, this.force) * this.gain;
    this.highpass = value - this.previous + this.dcPole * this.highpass;
    this.previous = value;
    this.filtered += this.outputFollow * (this.highpass - this.filtered);
    return this.filtered;
  }
}
