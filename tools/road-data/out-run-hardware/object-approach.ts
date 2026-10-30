/**
 * How the objects of the originals on OUTRUN's hardware approach the car tick by tick
 * ([OUTRUN road data](../../../docs/outrun-road-data.md#placing-scenery)): an object's depth after a tick of its approach
 * by its program's approach table, and where an object standing at its line stands.
 */
import { long } from '../sega-16/program-words.js';

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
 * The road positions ahead of the car at which an object standing at line `line` stands, as the original projects it:
 * where the road's line `line` lies (`distances`, its lines near to far from the nearest, one less than the road's
 * lines), the original drawing an object at its line at that line's scale.
 */
export function lineAhead(distances: Float64Array, line: number): number {
  const k = distances.length - line;
  if (!Number.isInteger(k) || k < 0 || k >= distances.length) throw new RangeError(`Line ${line} has no distance`);
  return distances[k]!;
}
