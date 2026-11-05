/**
 * The tables FINAL LAP 2's programs hold, read raw ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-tables)):
 * the courses' names, curve tables and road pictures, the lap and its line, the race's laps, the road's tiles and
 * colors, and an interval's length; each found by the instructions that read it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { metresAPosition } from '../shared/road-position.js';
import { FRAMES_A_SECOND, paletteAddress } from '../namco-system-2/display.js';
import { ROAD_COLUMNS } from '../namco-system-2/road.js';
import { DATA_BASE, type FinalLap2 } from './final-lap-2-rom.js';

/** The courses, in the order the programs number them. */
export const COURSES = 4;
/** A lap's road positions: the master's 0x740C counts laps as the position over 2^18. */
export const LAP_UNITS = 2 ** 18;
/** A curve table's interval: the slave's 0x1690 indexes it by the position over 256. */
export const INTERVAL_UNITS = 256;
export const INTERVALS = LAP_UNITS / INTERVAL_UNITS;
/** The road picture's step and tile row: the slave's 0x1400 streams a step of four tile rows each 0x40 units. */
export const STEP_UNITS = 0x40;
export const ROW_UNITS = STEP_UNITS / 4;

/** A long word at `at` of a program or the data. */
export const long = (p: Uint8Array, at: number) => ((word(p, at) << 16) | word(p, at + 2)) >>> 0;
/** A data address's place in the data. */
export const inData = (p: FinalLap2, address: number) => {
  const at = address - DATA_BASE;
  if (!(at >= 0 && at < p.data.length)) throw romDiffers(`0x${address.toString(16)} lies outside the data`);
  return at;
};

/**
 * The courses' names, as the course select shows them: its text's strings from the master's 0x2B88, `SELECT ` and the
 * name a string, 14 bytes each, ended by `@` (the text codes 0x2B80 to 0x2BA1 its 0x9F70 shows them by).
 */
export function readNames(p: FinalLap2): string[] {
  instruction(p.master, 0x9f70, [0x223c, 0x2b80, 0x2b81, 0x243c, 0x2ba0, 0x2ba1], "the course select's text");
  return Array.from({ length: COURSES }, (_, c) => {
    const text = new TextDecoder('latin1').decode(p.master.subarray(0x2b88 + 14 * c, 0x2b88 + 14 * (c + 1)));
    const match = /^SELECT ([A-Z]+) *@$/.exec(text);
    if (!match) throw romDiffers(`The course select's string ${c} is not a name`);
    return match[1]!;
  });
}

/**
 * The curve tables, left positive: course c's from the data address the slave's table at 0x31D4 holds for it (its
 * 0x1632), a signed byte an interval, the position over 256 (its 0x1690), 1024 a lap; a positive value turns right (its
 * 0x16C6 adds the curve's twice summed value to a line's offset, the road drawn the more right ahead), so each is taken
 * negated.
 */
export function readCurveTables(p: FinalLap2): number[][] {
  const [high, low] = instruction(p.slave, 0x1632, [0x4bf9, null, null], 'the curve tables');
  instruction(p.slave, 0x1690, [0xd083, 0xe488, 0xec48], "a curve table's index");
  instruction(p.slave, 0x16ac, [0x1035, 0x0000], "a curve table's reading");
  instruction(
    p.slave,
    0x16c6,
    [0x2006, 0xe880, 0x3211, 0x0641, 0x015a, 0x81c1, 0xd150],
    "a line's offset by the curve",
  );
  const table = (high! << 16) | low!;
  return Array.from({ length: COURSES }, (_, c) => {
    const at = inData(p, long(p.slave, table + 4 * c));
    return Array.from(p.data.subarray(at, at + INTERVALS), (b) => -((b << 24) >> 24));
  });
}

/**
 * The slope tables: course c's from the data address the slave's table at 0x31E4 holds for it (its 0x162C), a signed
 * byte an interval as a curve table's (its 0x1696). The slave's 0x16A2 steps a road line's depth by 0x4900 over 0x80 plus
 * the slope halved, so a slope draws the road's lines nearer or farther apart ([FINAL LAP 2's
 * heights](../../../docs/final-lap-2-road-data.md#its-heights)).
 */
