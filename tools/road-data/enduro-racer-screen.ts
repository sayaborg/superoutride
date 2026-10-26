/**
 * ENDURO RACER's screen as its programs draw it ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-screen)),
 * which the grades' rule reads back: the main CPU's 16 slope words at each road position (the normal path, the hills,
 * stage 3) and the sub CPU's layout of the road's lines by them, each line at its distance ahead of the bike.
 */
import { UNITS_A_LINE } from './enduro-racer-cross-section.js';
import { readHills, STAGE_POSITIONS, type Hill } from './enduro-racer-road.js';
import type { EnduroRacerPrograms } from './enduro-racer-rom.js';
import { instruction, sword } from './program-words.js';

/** The normal path's cycle, positions: its slope table is indexed by the position's low byte. */
export const CYCLE = 256;
/** The slope words: 16, word 0 the farthest; all of them 0x200 on a level road. */
const WORDS = 16;
const LEVEL_WORD = 0x200;
/** A word nearer 0 than this is drawn at it: the normal path makes ±0x40 of −0x40 to 0x40, a hill −0x40 of −0x3F to −1. */
const LEAST_WORD = 0x40;
/** The slope table T: 320 words, four summed a word from the position's low byte. */
const SLOPE_TABLE = 0xdae4;
const SLOPE_TABLE_LENGTH = 320;
/** Stage 3's words, level. */
const STAGE_3_WORDS = 0xdd84;
/** Stage 3 (the third stage, 0 from) shows its own words whatever else runs. */
export const STAGE_3 = 2;

/**
 * The objects' law: an object x units wide d positions ahead of the bike is `OBJECT_SCALE` x / (d + `READING_CAMERA`)
 * pixels, the level camera the grades' rule reads ENDURO RACER through standing at its eye, this far behind the bike.
 */
const OBJECT_SCALE = 4.2456;
export const READING_CAMERA = 4.19;
/** A road ROM line's distance law: line r lies `LINE_LAW` / (r + 3) − `READING_CAMERA` positions ahead of the bike. */
const LINE_LAW = UNITS_A_LINE * OBJECT_SCALE;

/** The road ROM's lines laid, 1 the farthest to 129 the nearest, taken by eighths, near to far. */
const NEAREST_LINE = 129;
const LINE_STEP = 1 / 8;
export const ROAD_LINES = Float64Array.from(
  { length: (NEAREST_LINE - 1) / LINE_STEP + 1 },
  (_, i) => NEAREST_LINE - i * LINE_STEP,
);

/** Each laid line's distance ahead of the bike, positions, near to far. */
export const LINE_DISTANCES = ROAD_LINES.map((r) => LINE_LAW / (r + 3) - READING_CAMERA);

/**
 * The level road's reach: its line r lies (bottom − top)(r − 1)/128 rows below its horizon (`top` − 4 × that ÷ 128),
 * so a line's rows below the horizon times its distance from the eye, rows × positions, are (bottom − top) `LINE_LAW` / 128.
 */
export const levelReach = (screen: EnduroRacerScreen) => ((screen.bottom - screen.top) * LINE_LAW) / (NEAREST_LINE - 1);

const s16 = (v: number) => (v << 16) >> 16;

/** The tables and the rows the screen is drawn from, each found by the instruction that names it. */
export interface EnduroRacerScreen {
  /** The slope table T. */
  readonly slopes: readonly number[];
  readonly hills: readonly Hill[];
  /** Stage 3's 16 words. */
  readonly stage3: readonly number[];
  /** The road's top row, where the main CPU lowers its horizon in a race, and its bottom row. */
  readonly top: number;
  readonly bottom: number;
}

/**
 * The screen's tables and rows, their instructions checked: the slope table's `lea` at M 0xDA60, stage 3's at M 0xDACC
 * and its test at M 0xDAC2, the horizon lowered to its row at M 0x7C88, and the road's bottom row at S 0x768.
 */
export function readEnduroRacerScreen({ main, mainInstructions, sub }: EnduroRacerPrograms): EnduroRacerScreen {
  instruction(mainInstructions, 0xda60, [0x41fa, SLOPE_TABLE - 0xda62], 'the slope table (lea $DAE4(pc))');
  instruction(mainInstructions, 0xdacc, [0x41fa, STAGE_3_WORDS - 0xdace], "stage 3's words (lea $DD84(pc))");
  instruction(mainInstructions, 0xdac2, [0x0c79, STAGE_3, 0x0004, 0x040e], 'stage 3 tested (cmpi.w #2, $4040E)');
  const [top] = instruction(
    mainInstructions,
    0x7c88,
    [0x0c6d, null, 0x0044],
    "the race's horizon (cmpi.w #$40, $44(a5))",
  );
  const [bottom] = instruction(sub, 0x768, [0x223c, 0x0000, null], "the road's bottom row (move.l #$E5, d1)");
  const words = (address: number, length: number) => Array.from({ length }, (_, i) => sword(main, address + 2 * i));
  return Object.freeze({
    slopes: Object.freeze(words(SLOPE_TABLE, SLOPE_TABLE_LENGTH)),
    hills: Object.freeze(readHills(main)),
    stage3: Object.freeze(words(STAGE_3_WORDS, WORDS)),
    top: top!,
    bottom: bottom!,
  });
}

