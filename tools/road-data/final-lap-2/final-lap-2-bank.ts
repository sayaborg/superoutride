/**
 * The underpass's bank ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-objects)): the green
 * of face 2 the slave's 0x1CEE lays under the underpass's sprites in each frame they are drawn, from their row, x and
 * size, read from its instructions and laid as it lays it frame by frame, its size growing by one a frame to 32.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { HIDDEN, LAYER_TILE, layerTilePixels } from '../namco-system-2/tiles.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { layerPalette } from './final-lap-2-backgrounds.js';

/** Face 2's tile words in the C123's memory: 64 columns by 64 rows, a row 0x80 bytes. */
const FACE = { at: 0x404000, columns: 64, rows: 64, stride: 0x80 } as const;
/** The clear tile the master's 0x2EB8 fills the faces with at a race's start, and 0x1C56 clears them with. */
const CLEAR = 0x007f;
/** The size at which a sprite is drawn 1:1, its pixels. */
const ONE_TO_ONE = 32;

/**
 * Where MAME's driver (commit ed2b7bf7) puts the pictures on the screen: a sprite's x word less 0x50 plus 7 its left
 * column, 0x1FF less its y word less 0x50 plus 2 its top row; a C123 face's picture moved by its scroll registers
 * and, face 2, 45 columns and 24 rows.
 */
const DISPLAY = { spriteX: -0x50 + 7, spriteY: 0x1ff - 0x50 + 2, faceX: 45, faceY: 24 } as const;

/** What the slave's 0x1CEE reads its bank from, by its instructions. */
interface BankRoutine {
  /** The band's and the window's first addresses (0x1C76, 0x1C80) and the window's first pair (0x1ED4). */
  readonly bandAt: number;
  readonly windowAt: number;
  readonly windowFirst: number;
  /** Face 2's y: added to the row less a quarter of the size, one more where that is negative, at least `yFloor`. */
  readonly yOffset: number;
  readonly yFloor: number;
  /** Face 2's x: the sprites' x less this, then their size's eighth columns as `x` reads them (0x1D3C to 0x1DBC). */
  readonly xOffset: number;
  readonly xFlip: { readonly wide: number; readonly left: number; readonly right: number; readonly inner: number };
  /** The band's tile, its edge's first (its bottom k rows the band's), and the window's (0x1E32, 0x1E4A, 0x1E76). */
  readonly band: number;
  readonly edge: number;
  readonly window: number;
  /** Where the band and the window stop growing, pixels, and the window's most column pairs. */
  readonly bandLimit: number;
  readonly windowLimit: number;
  readonly pairs: number;
}

