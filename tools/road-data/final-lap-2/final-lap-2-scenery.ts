/**
 * FINAL LAP 2's scenery ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-objects)): the
 * objects the master places along each course, each kind's picture as the slave lays its sprites, its hit width as the
 * master tests it, and an object's lateral in metres; each table found by the instructions that read it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { long, STEP_UNITS } from './final-lap-2-road.js';

/** An object along a course: its step (0x40 units from its table's start), its lateral and its kind. */
export interface Scenery {
  readonly step: number;
  readonly x: number;
  readonly kind: number;
}

const signed = (v: number) => (v << 16) >> 16;

/**
 * Course c's scenery as the master's 0xD778 lists it, from its table at 0x11900: each entry four words, its place (its
 * step the word over 4, 12 bits), its lateral, its class and its kind, a place with its bit 15 set ending it; its
 * 0xD7F2 places an object at its step's first unit. Its class 3 objects, the scenery the slave's 0x27D0 draws.
 */
export function readScenery(p: FinalLap2, c: number): Scenery[] {
  const [high, low] = instruction(p.master, 0xd782, [0x41f9, null, null], 'the scenery');
  instruction(
    p.master,
    0xd788,
    [0x3039, 0x0040, 0xd000, 0xe548, 0x2070, 0x0000, 0x3018, 0x6b12, 0xe448, 0x0240, 0x0fff],
    "a course's scenery",
  );
  instruction(p.master, 0xd7f2, [0x3018, 0x48c0, 0xed88], "an object's place");
  if (STEP_UNITS !== 1 << 6) throw romDiffers("An object's step is not the road picture's");
  const objects: Scenery[] = [];
  for (let at = long(p.master, ((high! << 16) | low!) + 4 * c); !(word(p.master, at) & 0x8000); at += 8) {
    // Class 3 its scenery; another class the slave draws otherwise (JAPAN's one of class 5, its 0x299A).
    if (word(p.master, at + 4) !== 3) continue;
    objects.push({
      step: (word(p.master, at) >> 2) & 0xfff,
      x: signed(word(p.master, at + 2)),
      kind: word(p.master, at + 6),
    });
  }
  return objects;
}

/** A kind's picture as the slave lays it: its sprites' words by rows, top first (0 none), and its base point. */
export interface ObjectLayout {
  readonly color: number;
  readonly tiles: readonly (readonly number[])[];
  /** The base point: `x` pixels from the picture's left, `y` pixels above its bottom edge. */
  readonly x: number;
  readonly y: number;
}

/**
 * Kind `kind`'s picture as the slave's 0x27D0 lays a class 3 object near: its entry in the table at 0x423C, a word its
 * color (its low four bits), then its layouts, the near one's address at the entry's sixth byte; a layout's words its
 * base point's x and y (pixels from its left and up from its bottom), its columns and rows, a word, then its sprites'
 * words a row each, from its top.
 */
export function objectLayout(p: FinalLap2, kind: number): ObjectLayout {
  const [high, low] = instruction(
    p.slave,
    0x27d0,
    [0x49f9, null, null, 0x3028, 0x0014, 0x0240, 0x007f, 0xe548, 0x2874, 0x0000, 0x315c, 0x006c],
    'the kinds',
  );
  instruction(p.slave, 0x2804, [0x584c, 0x2854, 0x361c, 0x4443], 'a near layout');
  instruction(p.slave, 0x2826, [0x3c1c, 0x301c], "a layout's columns and rows");
  instruction(p.slave, 0x2834, [0xd8fc, 0x0002], "a layout's word");
  const entry = long(p.slave, ((high! << 16) | low!) + 4 * (kind & 0x7f));
  const layout = long(p.slave, entry + 6);
  const [x, y, columns, rows] = [0, 1, 2, 3].map((k) => signed(word(p.slave, layout + 2 * k))) as [
    number,
    number,
    number,
    number,
  ];
  const tiles = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, k) => word(p.slave, layout + 10 + 2 * (r * columns + k))),
  );
  return { color: word(p.slave, entry) & 0xf, tiles, x, y };
}

/**
 * Kind `kind`'s hit half width in laterals, or none, as the master's 0xD4C6 tests the player's car against a class 3
 * object: kinds below 0x78, its near layout's columns (the table at 0x12938) × 256, beside the car's own 0x280.
 */
export function hitHalfWidth(p: FinalLap2, kind: number): number | null {
  const [high, low, last] = instruction(
    p.master,
    0xd4de,
    [0x49f9, null, null, 0x3229, 0x0014, 0x0241, 0x007f, 0x0c41, null, 0x6454, 0xe549, 0x2874, 0x1000, 0x286c, 0x0006],
    "an object's hit",
  );
  instruction(
    p.master,
    0xd4fc,
    [0x322c, 0x0004, 0x0241, 0x000f, 0xe949, 0xe949, 0x0641, 0x0280],
    "an object's hit width",
  );
  if ((kind & 0x7f) >= last!) return null;
  const layout = long(p.master, long(p.master, ((high! << 16) | low!) + 4 * (kind & 0x7f)) + 6);
  return (word(p.master, layout + 4) & 0xf) * 256;
}

/**
 * A lateral's metres beside the road's centre: the slave's 0x3038 places an object's lateral over 16 times
 * 0x158A6 / (line + 0x15A) over 256 times 0x452 / 0x2C0 screen pixels from the road's, where a road pixel is
 * 0x87C2C0 / 16 / 1024 / (line + 0x15A) of them (`roadPixelMetres`'s), at every line.
 */
export function lateralMetres(p: FinalLap2, roadPixel: number): number {
  const [high, low] = instruction(
    p.slave,
    0x3038,
    [0x2a3c, null, null, 0x0641, 0x015a, 0x8ac1, 0x3028, 0x0002, 0xe840, 0xc1c5, 0xe080],
    "an object's lateral",
  );
  const [times, over] = instruction(p.slave, 0x304e, [0xc1fc, null, 0x81fc, null], "an object's lateral's scale");
  const [roadHigh, roadLow] = instruction(p.slave, 0x1622, [0x267c, null, null], 'the road lines');
  const screen = ((((high! << 16) | low!) / 16 / 256) * times!) / over!;
  const road = ((roadHigh! << 16) | roadLow!) / 16 / 1024;
  return (screen / road) * roadPixel;
}