export function readSlopeTables(p: FinalLap2): number[][] {
  const [high, low] = instruction(p.slave, 0x162c, [0x49f9, null, null], 'the slope tables');
  instruction(p.slave, 0x1696, [0x1234, 0x0000, 0x4881], "a slope table's reading");
  const table = (high! << 16) | low!;
  return Array.from({ length: COURSES }, (_, c) => {
    const at = inData(p, long(p.slave, table + 4 * c));
    return Array.from(p.data.subarray(at, at + INTERVALS), (b) => (b << 24) >> 24);
  });
}

/**
 * The start line: the master's 0x740C counts the laps as the position less 0x946 over 2^18, so the line lies 0x946
 * units into the table.
 */
export function readLine(p: FinalLap2): number {
  const [line] = instruction(
    p.master,
    0x740c,
    [0x2039, 0x0040, 0x9014, 0x0480, 0x0000, null, 0xd0ae, 0x0110, 0x2d40, 0x704c, 0x4840, 0xe440],
    'the laps counted from the line',
  );
  return line!;
}

/**
 * The race's laps: the master's 0x55C2 ends the race on lap ($714A & 3) + 2, counted from 0, and its 0x17F4 copies
 * $7140 on from the settings, a byte a word: the settings' byte 5 (MAME's default).
 */
export function readLaps(p: FinalLap2): number {
  instruction(p.master, 0x17f4, [0x41f9, 0x0018, 0x0000, 0x43ee, 0x7140], "the settings' copy");
  const [mask, last] = instruction(
    p.master,
    0x55c2,
    [0x302e, 0x714a, 0x0240, null, 0x0640, null, 0xb06e, 0x0150],
    "the race's last lap",
  );
  return (p.settings[(0x714a - 0x7140) / 2]! & mask!) + last! + 1;
}

/**
 * An interval's length, metres: the shown speed is `$30` over 8 times 0x287/0x200, 0x1C9/0x140 and 0x1B/0x3E8 (the
 * master's 0x782E), the position gains `$30` over 0x190 a tick on the level (its 0x6C3C and 0x6C84), and the program's
 * tick is a frame (its clock counts 0x3C a second, 0x78F6), so a speed shown as v km/h gains the position v times the
 * shown's factor over the gain's a tick.
 */
export function intervalMetres(p: FinalLap2) {
  const ops = instruction(
    p.master,
    0x782e,
    [0x202e, 0x0030, 0xe688, 0xc0fc, null, 0x80fc, null, 0xc0fc, null, 0x80fc, null, 0xc0fc, null, 0x80fc, null],
    'the shown speed',
  ) as number[];
  const [gain] = instruction(p.master, 0x6c3c, [0x202e, 0x0030, 0x80fc, null, 0x3d40, 0x010a], "the speed's gain");
  instruction(p.master, 0x6c84, [0xd179, 0x0040, 0x9018, 0x48c0, 0xd0b9, 0x0040, 0x9014], 'the position gained');
  const [second] = instruction(p.master, 0x78f6, [0x3d7c, null, 0x0162], "the clock's second");
  if (second !== 60) throw romDiffers("The master's clock does not count 60 ticks a second");
  const shown = (ops[0]! * ops[2]! * ops[4]!) / (8 * ops[1]! * ops[3]! * ops[5]!);
  const unit = metresAPosition(1, 1 / FRAMES_A_SECOND, 1 / gain! / shown);
  return { unit, interval: unit * INTERVAL_UNITS };
}

/**
 * Where the player stands at GO, units behind the line, and its x: the master's 0x58A6 places slot k at 0x708 − 200k,
 * the even slots at x 0x7D0; the player's slot 0.
 */
export function readGo(p: FinalLap2) {
  const [x] = instruction(p.master, 0x58b6, [0x3d7c, null, 0x0104], "the player's x at GO");
  const [place] = instruction(
    p.master,
    0x58d2,
    [0xc3fc, 0xff38, 0x0681, 0x0000, null, 0x23c1, 0x0040, 0x9014],
    "the player's place at GO",
  );
  return { behind: readLine(p) - place!, x: x! };
}

/**
 * The road's tiles as the slave's 0x138A writes them into the road's memory from its 0xB0B6: 0x70 pairs, each two
 * tiles' rows by turns, a row of each four bytes, written from its last row up, each word's two middle nibbles
 * exchanged (its 0x13B0); the first tile the road's tile 0.
 */