/** 0x1CEE's instructions, checked, and the numbers it lays its bank by. */
function bankRoutine(p: FinalLap2): BankRoutine {
  const at = (address: number, words: readonly (number | null)[], what: string) =>
    instruction(p.slave, address, words, `the underpass's bank's ${what}`);
  const [bandHigh, bandLow, windowHigh, windowLow] = at(
    0x1c76,
    [
      0x23fc,
      null,
      null,
      0x0010,
      0x0100,
      0x23fc,
      null,
      null,
      0x0010,
      0x0106,
      0x4279,
      0x0010,
      0x0104,
      0x4279,
      0x0010,
      0x010e,
      0x4279,
      0x0010,
      0x0110,
      0x4279,
      0x0010,
      0x010c,
      0x33fc,
      0x0001,
      0x0010,
      0x0112,
    ],
    'start',
  );
  at(0x1cee, [0x4a79, 0x0010, 0x0060, 0x6700, 0xff60, 0x4279, 0x0010, 0x0070, 0x13fc, 0x000a, 0x0010, 0x010a], 'mark');
  at(0x1d06, [0x33fc, 0x0002, 0x0042, 0x0024], "face 2's priority");
  const [floor, floorAgain, yOffset] = at(
    0x1d0e,
    [
      0x3039,
      0x0010,
      0x0062,
      0x3239,
      0x0010,
      0x0066,
      0xe449,
      0x9041,
      0x6a0c,
      0x0c40,
      null,
      0x6204,
      0x303c,
      null,
      0x5240,
      0x0640,
      null,
      0x33c0,
      0x0040,
      0x902a,
      0x33c0,
      0x0040,
      0x903a,
    ],
    "face 2's y",
  );
  const [xOffset, wide, left, right, leftAgain, inner] = at(
    0x1d3c,
    [
      0x3439,
      0x0010,
      0x0064,
      0x4442,
      0x0642,
      null,
      0x3639,
      0x0010,
      0x0066,
      0x3039,
      0x0010,
      0x010c,
      0x6728,
      0x3039,
      0x0010,
      0x0062,
      0x6b20,
      0x0c43,
      0x0007,
      0x6312,
      0x0442,
      0x0001,
      0x0c43,
      0x000b,
      0x6304,
      0x0443,
      0x0001,
      0x0443,
      0x0001,
      0x0443,
      0x0001,
      0x6000,
      0x0012,
      0x3039,
      0x0010,
      0x0066,
      0x0c40,
      0x0004,
      0x6304,
      0x0443,
      0x0001,
      0xe74b,
      0x0c43,
      null,
      0x6524,
      0x3802,
      0xd843,
      0x0c44,
      null,
      0x6b1a,
      0x3803,
      0x9842,
      0x0444,
      null,
      0x4444,
      0x6a06,
      0x343c,
      null,
      0x600a,
      0x3404,
      0x0442,
      null,
      0x6002,
      0xd443,
      0x33c2,
      0x0040,
      0x9028,
      0x33c2,
      0x0040,
      0x9038,
    ],
    "face 2's x",
  );
  at(
    0x1dc8,
    [0x3039, 0x0010, 0x010c, 0x660e, 0x3039, 0x0010, 0x0062, 0x6a06, 0x4ef9, 0x0000, 0x1de4, 0x4ef9, 0x0000, 0x1f40],
    'far or near',
  );
  const [bandLimit, band, bandAgain, edge] = at(
    0x1de4,
    [
      0x33fc,
      0x00d0,
      0x0040,
      0x903a,
      0x2079,
      0x0010,
      0x0100,
      0x3039,
      0x0010,
      0x0066,
      0x0240,
      0x003f,
      0x3c00,
      0xd040,
      0xd079,
      0x0010,
      0x0066,
      0x3e00,
      0xe348,
      0x0c40,
      null,
      0x6200,
      0x0060,
      0x3239,
      0x0010,
      0x0104,
      0x33c0,
      0x0010,
      0x0104,
      0x3400,
      0x9441,
      0x6300,
      0x004c,
      0x0241,
      0x0007,
      0xd441,
      0x0242,
      0x0018,
      0x6714,
      0x263c,
      null,
      null,
      0x7808,
      0x2103,
      0x2103,
      0x2103,
      0x2103,
      0x5344,
      0x66f4,
      0x0240,
      0x0007,
      0x0640,
      null,
      0x3200,
      0x4841,
      0x3200,
      0x303c,
      0x0008,
      0x2101,
      0x2101,
      0x2101,
      0x2101,
      0x5340,
      0x66f4,
      0xd1fc,
      0x0000,
      0x0080,
      0x23c8,
      0x0010,
      0x0100,
    ],
    'band',
  );
  const [windowTile, windowAgain, pairs, pairsAgain, firstHigh, firstLow] = at(
    0x1e70,
    [
      0x2079,
      0x0010,
      0x0106,
      0x283c,
      null,
      null,
      0x3239,
      0x0010,
      0x010e,
      0x3039,
      0x0010,
      0x0066,
      0x0c40,
      null,
      0x6304,
      0x303c,
      null,
      0x4846,
      0x3c00,
      0x4846,
      0x33c0,
      0x0010,
      0x010e,
      0x0c79,
      0x0004,
      0x0010,
      0x0066,
      0x630c,
      0x9079,
      0x0010,
      0x0112,
      0x4279,
      0x0010,
      0x0112,
      0x9041,
      0x6322,
      0x3439,
      0x0010,
      0x0110,
      0x3602,
      0x7a00,
      0x5888,
      0x2184,
      0x5000,
      0x0645,
      0x0080,
      0x5143,
      0x6af4,
      0x5340,
      0x66ea,
      0x23c4,
      null,
      null,
    ],
    'window',
  );
  const [windowLimit] = at(
    0x1eda,
    [
      0x3006,
      0xe348,
      0xd046,
      0x3206,
      0x0241,
      0xfffc,
      0xe249,
      0xd041,
      0xe249,
      0xd041,
      0x0240,
      0x00f8,
      0x0c40,
      null,
      0x6240,
      0x3239,
      0x0010,
      0x0110,
      0xb041,
      0x6336,
      0x33c0,
      0x0010,
      0x0110,
      0x9041,
      0x4846,
      0x91fc,
      0x0000,
      0x0080,
      0x23c8,
      0x0010,
      0x0106,
      0x2408,
      0x0282,
      0xffff,
      0xff80,
      0x2442,
      0x3206,
      0x0c46,
      0x0004,
      0x6302,
      0x5341,
      0x24c4,
      0x5341,
      0x66fa,
      0x5140,
      0x66d6,
      0x4e75,
      0x23c8,
      0x0010,
      0x0106,
      0x4e75,
    ],
    "window's height",
  );
  if (
    floor !== floorAgain ||
    left !== leftAgain ||
    band !== bandAgain ||
    windowTile !== windowAgain ||
    pairs !== pairsAgain
  )
    throw romDiffers("The underpass's bank's numbers are not read alike where it uses them twice");
  return {
    bandAt: (bandHigh! << 16) | bandLow!,
    windowAt: (windowHigh! << 16) | windowLow!,
    windowFirst: (firstHigh! << 16) | firstLow!,
    yOffset: yOffset!,
    yFloor: floor! - 0x10000,
    xOffset: xOffset!,
    xFlip: { wide: wide!, left: left! - 0x10000, right: right!, inner: inner! },
    band: band!,
    edge: edge!,
    window: windowTile!,
    bandLimit: bandLimit!,
    windowLimit: windowLimit!,
    pairs: pairs!,
  };
}

