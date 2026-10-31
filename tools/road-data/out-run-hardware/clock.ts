/**
 * The clock of the originals on OUTRUN's hardware, OUTRUN and TURBO OUTRUN
 * ([Original road data](../../../docs/original-road-data.md#the-programs-clock)): what each one's program holds of its tick,
 * read from it by its own conversion and passed to the parts the two share, and what a road position, a stripe's period
 * and a width point's rate are from it.
 */
import { metresAPosition } from '../shared/road-position.js';
import { FRAMES_A_SECOND } from '../sega-16/display.js';

/**
 * How the sub program's heights' procedure counts ([Hills](../../../docs/original-road-data.md#hills)): each tick its share
 * count gains `gain` × the phase word's gain, divided by the table's step (× its factor for kind 0) to a share that
 * stops at `end` (kinds 1 and 2 at `rampEnd`), kind 3 sliding its first `slideEntries` entries by `slide` instead of
 * its step; at each value's end the count starts again at `restart`. The procedure starts from the level horizon's base
 * `level` (each line's slope `level` × 16, 16.16 rows), and its words are sixteenths of a row above the road's last row,
 * `bottomRow`.
 */
export interface HeightCounts {
  readonly gain: number;
  readonly end: number;
  readonly rampEnd: number;
  readonly slide: number;
  readonly slideEntries: number;
  readonly restart: number;
  readonly level: number;
  readonly bottomRow: number;
}

/** An original's clock on OUTRUN's hardware, as its program holds it. */
export interface ProgramClock {
  /** The road position each km/h advances a tick, 16.16. */
  readonly step: number;
  /** Frames a tick: the main loop waits on a counter the frame interrupt counts down. */
  readonly frames: number;
  /** The road's lines, near to far: an object at line L is drawn L / lines px a road unit. */
  readonly lines: number;
  /** The heights' procedure's counts, read from the same sub program. */
  readonly heights: HeightCounts;
}

/** Ticks a second. */
export const ticks = (clock: ProgramClock) => FRAMES_A_SECOND / clock.frames;
/** The phase word gains a unit for each this many km/h a step, the rest carried. */
export const PHASE_SPEED = 64;
/** The stripes' period in units of the road's fine position, the phase's (the sub CPU's `andi.w #$1F`). */
const STRIPE_UNITS = 32;
/** A width point's speed is scaled by this into road units a step (`asl.l #4`). */
const WIDTH_GAIN = 16;
/** The phase word gains km/h / `PHASE_SPEED` once a frame in the frame interrupt and once a tick in object 0. */
export const phaseSteps = (clock: ProgramClock) => clock.frames + 1;
/** One road position in metres: each tick the displayed km/h advances it by `step` / 65536 positions. */
export const positionMetres = (clock: ProgramClock) => metresAPosition(1, 1 / ticks(clock), clock.step / 65536);
/**
 * The road positions a unit of the phase takes, which each tick gains km/h / `PHASE_SPEED` `phaseSteps` times as the
 * road position gains km/h × `step` / 65536: a tick's advance comes a unit at a time, once a `phaseUnit`, in the limit
 * of a speed falling to 0.
 */
export const phaseUnit = (clock: ProgramClock) => (PHASE_SPEED * clock.step) / (phaseSteps(clock) * 65536);
/**
 * A tick's whole gain of the phase word, its advance (`col`), at `kmh` with `remainder` carried: each of the tick's
 * `phaseSteps` adds km/h, the units of `PHASE_SPEED` counted and the rest carried (M 0xBD3E to 0xBD76).
 */
export function tickAdvance(clock: ProgramClock, kmh: number, remainder: number) {
  let advance = 0;
  for (let k = 0; k < phaseSteps(clock); k++) {
    remainder += kmh;
    advance += Math.floor(remainder / PHASE_SPEED);
    remainder %= PHASE_SPEED;
  }
  return { advance, remainder };
}
/** The phase word's whole gains tick by tick at `kmh`, from a carry of 0 (`tickAdvance`). */
export function* phaseGains(clock: ProgramClock, kmh: number): Generator<number> {
  let remainder = 0;
  for (;;) {
    let advance;
    ({ advance, remainder } = tickAdvance(clock, kmh, remainder));
    yield advance;
  }
}
/** The stripes' period, metres: `STRIPE_UNITS` units of the road's fine position. */
export const stripePeriod = (clock: ProgramClock) => STRIPE_UNITS * phaseUnit(clock) * positionMetres(clock);
/** The road width approaches a width point's target by its speed × `WIDTH_GAIN` / `step` units a position. */
export const widthRate = (clock: ProgramClock) => WIDTH_GAIN / clock.step;