/**
 * The normal path's words at position P (M 0xDA48): buf[i] the 16-bit sum of T[(P & 0xFF) + 4i] to T[… + 3], i 0 the
 * nearest; d3 the 16-bit sum of buf[0] to buf[3] shifted right 6 bits; word 15 − i = 0x200 − buf[i] − i × d3, one from
 * −0x40 to 0x40 made ±0x40 (0 made +0x40).
 */
export function normalWords(slopes: readonly number[], position: number): Int16Array {
  const low = position & 0xff;
  const buf = Array.from({ length: WORDS }, (_, i) =>
    s16(slopes[low + 4 * i]! + slopes[low + 4 * i + 1]! + slopes[low + 4 * i + 2]! + slopes[low + 4 * i + 3]!),
  );
  const d3 = s16(buf[0]! + buf[1]! + buf[2]! + buf[3]!) >> 6;
  const out = new Int16Array(WORDS);
  let d2 = 0;
  buf.forEach((b, i) => {
    let word = s16(LEVEL_WORD - b - d2);
    if (-LEAST_WORD <= word && word <= LEAST_WORD) word = word >= 0 ? LEAST_WORD : -LEAST_WORD;
    out[WORDS - 1 - i] = word;
    d2 = s16(d2 + d3);
  });
  return out;
}

/** The hill's routine adds its step to words 6 to 0, doubled word by word, 64 times it to word 0. */
const HILL_WORDS = 7;

/**
 * A hill's words (M 0xDDA4 to 0xDE9A) at each position from its start to `end`, the position after its phase 4: at
 * its start every word 0x200, then once a position by phase: 0 adds −1 to −64 until word 0 falls below target1; 1 waits
 * until the hold's end; 2 adds +1 to +64 until word 0 rises above target2; 3 adds −2 to −128 until word 0 is 0x200 or
 * below; 4 ends. The words shown make a value from −0x3F to −1 −0x40.
 */
export function hillWords(hill: Hill): { readonly words: readonly Int16Array[]; readonly end: number } {
  const buf = Array.from({ length: WORDS }, () => LEVEL_WORD);
  const ramp = (step: number) => {
    for (let i = HILL_WORDS - 1, d = step; i >= 0; i--, d *= 2) buf[i] = s16(buf[i]! + d);
  };
  const shown = () => Int16Array.from(buf, (x) => (x < 0 && x > -LEAST_WORD ? -LEAST_WORD : x));
  const words = [shown()];
  for (let p = hill.start + 1, phase = 0; ; p++) {
    if (phase === 0) {
      ramp(-1);
      if (buf[0]! < hill.target1) phase = 1;
    } else if (phase === 1) {
      if (p >= hill.holdEnd) phase = 2;
    } else if (phase === 2) {
      ramp(1);
      if (buf[0]! > hill.target2) phase = 3;
    } else if (phase === 3) {
      ramp(-2);
      if (buf[0]! <= LEVEL_WORD) phase = 4;
    } else {
      words.push(shown());
      return { words, end: p + 1 };
    }
    words.push(shown());
  }
}

/** Whether position P lies in stage 3, which shows its own words. */
export const inStage3 = (position: number) => Math.floor(position / STAGE_POSITIONS) === STAGE_3;

/** The level road's words. */
export const LEVEL_WORDS: Int16Array = Int16Array.from({ length: WORDS }, () => LEVEL_WORD);

/**
 * Each laid line's row (`ROAD_LINES`, near to far) for 16 words (S 0x6E6): the road from `top` to `bottom` in 16
 * segments, the farthest first. Σ the words' 16-bit sum; d2 = Σ shifted right 6 bits (1 where 0); d1 = ((bottom − top)
 * × 128) ÷ d2 to a signed 16-bit value; segment j spans s16((word j × d1) shifted right 6 bits) ÷ 128 rows; line r in
 * segment min(15, ⌊(r − 1)/8⌋), linear between its ends.
 */
export function lineRows(words: Int16Array, top: number, bottom: number): Float64Array {
  let sum = 0;
  for (const w of words) sum = s16(sum + w);
  const d2 = sum >> 6 || 1;
  const d1 = s16(Math.trunc(((bottom - top) * 128) / d2));
  const ends = [0];
  for (const w of words) ends.push(ends.at(-1)! + s16(Math.floor((w * d1) / 64)) / 128);
  const y = ends.map((e) => top + e);
  return ROAD_LINES.map((r) => {
    const j = Math.min(WORDS - 1, Math.floor((r - 1) / 8)),
      t = (r - 1 - 8 * j) / 8;
    return y[j]! + t * (y[j + 1]! - y[j]!);
  });
}

/**
 * The screens along a run of positions, each its laid lines' rows, from each position's words (null the level road's):
 * where word 0 is 0 the sub CPU keeps the last screen drawn, the level road's before any.
 */
export function screensAlong(words: readonly (Int16Array | null)[], top: number, bottom: number): Float64Array[] {
  let last = lineRows(LEVEL_WORDS, top, bottom);
  return words.map((w) => {
    const shown = w ?? LEVEL_WORDS;
    if (shown[0] !== 0) last = lineRows(shown, top, bottom);
    return last;
  });
}