/** Face 2's words, written at their addresses: a write outside the face stops the conversion. */
class Face {
  readonly words = new Uint16Array(FACE.columns * FACE.rows).fill(CLEAR);
  write(address: number, word: number) {
    const k = (address - FACE.at) / 2;
    if (!Number.isInteger(k) || k < 0 || k >= this.words.length)
      throw romDiffers(`The underpass's bank writes 0x${address.toString(16)}, outside face 2`);
    this.words[k] = word;
  }
  /** A long's two words, the high one first. */
  pair(address: number, word: number) {
    this.write(address, word);
    this.write(address + 2, word);
  }
  at(row: number, column: number) {
    return this.words[row * FACE.columns + column]!;
  }
}

/**
 * Face 2 as 0x1CEE leaves it where the underpass is drawn far (its row word negative) in frames of size 1, 2, … `last`,
 * one a frame, from the state its 0x1C76 sets: each frame the band (0x1DE4 to 0x1E6A), all 64 columns, `6 × size`
 * pixels high, a row at most a frame, its top row its edge tile, until it would pass `bandLimit`; the window (0x1E70 to
 * 0x1F36), from column 0 by two columns a frame, as many pairs as the size (one fewer past 4, at most `pairs`), as high
 * as `3 × size + 3 × ⌊size/4⌋` cut to 8, until that would pass `windowLimit`. `pairs` is the routine's unless given.
 * With the band's and the window's heights, and the sizes the band and the window's columns last grew at.
 */
