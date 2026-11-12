/**
 * CISCO HEAT's road colours ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-colours)): a row's entry
 * of its road layer's palette, by its plan record's variant and its stripe along the road, and each road layer's palette
 * as a stage loads it, its sky's entries as they fade. Each table found by the instruction that reads it.
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { PENS, rgb555Of } from '../jaleco/palette.js';
import type { RoadNumber, RoadPlanRecord } from '../jaleco/road-tables.js';
import { STAGES } from './cisco-heat-backgrounds.js';

/** The road positions a stripe's table spans: a row's phase is its position modulo it (R1 0x161E, R2 0x160E: divu.w). */
export const STRIPE_PERIOD = 0x1fe;
const PHASE_AT: Readonly<Record<RoadNumber, number>> = Object.freeze({ 1: 0x161e, 2: 0x160e });

/** A row word's bits that pick its entry of its layer's palette, of its 64. */
const ENTRY_BITS = 0x3f;

/**
 * Where road `road`'s CPU's program `program` reads its rows' stripes (R1 and R2 0x19AC to 0x19DE, alike but for their
 * tables: R1's 0x1018E, R2's 0x10192), the phase its position's modulo `STRIPE_PERIOD`.
 */
export function stripesTable(program: Uint8Array, road: RoadNumber): number {
  instruction(
    program,
    PHASE_AT[road],
    [0x2003, 0x80fc, STRIPE_PERIOD, 0x4840, 0x33c0, 0x000c, 0x0084],
    "a row's phase (divu.w)",
  );
  const [high, low] = instruction(
    program,
    0x19ac,
    [0x41f9, null, null, 0x322a, 0x001a, 0xd279, 0x000c, 0x0084, 0x0281, 0x0000, 0xfffe, 0x3230, 0x1800],
    "the stripes' table (lea.l, its record's +0x1A and the phase)",
  );
  instruction(program, 0x19c6, [0x302a, 0x0018, 0x0240, 0x00ff, 0xd041], "the record's variant (+0x18, andi.w #$ff)");
  return high * 0x10000 + low;
}

/**
 * A row's entry of its layer's palette at position `position` in plan record `record` of road `road`, its CPU's program
 * `program`: the word of its stripes' table at its record's stripes' word (+0x1A) plus the position's phase, to an even
 * byte, plus its variant's low byte (+0x18), the word's bits 0 to 5. Its bit 6, set only by variants 0x42 and 0x43, is
 * not read.
 */
export function rowEntry(program: Uint8Array, road: RoadNumber, record: RoadPlanRecord, position: number): number {
  if (record.stripes === undefined) throw romDiffers(`A plan record at ${record.start} holds no stripes' word`);
  const phase = ((position % STRIPE_PERIOD) + STRIPE_PERIOD) % STRIPE_PERIOD;
  const stripe = word(program, stripesTable(program, road) + ((record.stripes + phase) & 0xffff & 0xfffe));
  return ((record.variant & 0xff) + stripe) & ENTRY_BITS;
}

/** A road layer's palette: 64 entries of 16 pens, RGB555. */
export type LayerPalette = readonly (readonly number[])[];
const ENTRIES = 64;
/** The entries of a stage's own colors (1 to 14, their two copies on to 42), and STAGE 3's more (43 to 56). */
const STAGE_ENTRIES = 14;
/** A stage's color's pens as its table holds them, 14 an entry; pens 14 and 15 are the palette's own. */
const STAGE_PENS = 14;
/** The sky's entries, 57 to 62, and the sets its stage's fade steps through after its first. */
export const SKY_ENTRIES = [57, 62] as const;
export const LAST_SKY_SET = 8;
/** The stage, of 0 to 4, that loads entries 43 to 56 too (M 0xEE00: cmpi.w #2), and the one whose fade both layers take. */
const MORE_ENTRIES_STAGE = 2;
const BOTH_FADE_STAGE = 4;

/** The address an `lea d(pc), a0` or `lea abs.l, a0` at `at` takes. */
function leaAt(main: Uint8Array, at: number, what: string) {
  if (word(main, at) === 0x41fa) {
    const [disp] = instruction(main, at, [0x41fa, null], `${what} (lea pc)`);
    return at + 2 + ((disp << 16) >> 16);
  }
  const [high, low] = instruction(main, at, [0x41f9, null, null], `${what} (lea.l)`);
  return high * 0x10000 + low;
}

