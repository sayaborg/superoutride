import type { ControlSettings } from './audio-control-policy.js';
import { ExhaustLight, LIGHT_TRIALS, type LightTrialName } from './exhaust-light.js';
import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { VehicleEngineSound } from './vehicle-engine-sound.js';

/** The output's rate over the rate an exhaust kernel runs at: each a halving of the one before. */
export const EXHAUST_RATE_DIVISORS = Object.freeze([1, 2, 4, 8] as const);
export type ExhaustRateDivisor = (typeof EXHAUST_RATE_DIVISORS)[number];

/**
 * How an engine is rendered: the game kernel (`ExhaustWaveguide`) run at the output's rate over its divisor, or the light
 * kernel (`ExhaustLight`) at the output's rate in one of its trial forms (`LIGHT_TRIALS`; K, 2026-11-24).
 */
export type ExhaustRendering =
  | { readonly kernel: 'WAVEGUIDE'; readonly divisor: ExhaustRateDivisor }
  | { readonly kernel: 'LIGHT'; readonly divisor: 1; readonly trial: LightTrialName };

/**
 * The renderings an engine is played and measured at, each one record: the game kernel at each divisor, then the light
 * kernel at the output's rate (K, 2026-11-22: it has no slower rate) in each trial form, PLAIN first.
 */
export const EXHAUST_RENDERINGS: readonly ExhaustRendering[] = Object.freeze([
  ...EXHAUST_RATE_DIVISORS.map((divisor) => Object.freeze({ kernel: 'WAVEGUIDE' as const, divisor })),
  ...(Object.keys(LIGHT_TRIALS) as LightTrialName[]).map((trial) =>
    Object.freeze({ kernel: 'LIGHT' as const, divisor: 1 as const, trial }),
  ),
]);
const waveguide = (divisor: ExhaustRateDivisor): ExhaustRendering =>
  EXHAUST_RENDERINGS.find((entry) => entry.kernel === 'WAVEGUIDE' && entry.divisor === divisor)!;
const light = (trial: LightTrialName): ExhaustRendering =>
  EXHAUST_RENDERINGS.find((entry) => entry.kernel === 'LIGHT' && entry.trial === trial)!;
/** A rendering's name, as the engine loudness names it. */
export const renderingName = (rendering: ExhaustRendering): string =>
  rendering.kernel === 'WAVEGUIDE' ? `WAVEGUIDE at ${rendering.divisor}` : `LIGHT ${rendering.trial}`;

/**
 * The player's ENGINE SOUND QUALITY settings (K, 2026-11-21, 2026-11-22 and 2026-11-24), MID until the player chooses.
 * `LIGHT W` and `LIGHT F` are the light kernel's trial forms, until K keeps one of the three.
 */
export const ENGINE_SOUND_QUALITIES = Object.freeze(['HIGH', 'MID', 'LOW', 'LIGHT', 'LIGHT W', 'LIGHT F'] as const);
export type EngineSoundQuality = (typeof ENGINE_SOUND_QUALITIES)[number];
export const DEFAULT_ENGINE_SOUND_QUALITY: EngineSoundQuality = 'MID';

/**
 * The renderings a quality plays the engines at: HIGH, MID and LOW the game kernel, the player's at its own divisor and
 * a rival's at half its rate; LIGHT, LIGHT W and LIGHT F the light kernel's PLAIN, WALL and FRICTION forms for both at
 * the output's rate.
 */
const QUALITY_RENDERINGS: Readonly<
  Record<EngineSoundQuality, { readonly player: ExhaustRendering; readonly rival: ExhaustRendering }>
> = Object.freeze({
  HIGH: Object.freeze({ player: waveguide(1), rival: waveguide(2) }),
  MID: Object.freeze({ player: waveguide(2), rival: waveguide(4) }),
  LOW: Object.freeze({ player: waveguide(4), rival: waveguide(8) }),
  LIGHT: Object.freeze({ player: light('PLAIN'), rival: light('PLAIN') }),
  'LIGHT W': Object.freeze({ player: light('WALL'), rival: light('WALL') }),
  'LIGHT F': Object.freeze({ player: light('FRICTION'), rival: light('FRICTION') }),
});

/** The renderings, members of `EXHAUST_RENDERINGS`, a quality plays the player's and a rival's engines at. */
export function engineRenderings(quality: EngineSoundQuality): {
  readonly player: ExhaustRendering;
  readonly rival: ExhaustRendering;
} {
  return QUALITY_RENDERINGS[quality];
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

/** What the renderer asks of a kernel: `ExhaustWaveguide`'s and `ExhaustLight`'s calls. */
type ExhaustKernel = Pick<ExhaustWaveguide, 'afterfire' | 'render'>;

/**
 * A rendering's kernel run at the output's `rate` over its divisor, its sound brought up to the output's rate by
 * doubling once for each halving. The kernel takes the targets of the first output sample of each of its own; with
 * divisor 1 it renders the output's samples itself. Each kernel is one model at every rate: only the rate it is given
 * differs.
 */
export class ExhaustRenderer {
  private readonly kernel: ExhaustKernel;
  private readonly divisor: ExhaustRateDivisor;
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
    rendering: ExhaustRendering,
    control: Pick<ControlSettings, 'observationSeconds'>,
  ) {
    const { divisor } = rendering;
    this.kernel =
      rendering.kernel === 'LIGHT'
        ? new ExhaustLight(sound, rate, control.observationSeconds, LIGHT_TRIALS[rendering.trial])
        : new ExhaustWaveguide(sound, rate / divisor, control.observationSeconds);
    this.divisor = divisor;
    this.doublers = Array.from({ length: Math.log2(divisor) }, () => new Doubler());
    this.ready = new Float64Array(divisor);
    this.at = divisor;
  }

  /** The kernel's next charge burns in the pipe ({@link ExhaustWaveguide.afterfire}, {@link ExhaustLight.afterfire}). */
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
    // At the output's rate the kernel takes every sample's targets, whose calls may divide the samples as they come.
    if (divisor === 1) {
      this.kernel.render(out, offset, count, rpm, opening, burns);
      return;
    }
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