function bankFace(r: BankRoutine, last: number, pairs = r.pairs) {
  const face = new Face();
  let [bandAt, bandHeight, columns, windowHeight, windowAt, first] = [r.bandAt, 0, 0, 0, r.windowAt, 1];
  let [bandGrew, columnsGrew] = [0, 0];
  for (let size = 1; size <= last; size++) {
    // The band: 6 × size pixels high, a full row added where the height passes a tile's, its edge's rows the rest.
    const height = 6 * (size & 0x3f);
    if (height <= r.bandLimit && height > bandHeight) {
      const grows = ((height - bandHeight + (bandHeight & 7)) & 0x18) !== 0;
      bandHeight = height;
      let a = bandAt;
      const row = (tile: number) => {
        for (let k = 0; k < FACE.columns; k++) face.write((a -= 2), tile);
      };
      if (grows) row(r.band);
      row(r.edge + (height & 7));
      bandAt = a + FACE.stride;
      bandGrew = size;
    }
    // The window: a pair of columns for each pair it lacks, down its height's rows from its top.
    const shown = Math.min(size, pairs);
    let added = shown;
    if (size > 4) {
      added -= first;
      first = 0;
    }
    added -= columns;
    columns = shown;
    if (added > 0) {
      for (; added > 0; added--) {
        windowAt += 4;
        for (let down = 0, left = windowHeight; left >= 0; down += FACE.stride, left -= 8)
          face.pair(windowAt + down, r.window);
      }
      face.pair(r.windowFirst, r.window);
      columnsGrew = size;
    }
    // Its height: a row above for each 8 pixels it grows, as many pairs across as it has now.
    const rise = (3 * size + 3 * Math.floor(size / 4)) & 0xf8;
    if (rise <= r.windowLimit && rise > windowHeight) {
      for (let up = rise - windowHeight; up > 0; up -= 8) {
        windowAt -= FACE.stride;
        let a = windowAt & ~(FACE.stride - 1);
        for (let k = shown > 4 ? shown - 1 : shown; k > 0; k--, a += 4) face.pair(a, r.window);
      }
      windowHeight = rise;
    }
  }
  return { face, bandHeight, windowHeight, bandGrew, columnsGrew };
}

/**
 * The underpass's bank as its picture lays it under the sprites at 1:1 (size 32): face 2 as 0x1CEE leaves it in
 * frames of size 1 to 32, its window `2 × (32 − 1)` columns wide (the routine's most pairs, 0x13, left out, as its x
 * puts the stopped window's ends off the screen), with its rows by the face's: its band's rows, the window's, and the
 * band's tile and the face's columns from the sprites' left edge (`columnAt`). Checked: the band stops growing at size
 * 30 and the window's columns at 19 as the routine lays them; and by MAME's display (`DISPLAY`), where the underpass is
 * far its row 32's bottom on the sprites' bottom row, and its window 8 pixels inside the sprites' edges at sizes 5 to 18
 * (none at 1 to 4).
 */
export function underpassBank(p: FinalLap2) {
  const r = bankRoutine(p);
  const routine = bankFace(r, ONE_TO_ONE);
  if (routine.bandGrew !== 29) throw romDiffers("The underpass's band does not stop growing at size 30");
  if (routine.columnsGrew !== 19) throw romDiffers("The underpass's window's columns do not stop growing at size 19");
  checkDisplay(r);
  const { face, bandHeight, windowHeight } = bankFace(r, ONE_TO_ONE, ONE_TO_ONE);
  const bottomRow = (r.bandAt - FACE.at) / FACE.stride - 1;
  return {
    face,
    /** The face's row whose bottom pixel row lies on the sprites' bottom row. */
    bottomRow,
    bandHeight,
    windowHeight,
    /** The face's column `x` pixels right of the sprites' left edge: its window's column 0 eight pixels inside. */
    columnAt: (x: number) => ((Math.floor((x - 8) / 8) % FACE.columns) + FACE.columns) % FACE.columns,
    band: r.band,
  };
}

/**
 * The bank against the sprites on MAME's screen (`DISPLAY`), at 1:1 (a sprite `size` pixels): 0x299A's sprites' rows
 * from its beam's y word, the row word + 4 × size − ⌊size/4⌋, down by the size, its x the x word less 8 × size; face 2's
 * y and x as 0x1CEE sets them where the underpass is far. Stops where the bank's bottom row is not the sprites', or
 * its window not 8 pixels inside their edges at sizes 5 to 18 (none at 1 to 4).
 */
