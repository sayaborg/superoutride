/**
 * The ticks of OUTRUN's board at one speed, as its originals' programs run them, for checking [Time made into
 * position](../../docs/original-road-data.md#time-made-into-position) against them (`positions-at-speed`).
 */
import { phaseSteps, type BoardClock } from './board-clock.js';

/**
 * The speed, km/h, below which a tick's advance never passes the programs' most, 15 (OUTRUN's `cmpi.w #$F, d0` at
 * 0xB9E8): with a remainder of at most 63 carried, a tick gains at most (63 + `phaseSteps` × km/h) / 64.
 */
export const belowMostAdvance = (clock: BoardClock) => (16 * 64 - 63) / phaseSteps(clock);

/**
 * A tick's advance (`col`) at `kmh` (below `belowMostAdvance`): the phase's gain, `phaseSteps` times km/h / 64 with
 * `remainder` carried.
 */
export function tickAdvance(clock: BoardClock, kmh: number, remainder: number) {
  let advance = 0;
  for (let i = 0; i < phaseSteps(clock); i++) {
    remainder += kmh;
    advance += Math.floor(remainder / 64);
    remainder %= 64;
  }
  return { advance, remainder };
}
