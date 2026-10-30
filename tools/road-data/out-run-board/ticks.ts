/**
 * The ticks of OUTRUN's board at one speed, as its originals' programs run them, for checking [Time made into
 * position](../../../docs/original-road-data.md#time-made-into-position) against them (`positions-at-speed`).
 */
import { PHASE_SPEED, phaseSteps, type BoardClock } from './clock.js';

/** The programs' most advance a tick (OUTRUN's `cmpi.w #$F, d0` at 0xB9E8). */
const MOST_ADVANCE = 15;

/**
 * The speed, km/h, below which a tick's advance (`tickAdvance`) never passes `MOST_ADVANCE`: with a remainder of at
 * most `PHASE_SPEED` − 1 carried, a tick gains at most (`PHASE_SPEED` − 1 + `phaseSteps` × km/h) / `PHASE_SPEED`.
 */
export const belowMostAdvance = (clock: BoardClock) =>
  ((MOST_ADVANCE + 1) * PHASE_SPEED - (PHASE_SPEED - 1)) / phaseSteps(clock);
