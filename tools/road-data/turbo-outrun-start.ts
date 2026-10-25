/**
 * What stands at each leg's start in TURBO OUTRUN ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md)):
 * the start objects the main CPU's start table lists, and the start figures its encrypted code moves, as the stage's
 * description gives them.
 */
import { long, word } from './program-words.js';
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

/**
 * A start figure as it stands still: its picture (a size list), palette, whether mirrored, x (road units from road 0's
 * centre), its height (road units, before the pixel aspect), its depth (a road line) and its pixel (road units a
 * pixel of its largest size spans).
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

const figure = (
  name: string,
  sizes: number,
  palette: number,
  mirrored: boolean,
  x: number,
  height: number,
  line: number,
  pixel: number,
): StartFigure => ({ figure: name, sizes, palette, mirrored, x, height, line, pixel });

/** OKLAHOMA CITY's crowd: {x, picture, height}, each in palette 0x0E8 at line 209, a pixel 2 units. */
const CROWD: readonly (readonly [number, number, number])[] = [
  [-64, 0x26d82, 292],
  [64, 0x26db4, 280],
  [-192, 0x26d82, 280],
  [192, 0x26db4, 280],
  [320, 0x26db4, 280],
  [-320, 0x26d82, 284],
  [0, 0x26d82, 284],
  [128, 0x26db4, 288],
  [-128, 0x26d82, 288],
  [256, 0x26d82, 288],
  [-256, 0x26db4, 284],
];

/**
 * The start figures of each leg (the routine at 0x5446 and its records at 0x7B66, 0x7F16, 0x82E6 and 0x85BE), each as
 * it stands in the countdown's last tick (state 0x0B), the signal as it shows GO. Their motion lies in the encrypted
 * code: these are the values the stage's description took from the original's program run on a 68000.
 */
export const START_FIGURES: readonly (readonly StartFigure[])[] = Object.freeze([
  [
    figure('signal', 0x27e30, 0x16d, false, -94, 228, 198, 2),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('flag waver', 0x25fa4, 0x15e, true, 176, 0, 370, 1.232),
    figure('flag waver', 0x25eaa, 0x15f, true, 80, 0, 380, 1.305),
    figure('flag waver', 0x25edc, 0x160, true, 157, 0, 370, 1.232),
  ],
  [
    figure('signal lights', 0x2659e, 0x094, false, -180, 0, 360, 1.156),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x179, false, 149, 0, 384, 1.333),
    figure("driver's head", 0x27c96, 0x075, true, -141, 325, 204, 1.49),
    figure('open car', 0x27cbe, 0x15c, false, -141, 290, 204, 2),
    figure('coupe', 0x27606, 0x162, false, 119, 310, 206, 2),
    figure('coupe', 0x27606, 0x163, false, 328, 310, 208, 2),
    figure('pickup', 0x275d4, 0x164, false, 243, 310, 206, 2),
    figure('pickup', 0x275d4, 0x165, false, -11, 310, 208, 2),
  ],
  [
    figure('signal', 0x27e30, 0x16d, false, -94, 188, 198, 2),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x179, false, 149, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x17a, false, 194, 0, 384, 1.333),
  ],
  [
    figure('signal', 0x27e30, 0x16d, false, -94, 196, 198, 2),
    figure('ready girl', 0x27f8e, 0x166, false, 104, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x179, false, 149, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x17b, false, 194, 0, 384, 1.333),
    figure('ready girl', 0x27f8e, 0x17a, false, 244, 0, 384, 1.333),
    figure('guitarist', 0x2801a, 0x171, false, -128, 320, 206, 2),
    figure('man', 0x25edc, 0x10f, true, -500, 286, 211, 1),
    figure('man', 0x25edc, 0x15e, true, -486, 286, 211, 1),
    figure('man', 0x25e78, 0x15f, true, -320, 286, 211, 1),
    figure('man', 0x25eaa, 0x160, false, 320, 286, 211, 1),
    figure('girl', 0x27ef8, 0x17b, true, -200, 286, 210, 1),
    figure('girl', 0x27ec6, 0x17a, true, -232, 286, 210, 1),
    figure('girl', 0x27e94, 0x179, true, -264, 286, 210, 1),
    figure('girl', 0x27e62, 0x166, true, -296, 286, 210, 1),
    ...CROWD.map(([x, sizes, height]) => figure('crowd', sizes, 0x0e8, false, x, height, 209, 2)),
  ],
]);
