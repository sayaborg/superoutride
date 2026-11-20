/**
 * The engine's own chain, after its kernel's sound is at the output's rate: the compressor, the vehicle's gain, the
 * soft clip; sound effects and music are mixed after it. Its three values are the owner's (K, 2026-11-21), not DEV
 * settings.
 */
export const ENGINE_CHAIN = Object.freeze({
  /** The compressor follows the sound's mean square over this long. */
  levelSeconds: 0.05,
  /**
   * The compressor's ratio, to 1: it divides the spread of the sound's level, in dB, by this. Its threshold is at the
   * bottom: all of the sound is in its range.
   */
  ratio: 2,
  /** The soft clip's ceiling, over the level the gain brings the sound to. */
  ceiling: 2,
});

/** The compressor's exponent of the mean square. */
const EXPONENT = -(1 - 1 / ENGINE_CHAIN.ratio) / 2;

/** The compressor: a sample `x` of a sound whose mean square is `level`, `x level^(-(1 - 1/ratio) / 2)`. */
function compress(x: number, level: number): number {
  return level > 0 ? x * level ** EXPONENT : 0;
}

/** The one-pole coefficient of the compressor's mean square at `rate`. */
const levelFollow = (rate: number) => 1 - Math.exp(-1 / (ENGINE_CHAIN.levelSeconds * rate));

/** A whole sound at `rate` through the compressor alone, from silence: what a vehicle's gain is measured on. */
export function compressed(signal: Float64Array, rate: number): Float64Array {
  const follow = levelFollow(rate);
  const out = new Float64Array(signal.length);
  let level = 0;
  for (let i = 0; i < signal.length; i++) {
    level += follow * (signal[i]! * signal[i]! - level);
    out[i] = compress(signal[i]!, level);
  }
  return out;
}

/**
 * The gain `10^((targetLufs - lufs)/20)` that brings an engine whose compressed sound measures `lufs` to
 * `targetLufs`, or 1 for an engine not measured (a delivery without measured products).
 */
export function engineGain(targetLufs: number, lufs: number | null): number {
  return lufs === null ? 1 : 10 ** ((targetLufs - lufs) / 20);
}

/**
 * The chain of one engine at the output's `rate`, from silence. `gain` is its vehicle's for the rate its kernel runs
 * at (`engineGain`).
 */
export class EngineChain {
  private level = 0;
  private readonly follow: number;
  constructor(
    rate: number,
    private readonly gain: number,
  ) {
    this.follow = levelFollow(rate);
  }
  /** One sample of the kernel's sound in, one of the engine's out: `y / (1 + |y| / ceiling)`, below the ceiling. */
  process(x: number): number {
    this.level += this.follow * (x * x - this.level);
    const y = this.gain * compress(x, this.level);
    return y / (1 + Math.abs(y) / ENGINE_CHAIN.ceiling);
  }
}