/** `pens` palette words from `at`, as RGB555. */
const words = (main: Uint8Array, at: number, pens: number) =>
  Array.from({ length: pens }, (_, p) => rgb555Of(word(main, at + 2 * p)));

/**
 * The road layers' palettes in stage `stage` (layer 0 the first road CPU's, at 0xBB800; layer 1 the second's, at
 * 0xBC800), alike, as the main program loads them:
 * - both its palette from M 0x1A27C (M 0x2730: 0x800 bytes);
 * - at its start (M 0xEDCE) its colors from the first address of its list (M 0xDC7E, a long a stage), 14 entries of 14
 *   pens (28 bytes each), pens 14 and 15 left: entries 1 to 14 as they are (M 0xEE44); 15 to 28 their pens 0 to 8 and
 *   pens 9 to 13 their pen 6 (M 0xEE78); 29 to 42 their pens 0, 1, 6 and 8 to 13 and pens 2 to 5 and 7 their pen 6 (M
 *   0xEEB4). STAGE 3 loads its list's colors as entries 43 to 56 as they are, and entries 1 to 42 from M 0x13EF94's
 *   (M 0xEE0C to 0xEE3E);
 * - the sky's entries 57 to 62 its first set of 16 pens each from M 0xDB2A's table (a long a stage, M 0xED9C), or
 *   its set `skySet` (1 to `LAST_SKY_SET`, the sets one after another), as its fade lays it over layer 0, and in STAGE 5
 *   over both (`skyFade`).
 * The palette changes its stage's records make on along it (M 0xF00A on, from M 0xDB3E's lists) are not read.
 */
export function stagePalettes(main: Uint8Array, stage: number, skySet = 0): readonly [LayerPalette, LayerPalette] {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < STAGES))
    throw new RangeError(`CISCO HEAT has no stage ${stage}`);
  if (!(Number.isInteger(skySet) && skySet >= 0 && skySet <= LAST_SKY_SET))
    throw new RangeError(`CISCO HEAT's sky has no set ${skySet}`);
  const base = leaAt(main, 0x2730, "the road layers' palette");
  instruction(
    main,
    0x2736,
    [0x43f9, 0x000b, 0xb800, 0x45f9, 0x000b, 0xc800, 0x303c, 0x01ff, 0x22d0, 0x24d8],
    'both layers',
  );
  const list = leaAt(main, 0xedce, "the stages' colors");
  instruction(main, 0xedfa, [0x2070, 0x0000, 0x2050], "its list's first colors (movea.l)");
  instruction(main, 0xee00, [0x0c79, MORE_ENTRIES_STAGE, 0x000f, 0x011a], "STAGE 3's more entries (cmpi.w)");
  instruction(main, 0xee0e, [0x45f9, 0x000b, 0xbd60], "STAGE 3's entries 43 to 56 (lea.l)");
  const third = leaAt(main, 0xee3e, "STAGE 3's entries 1 to 42");
  instruction(main, 0xee48, [0x45f9, 0x000b, 0xb820, 0x47f9, 0x000b, 0xc820], 'entries 1 to 42 (lea.l)');
  copies(main);
  const own = long(main, long(main, list + 4 * stage));
  const colors = stage === MORE_ENTRIES_STAGE ? third : own;
  const skies = leaAt(main, 0xed52, "the stages' skies");
  instruction(main, 0xeda2, [0x43f9, 0x000b, 0xbf20, 0x45f9, 0x000b, 0xcf20], "the sky's entries 57 to 62 (lea.l)");
  instruction(
    main,
    0xeefe,
    [...Array.from({ length: 8 }, () => [0x24d0, 0x22d8]).flat(), 0x4e75],
    'an entry of 16 pens',
  );
  const sky = long(main, skies + 4 * stage) + SKY_SET_BYTES * skySet;
  const [first, last] = SKY_ENTRIES;
  const layer = (n: 0 | 1): LayerPalette =>
    Array.from({ length: ENTRIES }, (_, e) => {
      const kept = words(main, base + 2 * PENS * e, PENS);
      const from = (at: number) => words(main, at, STAGE_PENS);
      if (e >= 1 && e <= 3 * STAGE_ENTRIES) {
        const k = (e - 1) % STAGE_ENTRIES;
        const pens = from(colors + 2 * STAGE_PENS * k);
        const six = pens[6]!;
        const made =
          e <= STAGE_ENTRIES
            ? pens
            : e <= 2 * STAGE_ENTRIES
              ? pens.map((p, i) => (i >= 9 ? six : p))
              : pens.map((p, i) => ((i >= 2 && i <= 5) || i === 7 ? six : p));
        return [...made, ...kept.slice(STAGE_PENS)];
      }
      if (stage === MORE_ENTRIES_STAGE && e > 3 * STAGE_ENTRIES && e <= 4 * STAGE_ENTRIES)
        return [...from(own + 2 * STAGE_PENS * (e - 3 * STAGE_ENTRIES - 1)), ...kept.slice(STAGE_PENS)];
      if (e >= first && e <= last) {
        const faded = n === 0 || stage === BOTH_FADE_STAGE || skySet === 0;
        const at = (faded ? sky : long(main, skies + 4 * stage)) + 2 * PENS * (e - first);
        return words(main, at, PENS);
      }
      return kept;
    });
  return [layer(0), layer(1)];
}