export function readRoadTiles(p: FinalLap2): Uint8Array {
  const [toHigh, toLow, fromHigh, fromLow] = instruction(
    p.slave,
    0x138a,
    [0x43f9, null, null, 0x45f9, null, null],
    "the road's tiles",
  );
  const [destination, source] = [((toHigh! << 16) | toLow!) >>> 0, ((fromHigh! << 16) | fromLow!) >>> 0];
  instruction(p.slave, 0x1396, [0x7e6f], "the road's tile pairs");
  instruction(
    p.slave,
    0x13b8,
    [0x3018, 0x3200, 0x3400, 0xe849, 0xe94a, 0x0240, 0xf00f, 0x0241, 0x00f0, 0x0242, 0x0f00],
    "a road tile's word",
  );
  if (destination !== 0x89003c) throw romDiffers("The road's tiles are not written from tile 0's last row");
  const tiles = new Uint8Array(0x70 * 2 * 64);
  for (let pair = 0; pair < 0x70; pair++)
    for (let half = 0; half < 2; half++)
      for (let row = 0; row < 16; row++)
        for (let k = 0; k < 2; k++) {
          const v = word(p.slave, source + 0x80 * pair + 4 * half + 8 * row + 2 * k);
          const swapped = (v & 0xf00f) | ((v >> 4) & 0xf0) | ((v << 4) & 0xf00);
          const at = (2 * pair + half) * 64 + 4 * (15 - row) + 2 * k;
          [tiles[at], tiles[at + 1]] = [swapped >> 8, swapped & 0xff];
        }
  return tiles;
}

/**
 * Course c's road picture's step `step` as the slave's 0x1400 streams it, a step each 0x40 units: its four rows of 64
 * tile words. The step's group of 32 takes a block from the course's table (the slave's table at 0x31C4), the block and
 * the step a row of 0x220000's, the row eight pairs of 0x222000's, each a 4 × 4 tile block of 0x230000's.
 */
export function readRoadStep(p: FinalLap2, course: number, step: number): number[][] {
  const [pictures] = instruction(p.slave, 0x141c, [0x41f9, 0x0000, null], 'the road pictures');
  instruction(p.slave, 0x1436, [0x43f9, 0x0022, 0x0000, 0x45f9, 0x0022, 0x2000], "the road picture's rows");
  instruction(p.slave, 0x149e, [0x267c, 0x0023, 0x0000], "the road picture's blocks");
  const blocks = inData(p, long(p.slave, pictures! + 4 * course));
  const block = p.data[blocks + ((step >> 5) & 0x7f)]!;
  const row = word(p.data, inData(p, 0x220000) + 2 * (((block << 5) & 0x1fe0) | (step & 0x1f)));
  const pairs = inData(p, 0x222000) + 32 * row;
  const words = Array.from({ length: 4 }, () => new Array<number>(ROAD_COLUMNS).fill(0));
  for (let k = 0; k < 8; k++)
    for (let j = 0; j < 2; j++) {
      const meta = word(p.data, pairs + 4 * k + 2 * j);
      const at = inData(p, 0x230000) + ((meta << 5) & 0x7fe0);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) words[r]![8 * k + 4 * j + c] = word(p.data, at + 8 * r + 2 * c);
    }
  return words;
}

/**
 * 256 palette entries from `entry` in RGB555 as the master's palette loads set them (its 0x374A): of the loads in its
 * list at `list` (a source and a destination each, 0 ending it), the one to `entry`'s place (`paletteAddress`), 256
 * entries from its data address, a word a channel, its high byte the channel's eight bits, red, green and blue in turn.
 */
export function readPaletteLoad(p: FinalLap2, list: number, entry: number): number[] {
  instruction(p.master, 0x3774, [0x301b, 0xe048, 0x30c0, 0x301b, 0xe048, 0x32c0], "the palette's loads");
  for (let at = list; long(p.master, at) !== 0; at += 8) {
    if (long(p.master, at + 4) !== paletteAddress(entry)) continue;
    const source = inData(p, long(p.master, at));
    return Array.from({ length: 256 }, (_, e) => {
      const channel = (k: number) => p.data[source + 6 * e + 2 * k]! >> 3;
      return (channel(0) << 10) | (channel(1) << 5) | channel(2);
    });
  }
  throw romDiffers(`The palette's loads at 0x${list.toString(16)} load no entry 0x${entry.toString(16)}`);
}

/** The road's palette, entries 0xF00 on: the first of the master's lists at 0x37D4, which every palette set loads. */
export const readRoadPalette = (p: FinalLap2): number[] => readPaletteLoad(p, long(p.master, 0x37d4), 0xf00);
