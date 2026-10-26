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
 * The road positions a unit of the phase takes, which each tick gains km/h / 64 `phaseSteps` times as the road position
 * gains km/h × `step` / 65536: a tick's advance comes a unit at a time, once a `phaseUnit`, in the limit of a speed
 * falling to 0.
 */
export const phaseUnit = (clock: BoardClock) => (64 * clock.step) / (phaseSteps(clock) * 65536);
/** The stripes' period, metres: 32 units of the road's fine position, the phase's (the sub CPU's `andi.w #$1F`). */
export const stripePeriod = (clock: BoardClock) => 32 * phaseUnit(clock) * positionMetres(clock);
/** The road width approaches a width point's target by its speed × 16 (`asl.l #4`) / `step` units a position. */
export const widthRate = (clock: BoardClock) => 16 / clock.step;
