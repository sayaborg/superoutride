/**
 * How the objects of the originals on OUTRUN's board approach the car tick by tick
 * ([OUTRUN road data](../../docs/outrun-road-data.md#placing-scenery)): an object's depth after a tick of its approach
 * by its program's approach table, and where an object standing at the start looks
 * as large as the original draws it.
 */
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { long } from './program-words.js';
import { UNIT_METRES } from './pixel-grid.js';
import { positionMetres, type BoardClock } from './board-clock.js';

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
 * original draws it: f × `UNIT_METRES` × the road's lines (512) / line metres for this game's camera of focal length f.
 */
export const startDepth = (line: number, clock: BoardClock) =>
  (CAMERA_DEFINITION.focalLength * UNIT_METRES * clock.lines) / line / positionMetres(clock);
