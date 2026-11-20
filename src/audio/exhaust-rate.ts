import type { ControlSettings } from './audio-control-policy.js';
import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { VehicleEngineSound } from './vehicle-engine-sound.js';

/** The output's rate over the rate an exhaust kernel runs at: each a halving of the one before. */
export const EXHAUST_RATE_DIVISORS = Object.freeze([1, 2, 4, 8] as const);
export type ExhaustRateDivisor = (typeof EXHAUST_RATE_DIVISORS)[number];

/** The player's ENGINE SOUND QUALITY settings (K, 2026-11-21), MID until the player chooses. */
export const ENGINE_SOUND_QUALITIES = Object.freeze(['HIGH', 'MID', 'LOW'] as const);
export type EngineSoundQuality = (typeof ENGINE_SOUND_QUALITIES)[number];
export const DEFAULT_ENGINE_SOUND_QUALITY: EngineSoundQuality = 'MID';
const PLAYER_DIVISORS: Readonly<Record<EngineSoundQuality, 1 | 2 | 4>> = Object.freeze({ HIGH: 1, MID: 2, LOW: 4 });

/** The divisors a quality runs the engines' kernels at: the player's its own, a rival's half its rate. */
export function engineRateDivisors(quality: EngineSoundQuality): {
  readonly player: ExhaustRateDivisor;
  readonly rival: ExhaustRateDivisor;
} {
  const player = PLAYER_DIVISORS[quality];
  return { player, rival: (2 * player) as ExhaustRateDivisor };
}

/** Doubles a stream's rate: for each sample in, the sample between the two before it, then the one before it. */
class Doubler {
  private a = 0;
  private b = 0;
  private c = 0;
  between = 0;
  on = 0;
  push(d: number): void {
    // The cubic through the four samples around the one between.
    this.between = (-this.a + 9 * this.b + 9 * this.c - d) / 16;
    this.on = this.c;
    this.a = this.b;
    this.b = this.c;
    this.c = d;
  }
}

/**
 * An exhaust kernel run at the output's `rate` over `divisor`, its sound brought up to the output's rate by doubling
 * once for each halving. The kernel takes the targets of the first output sample of each of its own; with divisor 1
 * it renders every output sample itself. One model at every rate: only the rate the kernel is given differs.
 */
export class ExhaustRenderer {
  private readonly kernel: ExhaustWaveguide;
  private readonly one = new Float64Array(1);
  private readonly speed = new Float64Array(1);
  private readonly open = new Float64Array(1);
  private readonly doublers: readonly Doubler[];
  /** The output samples of the kernel's latest sample, and the next of them to give. */
  private readonly ready: Float64Array;
  private at: number;

  constructor(
    sound: VehicleEngineSound,
    rate: number,
    private readonly divisor: ExhaustRateDivisor,
    control: Pick<ControlSettings, 'observationSeconds'>,
  ) {
    this.kernel = new ExhaustWaveguide(sound, rate / divisor, control.observationSeconds);
    this.doublers = Array.from({ length: Math.log2(divisor) }, () => new Doubler());
    this.ready = new Float64Array(divisor);
    this.at = divisor;
  }

  /** The kernel's next charge burns in the pipe ({@link ExhaustWaveguide.afterfire}). */
  afterfire(): void {
    this.kernel.afterfire();
  }

  /** Sends one sample through the doublers from `stage` on, laying what comes out at ready[at ..]. */
  private raise(stage: number, sample: number, at: number): void {
    if (stage === this.doublers.length) {
      this.ready[at] = sample;
      return;
    }
    const doubler = this.doublers[stage]!;
    doubler.push(sample);
    const half = this.divisor >> (stage + 1);
    this.raise(stage + 1, doubler.between, at);
    this.raise(stage + 1, doubler.on, at + half);
  }

  /** Render `count` output samples into `out` from `offset`, as {@link ExhaustWaveguide.render} does. */
  render(
    out: Float64Array,
    offset: number,
    count: number,
    rpm: ArrayLike<number>,
    opening: ArrayLike<number>,
    burns: boolean,
  ): void {
    const { divisor, ready } = this;
    for (let k = 0; k < count; k++) {
      if (this.at === divisor) {
        this.speed[0] = rpm[k]!;
        this.open[0] = opening[k]!;
        this.kernel.render(this.one, 0, 1, this.speed, this.open, burns);
        this.raise(0, this.one[0]!, 0);
        this.at = 0;
      }
      out[offset + k] = ready[this.at++]!;
    }
  }
}
