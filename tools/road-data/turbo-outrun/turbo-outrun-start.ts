/**
 * What stands at each leg's start in TURBO OUTRUN ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md)):
 * the start objects the main CPU's start table lists, and the start figures its encrypted code moves, as the stage's
 * description gives them.
 */
import { long, word } from '../sega-16/program-words.js';
import { readItem, LEG_COUNT, type TurboOutrunItem } from './turbo-outrun-road.js';

/** The start table at 0x7B46: for each leg {long items' address, word c}, 8 bytes. */
const START_TABLE = 0x7b46;

/**
 * Leg `leg`'s start objects: items 0 to c of the list its entry names, 8-byte scenery items whose flags' bit 1 sets
 * their depth to the word (b6, b7). The program writes them over two ticks, and item c / 2 − 1 is written over and
 * never shown (`shown`).
 */
export function readStartObjects(main: Uint8Array, leg: number) {
  const entry = START_TABLE + 8 * leg;
  const address = long(main, entry),
    c = word(main, entry + 4);
  const items: TurboOutrunItem[] = Array.from({ length: c + 1 }, (_, i) => readItem(main, address + 8 * i));
  const hidden = Math.floor(c / 2) - 1;
  return { entry, address, c, hidden, items, shown: items.filter((_, i) => i !== hidden) };
}

export const readAllStartObjects = (main: Uint8Array) =>
  Array.from({ length: LEG_COUNT }, (_, leg) => readStartObjects(main, leg));