/** A sky's set: its six entries of 16 pens. */
const SKY_SET_BYTES = (SKY_ENTRIES[1] - SKY_ENTRIES[0] + 1) * 2 * PENS;

/** The three loops that make entries 1 to 42 from a stage's colors (M 0xEE54, 0xEE7C, 0xEEB8), as `stagePalettes` reads them. */
function copies(main: Uint8Array) {
  const pair = [0x24d0, 0x26d8];
  const next = [0x584a, 0x584b];
  instruction(main, 0xee54, [...Array.from({ length: 7 }, () => pair).flat(), ...next], 'entries 1 to 14 (14 pens)');
  instruction(
    main,
    0xee7c,
    [
      0x3028,
      0x000c,
      ...Array.from({ length: 4 }, () => pair).flat(),
      0x34d0,
      0x36d8,
      ...Array(5).fill(0x34c0),
      ...Array(5).fill(0x36c0),
      0xd0fc,
      0x000a,
      ...next,
    ],
    'entries 15 to 28 (pens 0 to 8, then pen 6)',
  );
  instruction(
    main,
    0xeeb8,
    [
      0x3028,
      0x000c,
      ...pair,
      0x5048,
      ...Array(4).fill(0x34c0),
      ...Array(4).fill(0x36c0),
      ...pair,
      0x3540,
      0xfffe,
      0x3740,
      0xfffe,
      ...Array.from({ length: 3 }, () => pair).flat(),
      ...next,
    ],
    'entries 29 to 42 (pens 2 to 5 and 7 their pen 6)',
  );
}

/** A stage's sky's fade: from where it begins, positions, over how many ticks its sets lay, and the layers it lays over. */
export interface SkyFade {
  readonly at: number;
  readonly ticks: number;
  readonly layers: readonly (0 | 1)[];
}

/**
 * A stage's sky's fade (M 0xEF62): once the car's position passes its stage's (M 0xEFF6, a long a stage, M 0xDB16), it
 * lays its sky's next sets over entries 57 to 62 16 bytes a tick (`moveq #3`, four longs) for 0x600 bytes, eight sets
 * in 96 ticks, over layer 0, and in STAGE 5 over layer 1 too (M 0xEFA4).
 */
export function skyFade(main: Uint8Array, stage: number): SkyFade {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < STAGES))
    throw new RangeError(`CISCO HEAT has no stage ${stage}`);
  const starts = leaAt(main, 0xdb16, "the skies' fades");
  instruction(main, 0xdb1c, [0x2d70, 0x0000, 0x005a], "its fade's start (move.l to $5a)");
  const [bytes] = instruction(main, 0xef82, [0x3d7c, null, 0x0054], "its fade's bytes (move.w to $54)");
  const [step] = instruction(main, 0xefe2, [0x046e, null, 0x0054], "a tick's bytes (subi.w)");
  instruction(main, 0xef9c, [0x7403], 'four longs a tick (moveq #3)');
  instruction(main, 0xefa4, [0x0c79, BOTH_FADE_STAGE, 0x000f, 0x011a], 'the stage whose fade both layers take');
  if (bytes !== LAST_SKY_SET * SKY_SET_BYTES || step !== 16)
    throw romDiffers(`A sky's fade lays ${bytes} bytes by ${step}`);
  return Object.freeze({
    at: long(main, starts + 4 * stage),
    ticks: bytes / step,
    layers: Object.freeze(stage === BOTH_FADE_STAGE ? [0, 1] : [0]) as readonly (0 | 1)[],
  });
}
