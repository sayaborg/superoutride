/**
 * ENDURO RACER's screen as its programs draw it ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-screen)),
 * which the grades' rule reads back: the main CPU's 16 slope words at each road position (the normal path, the hills,
 * stage 3) and the sub CPU's layout of the road's lines by them, each line at its distance ahead of the bike.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { bikeAhead } from './enduro-racer-dump.js';
import { readHills, STAGE_POSITIONS, type Hill } from './enduro-racer-road.js';
import type { EnduroRacerPrograms } from './enduro-racer-rom.js';
import { instruction, shiftCount, sword, word } from '../sega-16/program-words.js';

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
 * The depth tables (M 0x8B34 to 0x8B64): an object's or a crossing's distance ahead of the road position, d in 1/256
 * positions, gives its depth number, within the near table's reach the byte at `NEAR_TABLE` + d >> 3, beyond it the byte
 * at `FAR_TABLE` + (d >> 8) − 32, the far table ending where the near begins.
 */
const NEAR_TABLE = 0x8c5b;
const FAR_TABLE = 0x8bfa;

/**
 * The road ROM's lines laid, near to far, taken by eighths: line r is depth number r − 1, no table mapping one to the
 * other, so the tables' depths 127 to 1 are lines 128 to 2 (line 1, depth 0, lies beyond them, at the horizon).
 */
const NEAREST_LINE = 128;
const FARTHEST_LINE = 2;
const LINE_STEP = 1 / 8;
export const ROAD_LINES = Float64Array.from(
  { length: (NEAREST_LINE - FARTHEST_LINE) / LINE_STEP + 1 },
  (_, i) => NEAREST_LINE - i * LINE_STEP,
);

/** The lines the sub CPU lays from the road's top row to its bottom: 16 segments of 8, line 1 to line 129. */
const LAID_LINES = 128;

/**
 * Each whole line's distance ahead of the road position, positions, from line `FARTHEST_LINE`: the middle of the
 * distances whose depth number is the line's, read from the depth tables, their instructions checked.
 */
function wholeLineDistances(main: Uint8Array, instructions: Uint8Array): number[] {
  instruction(instructions, 0x8b4c, [0x41fa, NEAR_TABLE - 0x8b4e], 'the near table (lea $8C5B(pc))');
  const near = shiftCount(word(instructions, 0x8b50), 0xe048, 'near shift (lsr.w #3)');
  const [reach] = instruction(instructions, 0x8b52, [0x0c45, null], "the near table's reach (cmpi.w #$400, d5)");
  const far = near + shiftCount(word(instructions, 0x8b58), 0xe048, 'far shift (lsr.w #5)');
  const [skipped] = instruction(instructions, 0x8b5a, [0x0445, null], "the far table's first (subi.w #$20, d5)");
  instruction(instructions, 0x8b5e, [0x41fa, FAR_TABLE - 0x8b60], 'the far table (lea $8BFA(pc))');
  const position = 256;
  const spans = new Map<number, [number, number]>();
  const take = (depth: number, from: number, to: number) => {
    const span = spans.get(depth);
    spans.set(depth, [span ? span[0] : from / position, to / position]);
  };
  for (let i = 0; i < reach!; i++) take(main[NEAR_TABLE + i]!, i << near, (i + 1) << near);
  for (let i = 0; FAR_TABLE + i < NEAR_TABLE; i++)
    take(main[FAR_TABLE + i]!, (i + skipped!) << far, (i + skipped! + 1) << far);
  const lines = Array.from({ length: NEAREST_LINE - FARTHEST_LINE + 1 }, (_, k) => spans.get(FARTHEST_LINE + k - 1));
  if (spans.size !== lines.length || lines.some((span) => !span))
    throw romDiffers(`The depth tables' depths are not ${NEAREST_LINE - 1} to ${FARTHEST_LINE - 1}`);
  return lines.map((span) => (span![0] + span![1]) / 2);
}

/** The reading camera's eye is sought this far behind the road position, positions, to this fineness. */
const EYE_MOST = 16;
const EYE_FINENESS = 1e-9;

/**
 * The reading camera ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-screen)): the pinhole
 * through the level road's whole lines at their distances, its horizon the road's top row (line 1's): line r's rows
 * below it, (bottom − top)(r − 1)/128, most nearly `reach` / (T_r + `eye`), T_r its distance ahead of the road position,
 * `eye` how far behind the road position it stands; least squares in rows, `reach` direct at each `eye` and `eye` the
 * golden sections', the squares' sum dipping once between its bounds.
 */
function readingCamera(distances: readonly number[], rows: number) {
  const below = distances.map((_, k) => (rows * (FARTHEST_LINE + k - 1)) / LAID_LINES);
  const fit = (eye: number) => {
    const x = distances.map((d) => 1 / (d + eye));
    const reach = x.reduce((s, v, k) => s + v * below[k]!, 0) / x.reduce((s, v) => s + v * v, 0);
    return { eye, reach, cost: x.reduce((s, v, k) => s + (reach * v - below[k]!) ** 2, 0) };
  };
  const golden = (Math.sqrt(5) - 1) / 2;
  let [lower, upper] = [0, EYE_MOST];
  while (upper - lower > EYE_FINENESS) {
    const a = upper - golden * (upper - lower),
      b = lower + golden * (upper - lower);
    if (fit(a).cost < fit(b).cost) upper = b;
    else lower = a;
  }
  return fit((lower + upper) / 2);
}

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
  /** Each laid line's distance ahead of the bike, positions, near to far (`ROAD_LINES`), whole lines' linear between. */
  readonly lineDistances: readonly number[];
  /** The reading camera's eye, positions behind the bike, and its level road's rows below the horizon × positions. */
  readonly behind: number;
  readonly reach: number;
}

/**
 * The screen's tables and rows, their instructions checked: the slope table's `lea` at M 0xDA60, stage 3's at M 0xDACC
 * and its test at M 0xDAC2, the horizon lowered to its row at M 0x7C88, the road's bottom row at S 0x768, the depth
 * tables' at M 0x8B4C to 0x8B5E and the bike's place.
 */
export function readEnduroRacerScreen(programs: EnduroRacerPrograms): EnduroRacerScreen {
  const { main, mainInstructions, sub } = programs;
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
  const wholes = wholeLineDistances(main, mainInstructions);
  const laid = (r: number) => {
    const k = Math.min(Math.floor(r), NEAREST_LINE - 1) - FARTHEST_LINE;
    return wholes[k]! + (r - FARTHEST_LINE - k) * (wholes[k + 1]! - wholes[k]!);
  };
  const ahead = bikeAhead(programs);
  const camera = readingCamera(wholes, bottom! - top!);
  return Object.freeze({
    slopes: Object.freeze(words(SLOPE_TABLE, SLOPE_TABLE_LENGTH)),
    hills: Object.freeze(readHills(main)),
    stage3: Object.freeze(words(STAGE_3_WORDS, WORDS)),
    top: top!,
    bottom: bottom!,
    lineDistances: Object.freeze(Array.from(ROAD_LINES, (r) => laid(r) - ahead)),
    behind: camera.eye + ahead,
    reach: camera.reach,
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
