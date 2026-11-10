/**
 * CONTINENTAL CIRCUS's things as its sub program places and draws them ([CONTINENTAL CIRCUS road
 * data](../../../docs/continental-circus-road-data.md#its-things)): a thing record (command 2, 4 or 7) names a
 * description, which the stream task copies into a slot of 32 bytes and its pieces into the sprite list (S 0xC112 to
 * 0xC19C), and the slot task draws each frame by its type (S 0x2DC6 to 0x2E1A) and hits as its car passes it (S 0x2B16
 * to 0x2DC4). A description is a word, its type; four longs, its lateral, its height, and the bounds of the car's x it
 * hits; a word of flags; its columns and rows less one; its pieces' count; and two words a piece, its sprite and its
 * palette line, row by row from its top left. Each piece is a sprite of 128 × 128 pixels at its full size, the zoom of
 * its distance's line 0x7F, the only such line its own car's (`CAR_DISTANCE`), where a lateral or a height over that
 * distance is a pixel.
 */
import { instruction, long, sword, u8, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { BIG_SPRITE } from '../taito/z-sprites.js';
import { CAR_DISTANCE, carLimit, xPixels } from './continental-circus-road-picture.js';

/** A description's types the courses use, by the jump tables the slot task hits and draws them by. */
export const THING_TYPE = Object.freeze({
  /** A band across the screen, three sprites at their full size from its lateral (S 0x6DCE): MONACO's tunnel's ceiling. */
  ceiling: -1,
  /** A band of fixed width, three sprites of their full width from its lateral outward (S 0x6CE0): a side face. */
  sideFace: 0,
  /** A thing whose pieces its zoom scales on both axes (S 0x6B36, S 0x6BF6), hit as the car passes it (S 0x2D60). */
  standing: 1,
  /** A checkpoint: it sets bit 0 of 0x84564 (S 0x2D54), on which S 0x115C adds 0x12C to the word 0x8458A. */
  checkpoint: 2,
  /** The goal: it sets the goal flag, bit 7 of 0x84565 (S 0x2BF8). */
  goal: 3,
  /** A tunnel's start and end: it sets and clears bit 3 of 0x845B0 with their sounds (S 0x2C1A, 0x2CB4). */
  tunnelStart: 5,
  tunnelEnd: 6,
} as const);

/** A description's bytes before its pieces, and a piece's. */
const HEAD_BYTES = 0x1a;
const PIECE_BYTES = 4;
/** The flags' bits: the sprite's flip across, and (a side face's alone, S 0x6D6A) the road drawn over it. */
const FLIP_X = 0x4000;
const BEHIND_ROAD = 0x8000;
/** A band's columns, fixed (`moveq #2, d5`, S 0x6D74, 0x6E62), and their step on the screen, pixels (S 0x6DAC, 0x6E8A). */
const BAND_COLUMNS = 3;
const BAND_STEP = 0x80;
/** The zoom at which a sprite is drawn at its full size. */
const FULL = 0x7f;

/**
 * A piece at its full size: its sprite, its palette line, its cell's top left (pixels from the thing's point on the
 * ground at its lateral, down positive) and its flip across.
 */
export interface ContinentalCircusPiece {
  readonly sprite: number;
  readonly line: number;
  readonly x: number;
  readonly y: number;
  readonly flipX: boolean;
}

/**
 * A description: its address and type, its lateral and its height as the program holds them (`units`, lateral units,
 * right and down positive), its lateral and height at its full size (pixels, whole as the program divides them), its
 * pieces in the order the sprite list draws them, the first over those after it, whether a side face lies behind the
 * road, and the range of its own car's centre it hits (pixels from the thing's lateral, right positive, `from` <
 * `to`), null where none (its type a ceiling's, or a range beyond the car's reach).
 */
export interface ContinentalCircusThing {
  readonly address: number;
  readonly type: number;
  readonly units: { readonly lateral: number; readonly height: number };
  readonly lateral: number;
  readonly height: number;
  readonly pieces: readonly ContinentalCircusPiece[];
  readonly behindRoad: boolean;
  readonly hit: { readonly from: number; readonly to: number } | null;
}

/**
 * The instructions a description is read by: the stream task's copy into a slot and the sprite list (S 0xC112 to
 * 0xC184); the slot task's draw by type (S 0x2DDA to 0x2DF8) and hit (S 0x2D60 to 0x2D6A); a drawing's place, the
 * lateral and height over the distance, half the zoom left and down, about its point (S 0x6C36 to 0x6C48), its
 * columns at the zoom's pixels apart, then its rows (S 0x6CBE to 0x6CCC), one piece's alike (S 0x6B8C); a side face's
 * and a ceiling's three columns 0x80 pixels apart, their flags (S 0x6D1C to 0x6DAC, 0x6E1A to 0x6E8A, 0x6D6A, 0x6C7C);
 * and the zoom by the distance's line (S 0x6C02 to 0x6C14), 0x7F at its own car's.
 */
function checkDescriptions(sub: Uint8Array) {
  instruction(sub, 0xc112, [0x2468, 0x0004], "a record's description (movea.l $4(a0))");
  instruction(
    sub,
    0xc130,
    [0x375a, 0x001c, 0x275a, 0x0004, 0x275a, 0x0008, 0x275a, 0x0014, 0x275a, 0x0018, 0x3c1a, 0x375a, 0x0010],
    "its type, lateral, height, hit's bounds, flags and columns (move.w, move.l)",
  );
  instruction(sub, 0xc14a, [0x375a, 0x0012], 'its rows (move.w)');
  instruction(sub, 0xc156, [0x341a], "its pieces' count (move.w)");
  instruction(sub, 0xc174, [0x3952, 0x0002, 0x395a, 0x06e2, 0x3952, 0x0006], "a piece's sprite and line (move.w)");
  instruction(sub, 0xc184, [0x3946, 0x0004], "a piece's flags (move.w d6)");
  instruction(sub, 0x2dda, [0x2f28, 0x0008, 0x2f28, 0x0004], 'the height and the lateral drawn (move.l)');
  instruction(sub, 0x2de4, [0x2e28, 0x0010, 0x660a, 0x4eba], 'one piece, or columns and rows (move.l, bne)');
  instruction(sub, 0x2df4, [0x4a68, 0x001c, 0x6e1a, 0x670c], 'drawn by its type (tst.w, bgt, beq)');
  instruction(sub, 0x2d60, [0xb6a8, 0x0014, 0x6e60, 0xb6a8, 0x0018, 0x6f5a], "the car's x it hits (cmp.l, bgt, ble)");
  const [lh, ll] = instruction(sub, 0x6c02, [0x41f9, null, null, 0x4244, 0x1830, 0x0000], "a distance's line (lea)");
  const [zoomsAfter] = instruction(sub, 0x6c10, [0x41fa, null, 0x3630, 0x4000], "the lines' zooms (lea, pc, move.w)");
  const zooms = 0x6c12 + ((zoomsAfter << 16) >> 16);
  instruction(sub, 0x6c36, [0x83c0, 0x85c0], 'the lateral and the height over the distance (divs.w)');
  instruction(sub, 0x6c42, [0x3c03, 0xe24e, 0x9246, 0xd446], 'half the zoom left and down (lsr.w, sub.w, add.w)');
  instruction(sub, 0x6cbe, [0xd243, 0x5241], 'the next column, the zoom and a pixel on (add.w, addq.w)');
  instruction(sub, 0x6cca, [0xd443, 0x5242], 'the next row, the zoom and a pixel down (add.w, addq.w)');
  instruction(sub, 0x6d1c, [0x83c0, 0x6c04, 0x0441, BAND_COLUMNS * BAND_STEP], 'a side face on the left (bge, subi)');
  instruction(sub, 0x6d74, [0x7a00 | (BAND_COLUMNS - 1)], "a side face's columns (moveq #2)");
  instruction(sub, 0x6dac, [0x0641, BAND_STEP], "a side face's next column (addi.w #$80)");
  instruction(sub, 0x6e62, [0x7a00 | (BAND_COLUMNS - 1)], "a ceiling's columns (moveq #2)");
  instruction(sub, 0x6e8a, [0x0641, BAND_STEP], "a ceiling's next column (addi.w #$80)");
  instruction(sub, 0x6b8c, [0x3803, 0xe24c, 0x9244, 0xd444], "one piece's half zoom left and down (lsr.w)");
  instruction(sub, 0x6d32, [0x3c03, 0xe24e, 0xd446], "a side face's half zoom down alone (lsr.w, add.w)");
  instruction(sub, 0x6d6a, [0x0246, 0xc000], "a side face's flags, its flip and the road over it (andi.w)");
  instruction(sub, 0x6c7c, [0x0246, 0x4000], "a scaled thing's flags, its flip alone (andi.w)");
  instruction(sub, 0x6e1a, [0xd443, 0xd643], "a ceiling's whole zoom down (add.w)");
  if (word(sub, zooms + 2 * u8(sub, lh * 0x10000 + ll + CAR_DISTANCE)) !== FULL)
    throw romDiffers("Its own car's line does not draw a sprite at its full size");
}

/**
 * A drawing's cells at its full size, row by row from its top left, each the next sprite's width right and its height
 * down, its lateral and height as the program holds them (`lateralUnits`, `heightUnits`) over its own car's distance,
 * whole as the program divides them: a thing scaled on both axes and a side face lie a sprite's height above and below
 * their point's height, a scaled one's columns half a sprite either side of its lateral (the half pixel by which the
 * program's half of zoom 0x7F falls short, and the chips' line offsets, aside: not confirmed), a side face's from its
 * lateral rightward, or leftward on the left; a ceiling's top at its height, its columns from its lateral (S 0x6E1A). A
 * cell of sprite 0 is not drawn (the sprite list's merge passes it, S 0x2508; MAME's description).
 */
function laidCells(
  type: number,
  lateralUnits: number,
  heightUnits: number,
  columns: number,
  cells: readonly { readonly sprite: number; readonly line: number }[],
  flipX: boolean,
) {
  const lateral = Math.trunc(lateralUnits / CAR_DISTANCE);
  const height = Math.trunc(heightUnits / CAR_DISTANCE);
  const [x0, y0] =
    type === THING_TYPE.ceiling
      ? [0, height]
      : type === THING_TYPE.sideFace
        ? [lateral < 0 ? -BAND_COLUMNS * BAND_STEP : 0, height - BIG_SPRITE / 2]
        : [-BIG_SPRITE / 2, height - BIG_SPRITE / 2];
  const pieces = cells.flatMap(({ sprite, line }, k): ContinentalCircusPiece[] =>
    sprite
      ? [{ sprite, line, x: x0 + BIG_SPRITE * (k % columns), y: y0 + BIG_SPRITE * Math.floor(k / columns), flipX }]
      : [],
  );
  return { lateral, height, pieces: Object.freeze(pieces) };
}

/**
 * The description at `address` at its full size (`laidCells`), its car's x `xPixels` pixels a unit at its own car's
 * line: its pieces in a grid of its columns and rows. It hits its own car whose x lies above its fourth long and up to its third
 * while it lies within 0x100 positions of the car along the road (S 0x2B2A to 0x2B36), the car's lateral the negative
 * of its x (the road's lines moved by it, S 0x26E0 to 0x26EC), where its car can reach.
 */
function readDescription(sub: Uint8Array, address: number, unitPixels: number, reach: number) {
  const type = sword(sub, address);
  const [lateralUnits, heightUnits, high, low] = [2, 6, 10, 14].map((k) => long(sub, address + k) | 0) as [
    number,
    number,
    number,
    number,
  ];
  const flags = word(sub, address + 0x12);
  const [columns, rows, count] = [
    word(sub, address + 0x14) + 1,
    word(sub, address + 0x16) + 1,
    word(sub, address + 0x18),
  ];
  if (columns * rows !== count) throw romDiffers(`The description at 0x${address.toString(16)} is no grid`);
  if (type <= THING_TYPE.sideFace && columns !== BAND_COLUMNS)
    throw romDiffers(`The band at 0x${address.toString(16)} is not ${BAND_COLUMNS} columns`);
  const cells = Array.from({ length: count }, (_, k) => {
    const at = address + HEAD_BYTES + PIECE_BYTES * k;
    return { sprite: word(sub, at), line: word(sub, at + 2) >> 8 };
  });
  const { lateral, height, pieces } = laidCells(type, lateralUnits, heightUnits, columns, cells, !!(flags & FLIP_X));
  // The car's x within (low, high], its lateral within [−high, −low); none where that lies wholly beyond its reach.
  const [from, to] = [-high * unitPixels, -low * unitPixels];
  const hits = type !== THING_TYPE.ceiling && from < to && to > -reach && from < reach;
  return Object.freeze({
    address,
    type,
    units: Object.freeze({ lateral: lateralUnits, height: heightUnits }),
    lateral,
    height,
    pieces,
    behindRoad: type === THING_TYPE.sideFace && !!(flags & BEHIND_ROAD),
    hit: hits ? Object.freeze({ from: from - lateral, to: to - lateral }) : null,
  });
}

/**
 * A reader of CONTINENTAL CIRCUS's descriptions from its sub program, each by its address (a thing record's argument),
 * its car's reach its limits either side of its road's centre (`carLimit`).
 */
export function continentalCircusThings(sub: Uint8Array): (address: number) => ContinentalCircusThing {
  checkDescriptions(sub);
  const [unitPixels, reach] = [xPixels(sub), carLimit(sub)];
  const read = new Map<number, ContinentalCircusThing>();
  return (address) => {
    if (!read.has(address)) read.set(address, readDescription(sub, address, unitPixels, reach));
    return read.get(address)!;
  };
}

/**
 * A zone's side face ([Its bands](../../../docs/continental-circus-road-data.md#its-bands)): the zone task (S 0x2E3C)
 * draws one for a zone of the kind its `cmpi.w` names (S 0x2F28), a side face (S 0x6CE0, its arguments its rows less
 * one, its distance, lateral and height, S 0x6CE8, 0x6D14, 0x6DC0) of its sprite in every cell of its palette line (S
 * 0x2F3E to 0x2F72), its flags none it sets, at its lateral and height (S 0x2F78), its rows' count (S 0x2F96), hitting
 * nothing; at the distance of its zone's end from the car, at most 0x7FFF, and `nearer` positions nearer where that lies
 * from `from` to `to` (S 0x2EA2, 0x2EF6, 0x2F84 to 0x2F90). Its address the code that draws it.
 */
export function zoneSideFace(sub: Uint8Array) {
  instruction(sub, 0x2ea2, [0x2a28, 0x0006, 0x9a81], "a zone's end from the car (move.l, sub.l)");
  instruction(sub, 0x2ef6, [0x0c85, 0x0000, 0x7fff, 0x6f04, 0x3a3c, 0x7fff], 'at most 0x7FFF (cmpi.l, ble, move.w)');
  instruction(sub, 0x2f20, [0x3828, 0x0000, 0x6a00], "a zone's kind, its bit 15 set (move.w, bpl.w)");
  const [kind] = instruction(sub, 0x2f28, [0x0c44, null, 0x667c], "the side face's kind (cmpi.w, bne)");
  const [sprite, lineWord] = instruction(sub, 0x2f3e, [0x383c, null, 0x3e3c, null], 'its sprite and line (move.w)');
  const cells = Array.from({ length: BAND_COLUMNS * 2 }, (_, k) => 0x10 * k);
  instruction(
    sub,
    0x2f46,
    cells.flatMap((at) => [0x3944, at + 2]),
    "each cell's sprite (move.w d4)",
  );
  instruction(
    sub,
    0x2f5e,
    cells.flatMap((at) => [0x3947, at + 6]),
    "each cell's line (move.w d7)",
  );
  const [hh, hl, lh, ll] = instruction(
    sub,
    0x2f78,
    [0x2f3c, null, null, 0x2f3c, null, null],
    'its height and lateral (move.l #)',
  );
  const [from, to, nearer] = instruction(
    sub,
    0x2f84,
    [0x0c45, null, 0x6d0a, 0x0c45, null, 0x6e04, 0x0445, null],
    'nearer within a stretch (cmpi.w, blt, cmpi.w, bgt, subi.w)',
  );
  const [lastRow] = instruction(sub, 0x2f94, [0x3f05, 0x3f3c, null, 0x4eba, 0x3d44], 'its rows less one (jsr $6ce0)');
  instruction(sub, 0x6ce8, [0x302e, 0x000a], "a side face's distance (move.w $a(a6))");
  instruction(sub, 0x6d14, [0x222e, 0x000c, 0x242e, 0x0010], "a side face's lateral and height (move.l)");
  instruction(sub, 0x6dc0, [0x536e, 0x0008], "a side face's rows (subq.w $8(a6))");
  if ((lastRow + 1) * BAND_COLUMNS !== cells.length) throw romDiffers("A zone's side face's cells are not its rows'");
  const units = { lateral: (lh << 16) | ll, height: (hh << 16) | hl };
  const laid = laidCells(
    THING_TYPE.sideFace,
    units.lateral,
    units.height,
    BAND_COLUMNS,
    cells.map(() => ({ sprite, line: lineWord >> 8 })),
    false,
  );
  const face: ContinentalCircusThing = Object.freeze({
    address: 0x2f28,
    type: THING_TYPE.sideFace,
    units: Object.freeze(units),
    ...laid,
    behindRoad: false,
    hit: null,
  });
  return Object.freeze({ kind, face, nearer: Object.freeze({ from, to, by: nearer }) });
}
