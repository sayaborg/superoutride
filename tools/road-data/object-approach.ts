/**
 * How the objects of the originals on OUTRUN's board approach the car tick by tick
 * ([Original road data](../../docs/original-road-data.md#placing-scenery)): the tick's advance from the phase word, an
 * object's depth after a tick by its program's approach table, and where an object standing at the start looks as
 * large as the original draws it.
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { long } from './program-words.js';
import { UNIT_METRES } from './pixel-grid.js';
import { POSITION_METRES } from './offset-plan.js';

/** The phase word gains km/h / 64 three times a tick, its remainder shared: twice in the frame interrupt, once in object 0. */
const PHASE_STEPS = 3;
/** The most an object's depth advances by in a tick (the table's 16 advances). */
const MOST_ADVANCE = 15;
/** The road position each km/h advances a tick, 16.16 (0x12F). */
export const STEP_PER_KMH = 0x12f;
/** The road's lines, near to far 0 to 511: an object at line L is drawn L / 512 px a road unit. */
const LINES = 512;

/** A tick's advance (`col`) at `kmh`: the phase's gain, three times km/h / 64 with `remainder` carried, at most 15. */
export function tickAdvance(kmh: number, remainder: number): { advance: number; remainder: number } {
  let advance = 0;
  for (let i = 0; i < PHASE_STEPS; i++) {
    remainder += kmh;
    advance += Math.floor(remainder / 64);
    remainder %= 64;
  }
  return { advance: Math.min(MOST_ADVANCE, advance), remainder };
}

/**
 * An object's depth (16.16 lines) after one tick of its approach: the step the approach table at `table` (a long a
 * line for each advance of 0 to 15, 0x800 bytes an advance) gives for its line and the tick's advance, half of it for
 * an object that approaches at half the rate (`asr.l #1`).
 */
export function approached(main: Uint8Array, table: number, depth: number, advance: number, half = false): number {
  const step = long(main, table + (advance << 11) + 4 * (depth >>> 16));
  return depth + (half ? step >> 1 : step);
}

/**
 * The road positions from the camera at which an object standing at the start at line `line` looks as large as the
 * original draws it: f × `UNIT_METRES` × 512 / line metres for this game's camera of focal length f.
 */
export const startDepth = (line: number) =>
  (CAMERA_DEFINITION.focalLength * UNIT_METRES * LINES) / line / POSITION_METRES;
