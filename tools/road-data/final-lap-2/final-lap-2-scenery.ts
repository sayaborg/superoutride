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

/** The classes of objects placed: the scenery the slave's 0x27D0 draws, and the underpass its 0x299A draws. */
export const SCENERY_CLASS = 3;
export const UNDERPASS_CLASS = 5;

/**
 * Course c's objects of class `cls` as the master's 0xD778 lists them, from its table at 0x11900: each entry four
 * words, its place (its step the word over 4, 12 bits), its lateral, its class and its kind, a place with its bit 15 set
 * ending it; its 0xD7F2 places an object at its step's first unit. Class 3 the scenery the slave's 0x27D0 draws, class
 * 5 the underpass its 0x299A draws (JAPAN's one).
 */
export function readScenery(p: FinalLap2, c: number, cls = SCENERY_CLASS): Scenery[] {
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
    if (word(p.master, at + 4) !== cls) continue;
    objects.push({
      step: (word(p.master, at) >> 2) & 0xfff,
      x: signed(word(p.master, at + 2)),
      kind: word(p.master, at + 6),
    });
  }
  return objects;
}

/**
 * A kind's picture as the slave lays it: its sprites' words by rows, top first (0 none; a word's bits 0 to 11 the
 * sprite, its bit 12 mirrored), each in its color (`colors`, else `color`), and its base point.
 */
export interface ObjectLayout {
  readonly color: number;
  readonly tiles: readonly (readonly number[])[];
  readonly colors?: readonly (readonly number[])[];
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

/** The underpass's rows and columns as 0x299A lays them, a sprite each: 6 rows of 16. */
const UNDERPASS = { rows: 6, columns: 16 } as const;

/**
 * The underpass as the slave's 0x299A lays it ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-objects)),
 * its sprites `s` pixels square (the caller's d5, 32 where a sprite is 1:1), each an entry {y (its top, up), sprite
 * word (four times the layout's; bit 14 mirrored), x (its left), attributes (its color the bits 4 to 7)}: its x the
 * caller's d2 less 8s, its beam's row d3 + 4s − s/4 (0x29C2 to 0x29D6), so 16 sprites across about x and its base
 * point s/4 above its bottom edge, as a class 3 layout's y. Its rows, from its top: the sign's two rows of 12 in the
 * middle, 0xE20 on and 0xE50 on (0x2ACA, 0x2AF4), their attributes' color 0xA (0x2AEC); beside the lower of them two
 * sprites 0xB2C at either end (0x29F6, 12s apart, 0x2A0A); the beam, 0xE80, 0xE84, 0xE88 twelve times, 0x4E84 and
 * 0x4E80 (0x2A34 to 0x2A5A); the walls' three rows of two at either end, 0xE8C on from the left (0x2A96) and 0x4E8C on
 * from the right (0x2A70); all but the sign in color 0xC (0x29D8).
 */
export function underpassLayout(p: FinalLap2): ObjectLayout {
  const at = (address: number, words: readonly (number | null)[], what: string) =>
    instruction(p.slave, address, words, `the underpass's ${what}`);
  at(
    0x29c2,
    [0x3205, 0xe549, 0xd243, 0x3605, 0xe44b, 0x9243, 0xd246, 0x3605, 0xe74b, 0x4443, 0xd642],
    'beam row and left edge',
  );
  const [, , , , color] = at(0x29d8, [0x3839, 0x0010, 0x532a, 0x0644, null], 'attributes');
  const [edge] = at(0x29f6, [0x343c, null, 0x7e02], 'sign row ends');
  at(0x2a0a, [0x3e05, 0xde47, 0xde45, 0xe54f, 0xd647, 0x7e02], "sign row's right end");
  const [beam] = at(0x2a34, [0x343c, null, 0x7e02], 'beam');
  at(0x2a4a, [0x7e0c], "beam's middle");
  const [beamRight] = at(0x2a5a, [0x343c, null, 0x7e02], "beam's right end");
  const [wallRight] = at(0x2a70, [0x343c, null, 0x9645, 0x9245, 0x7c03, 0x7e02], 'right wall');
  const [wallLeft] = at(0x2a96, [0x343c, null], 'left wall');
  at(0x2aac, [0x7c03, 0x7e02], "left wall's rows");
  const [sign] = at(0x2aca, [0x343c, null], 'sign');
  const [, , , signColor] = at(0x2aec, [0x0244, 0xff0f, 0x0644, null, 0x7c02, 0x7e0c], "sign's color");
  const { rows, columns } = UNDERPASS;
  const words = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  const colorsOf = Array.from({ length: rows }, () => new Array<number>(columns).fill((color! >> 4) & 0xf));
  // The sign: its two rows from the top, the middle twelve columns.
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 12; k++) {
      words[r]![2 + k] = sign! + 4 * (12 * r + k);
      colorsOf[r]![2 + k] = (signColor! >> 4) & 0xf;
    }
  for (const k of [0, 1, 14, 15]) words[1]![k] = edge!;
  // The beam.
  words[2]!.splice(0, columns, beam!, beam! + 4, ...new Array<number>(12).fill(beam! + 8), beamRight!, beamRight! - 4);
  // The walls, two columns at either end of the three rows below, the right one from its edge inward.
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 2; k++) {
      words[3 + r]![k] = wallLeft! + 4 * (2 * r + k);
      words[3 + r]![columns - 1 - k] = wallRight! + 4 * (2 * r + k);
    }
  // A sprite word is four times a layout's, its bit 14 the layout's bit 12 (mirrored).
  const tiles = words.map((row) => row.map((w) => w >> 2));
  if (tiles.flat().some((t) => t & 0xe000)) throw romDiffers("An underpass sprite's word has a flag beyond mirroring");
  return { color: (color! >> 4) & 0xf, tiles, colors: colorsOf, x: (columns / 2) * 32, y: 32 / 4 };
}

