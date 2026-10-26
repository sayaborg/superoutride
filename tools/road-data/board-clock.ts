/**
 * The clock of the originals on OUTRUN's board, OUTRUN and TURBO OUTRUN
 * ([Original road data](../../docs/original-road-data.md#the-boards-clock)): what each one's program holds of its tick,
 * read from it by its own conversion and passed to the parts the two share, and what a road position, a stripe's period
 * and a width point's rate are from it.
 */

/** The video's frames a second (the board's, not its program's). */
const FRAMES = 60;

/** An original's clock on OUTRUN's board, as its program holds it. */
export interface BoardClock {
  /** The road position each km/h advances a tick, 16.16. */
  readonly step: number;
  /** Frames a tick: the main loop waits on a counter the frame interrupt counts down. */
  readonly frames: number;
  /** The most an object's depth advances by in a tick (its approach table's 16 advances). */
  readonly mostAdvance: number;
  /** The road's lines, near to far: an object at line L is drawn L / lines px a road unit. */
  readonly lines: number;
}

/** Ticks a second. */
export const ticks = (clock: BoardClock) => FRAMES / clock.frames;
/** The phase word gains km/h / 64 once a frame in the frame interrupt and once a tick in object 0. */
export const phaseSteps = (clock: BoardClock) => clock.frames + 1;
/** One road position in metres: each tick the displayed km/h advances it by `step` / 65536 positions. */
export const positionMetres = (clock: BoardClock) => 65536 / (3.6 * ticks(clock) * clock.step);
/**
 * The stripes' period, metres: each tick adds km/h / 64 `phaseSteps` times to the road's fine position, 32 of it a
 * period (the sub CPU's `andi.w #$1F` of it choosing a stripe table).
 */
export const stripePeriod = (clock: BoardClock) =>
  ((32 * clock.step) / ((phaseSteps(clock) * 65536) / 64)) * positionMetres(clock);
/** The road width approaches a width point's target by its speed × 16 (`asl.l #4`) / `step` units a position. */
export const widthRate = (clock: BoardClock) => 16 / clock.step;

/**
 * A tick's advance (`col`) at `kmh`: the phase's gain, `phaseSteps` times km/h / 64 with `remainder` carried, at most
 * `mostAdvance`.
 */
export function tickAdvance(clock: BoardClock, kmh: number, remainder: number) {
  let advance = 0;
  for (let i = 0; i < phaseSteps(clock); i++) {
    remainder += kmh;
    advance += Math.floor(remainder / 64);
    remainder %= 64;
  }
  return { advance: Math.min(clock.mostAdvance, advance), remainder };
}
