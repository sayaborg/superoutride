/**
 * What stands at each leg's start in TURBO OUTRUN ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md)):
 * the start objects the main CPU's start table lists, and the start figures its encrypted code moves, as the stage's
 * description gives them.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { long, sword, word } from '../sega-16/program-words.js';
import { START_MOTION } from './turbo-outrun-constants.js';
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

/** A start figure's record: 24 bytes, its word 0x007F at 6. */
const FIGURE_RECORD = 24;
const FIGURE_MARK = 0x007f;

/**
 * A start figure as it stands in the countdown's last tick: its picture (a size list), palette, whether mirrored, x
 * (road units from road 0's centre), height (road units, before the pixel aspect), depth (a road line) and pixel (road
 * units a pixel of its largest size spans).
 */
export interface StartFigure {
  readonly figure: string;
  readonly sizes: number;
  readonly palette: number;
  readonly mirrored: boolean;
  readonly x: number;
  readonly height: number;
  readonly line: number;
  readonly pixel: number;
}

/**
 * Leg `leg`'s start figures: its records, 24 bytes {word x, word height, word line, word 0x007F, word palette, long
 * size list, long routine, long, word}, lying from the start table's end (leg 0) or the previous leg's start items' end
 * to its own start items, each checked by its word 0x007F; each as the countdown's encrypted motion leaves it
 * (`START_MOTION`).
 */
export function readStartFigures(main: Uint8Array, leg: number): StartFigure[] {
  const from =
    leg === 0
      ? START_TABLE + 8 * LEG_COUNT
      : (({ address, c }) => address + 8 * (c + 1))(readStartObjects(main, leg - 1));
  const { address } = readStartObjects(main, leg);
  const motion = START_MOTION[leg]!;
  if (address - from !== FIGURE_RECORD * motion.length)
    throw romDiffers(`Leg ${leg}'s start figures' records are not ${motion.length}`);
  return motion.map(({ figure, mirrored, pixel, ...changes }, i) => {
    const a = from + FIGURE_RECORD * i;
    if (word(main, a + 6) !== FIGURE_MARK) throw romDiffers(`Leg ${leg}'s start figure ${i} has no record`);
    return {
      figure,
      sizes: long(main, a + 10),
      palette: word(main, a + 8),
      mirrored,
      x: sword(main, a),
      height: sword(main, a + 2),
      line: word(main, a + 4),
      pixel,
      ...changes,
    };
  });
}