/**
 * The underpass's opening in laterals either side of its lateral, as the master's 0xD26E tests the player's car against
 * a class 5 object (its handler in the table at 0xD0DE): within it the car passes, beyond it the walls hit
 * (`addi.w #$15E0, d0` and `cmpi.w #$2BC0, d0` at 0xD2A2).
 */
export function underpassOpening(p: FinalLap2): number {
  const handler = long(p.master, 0xd0de + 4 * UNDERPASS_CLASS);
  if (handler !== 0xd26e) throw romDiffers("The master's class 5 handler is not 0xD26E");
  const [half, width] = instruction(p.master, 0xd2a2, [0x0640, null, 0x0c40, null], "the underpass's opening");
  if (width !== 2 * half!) throw romDiffers("The underpass's opening is not alike either side");
  return half!;
}

/**
 * The underpass's passage either side of its place, table units, as the master's 0xD26E tests the player's car against
 * it: their positions each over 4 (`lsr.l #2`) within 0x64 of each other (`addi.w #$64, d1` and `cmpi.w #$C8, d1`),
 * where its walls hit; and where its sound plays, within 0x258 so (0xD27E).
 */
export function underpassReach(p: FinalLap2) {
  const [sound, soundSpan, walls, wallsSpan] = instruction(
    p.master,
    0xd26e,
    [
      0x2028,
      0x0004,
      0xe488,
      0x2229,
      0x0004,
      0xe489,
      0x9041,
      0x3200,
      0x0640,
      null,
      0x0c40,
      null,
      0x6450,
      0x33fc,
      0x0080,
      0x0046,
      0x0814,
      0x0641,
      null,
      0x0c41,
      null,
      0x643c,
    ],
    "the underpass's reach",
  );
  if (soundSpan !== 2 * sound! || wallsSpan !== 2 * walls!)
    throw romDiffers("The underpass's reach is not alike either side");
  return { walls: walls! << 2, sound: sound! << 2 };
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