function checkDisplay(r: BankRoutine) {
  const wrap = (v: number) => ((v % 512) + 512) % 512;
  for (let size = 1; size <= ONE_TO_ONE; size++) {
    const quarter = Math.floor(size / 4);
    for (let v = r.yFloor; v < 0; v++) {
      const row = v + quarter;
      const lowest = (row + 4 * size - quarter - 3 * size) & 0x1ff;
      const spritesBottom = wrap(DISPLAY.spriteY - lowest + size - 1);
      const scroll = v + 1 + r.yOffset;
      const faceBottom = wrap(((r.bandAt - FACE.at) / FACE.stride) * 8 - 1 - scroll - DISPLAY.faceY);
      if (spritesBottom !== faceBottom)
        throw romDiffers(
          `The underpass's bank's bottom is ${faceBottom - spritesBottom} rows off its sprites' at size ${size}`,
        );
    }
  }
  const bottom = (r.bandAt - FACE.at) / FACE.stride - 1;
  for (let size = 1; size <= 18; size++) {
    const { face } = bankFace(r, size);
    let shown = 0;
    while (shown < FACE.columns && face.at(bottom, shown) === r.window) shown++;
    const x = 0x100;
    const eighths = 8 * (size > 4 ? size - 1 : size);
    if (eighths >= r.xFlip.wide) throw romDiffers("The underpass's window is laid as a wide one below size 19");
    const windowLeft = -(-x + r.xOffset + eighths) - DISPLAY.faceX;
    const spritesLeft = x - 8 * size + DISPLAY.spriteX;
    const inside = size > 4 ? 8 : 0;
    if (windowLeft - spritesLeft !== inside || spritesLeft + 16 * size - (windowLeft + 8 * shown) !== inside)
      throw romDiffers(`The underpass's window is not ${inside} pixels inside its sprites' edges at size ${size}`);
  }
}

/**
 * The bank's pixels under course `c`'s underpass's sprites, `width` by `height` pixels at 1:1, their bottom row the
 * bank's (`underpassBank`), with `beside` pixels of its band either side beyond the sprites' edges (as at their edges,
 * the face's wrapping left out): RGB555, or −1 where nothing shows. Its colors face 2's, its color register the
 * master's 0x2EA0 sets.
 */
export function underpassGround(p: FinalLap2, c: number, width: number, height: number, beside: number) {
  const bank = underpassBank(p);
  const [register] = instruction(p.master, 0x2ea0, [0x33fc, null, 0x0042, 0x0034], "face 2's colors");
  const colors = layerPalette(p, c, register!);
  const tiles = new Map<number, Int16Array>();
  const tile = (word: number) =>
    tiles.get(word) ?? tiles.set(word, layerTilePixels(p.characters, p.tileMask, word)).get(word)!;
  const across = width + 2 * beside;
  const rgb = new Int32Array(across * height).fill(-1);
  const bottom = (bank.bottomRow + 1) * LAYER_TILE;
  for (let y = 0; y < height; y++) {
    const faceY = bottom - (height - y);
    if (faceY < 0) continue;
    for (let x = 0; x < across; x++) {
      const at = Math.min(width - 1, Math.max(0, x - beside));
      const pen = tile(bank.face.at(faceY >> 3, bank.columnAt(at)))[(faceY & 7) * LAYER_TILE + ((at - 8) & 7)]!;
      if (pen !== HIDDEN) rgb[y * across + x] = colors[pen]!;
    }
  }
  // What the face shows above the picture's top: nothing.
  for (let y = 0; y < bottom - height; y++)
    for (let column = 0; column < 64; column++)
      if (tile(bank.face.at(y >> 3, column)).some((pen, k) => k >> 3 === (y & 7) && pen !== HIDDEN))
        throw romDiffers("The underpass's bank reaches above its sprites' top");
  return { rgb, bank };
}
