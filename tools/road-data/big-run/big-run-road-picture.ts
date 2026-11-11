/**
 * BIG RUN's road pictures ([BIG RUN road data](../../../docs/big-run-road-data.md#its-road-across)): a plan record's
 * picture, its nearest line of the road ROMs (`jaleco/road-lines`), as its road CPU picks it; the stripes
 * its rows' colors take along the road; and each road layer's palette as a stage loads it. Each table found by the
 * instruction that reads it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { PENS, rgb555Of } from '../jaleco/palette.js';
import type { RoadNumber } from '../jaleco/road-tables.js';
import { LINES } from '../jaleco/road-lines.js';

/**
 * Where each road's CPU picks a row's picture and colors (R1's for road 1, R2's for road 2, alike but for their
 * addresses): its nearest row's picture (`nearest`), its stripes' table (`stripes`), the position its town ends at
 * (`town`).
 */
const AT: Readonly<Record<RoadNumber, { nearest: number; stripes: number; town: number }>> = Object.freeze({
  1: { nearest: 0xca8, stripes: 0xd2c, town: 0x95e },
  2: { nearest: 0xc7c, stripes: 0xd00, town: 0x94e },
});

/** A record's kind whose picture is one line its variant picks, and the variants that pick one. */
const ONE_LINE = 4;
const BLACK_VARIANT = 2;
const CLEAR_VARIANT = 6;

/**
 * The nearest line of a plan record's picture (`kind` +0x16, `variant` +0x18) in road `road`, its CPU's program
 * `program`, in the town or not (R1 0xCA8 to 0xCF0, R2 0xC7C to 0xCC4): kind 4 one line all the way, by its variant
 * (2 the line of pen 0, 6 the clear line, any other the town's line of pen 5 or the desert's of pen 7); any other kind
 * its picture's nearest line, 187 on from the line its line-kind table gives it (a word a kind's even byte offset).
 */
export function nearestLine(program: Uint8Array, road: RoadNumber, kind: number, variant: number, town: boolean) {
  const at = AT[road].nearest;
  const [base] = instruction(program, at, [0x3a3c, null, 0x302a, 0x0016, 0x0c40, ONE_LINE], "a row's line (move.w)");
  const [black] = instruction(program, at + 0x10, [0x3a3c, null, 0x0c6a, BLACK_VARIANT, 0x0018], 'the black line');
  const [clear] = instruction(program, at + 0x1e, [0x3a3c, null, 0x0c6a, CLEAR_VARIANT, 0x0018], 'the clear line');
  const [townLine] = instruction(program, at + 0x2c, [0x3a3c, null, 0x4a79, 0x000c, 0x0096], "the town's line");
  const [desertLine] = instruction(program, at + 0x3a, [0x3a3c, null], "the desert's line");
  const [disp] = instruction(program, at + 0x42, [0x41fa, null], 'the line kinds (lea pc)');
  if (kind === ONE_LINE)
    return variant === BLACK_VARIANT ? black : variant === CLEAR_VARIANT ? clear : town ? townLine : desertLine;
  if (kind % 2 !== 0) throw romDiffers(`A plan record's picture ${kind} is no table's word`);
  const line = base + ((word(program, at + 0x44 + ((disp << 16) >> 16) + kind) << 16) >> 16);
  if (line < 0 || line >= LINES) throw romDiffers(`A plan record's picture ${kind} lies past the road ROMs`);
  return line;
}

/** The position a stage's town ends at: STARTING RUN's rows are the town's before it (R1 0x95E, R2 0x94E). */
export function townEnd(program: Uint8Array, road: RoadNumber): number {
  const [high, low] = instruction(program, AT[road].town, [0x0c83, null, null], "the town's end (cmpi.l)");
  return high * 0x10000 + low;
}

/** The road positions a stripe's table spans: a row's phase is its position modulo it (R1 0xA5C: divu.w). */
export const STRIPE_PERIOD = 0x1fe;

/** Road `road`'s stripes along the road: each position of a period its row's stripe (1 to 8; R1 0xD2C, R2 0xD00). */
export function stripes(program: Uint8Array, road: RoadNumber): readonly number[] {
  const [high, low] = instruction(program, AT[road].stripes, [0x41f9, null, null], "the stripes' table (lea)");
  return Array.from({ length: STRIPE_PERIOD }, (_, k) => word(program, high * 0x10000 + low + 2 * k));
}

/** A row's picture's variant whose river line shows its other half, in its other palette entry (R1 0xCFA to 0xD28). */
const RIVER = 2;
const RIVER_ENTRIES = [0x28, 0x20] as const;
/** The desert's palette entries start here (R1 0xD48). */
const DESERT = 0x1f;
/** A stripe's bit that makes a desert's row the next entry, and a town's entries a variant (R1 0xD4E, 0xD60). */
const DESERT_STRIPE = 4;
const TOWN_ENTRIES = 4;

/**
 * A row's palette entry: a river's (kind 2) 40 where its variant is 0 and 32 else; a town's row its variant's four
 * entries on by its stripe (entries 4 × variant + stripe); a desert's its variant's past 31, and the next where its
 * stripe's bit 2 is set.
 */
export function rowEntry(kind: number, variant: number, town: boolean, stripe: number): number {
  if (kind === RIVER) return RIVER_ENTRIES[variant === 0 ? 0 : 1];
  if (town) return TOWN_ENTRIES * variant + stripe;
  return DESERT + variant + (stripe & DESERT_STRIPE ? 1 : 0);
}

/** A road layer's palette: 64 entries of 16 pens, RGB555. */
export type LayerPalette = readonly (readonly number[])[];
const ENTRIES = 64;
/** The pens a stage's loads write an entry, of its 16. */
const LOADED_PENS = 12;
/** The sky's entries in a road layer's palette, 25 to 30, and the sets of them a stage's change fades through. */
export const SKY_ENTRIES = [25, 30] as const;
const SKY_SETS = 16;

/** `pens` palette words from `at`, as RGB555. */
const words = (main: Uint8Array, at: number, pens: number) =>
  Array.from({ length: pens }, (_, p) => rgb555Of(word(main, at + 2 * p)));

/** The address an `lea abs.l` or `lea d(pc)` at `at` takes. */
function leaAt(main: Uint8Array, at: number, what: string) {
  if (word(main, at) === 0x41fa) {
    const [disp] = instruction(main, at, [0x41fa, null], what);
    return at + 2 + ((disp << 16) >> 16);
  }
  const [high, low] = instruction(main, at, [0x41f9, null, null], what);
  return high * 0x10000 + low;
}

/**
 * The road layers' palettes in stage `stage`, layer 0 the first road CPU's (road 1) and layer 1 the second's (road 2),
 * as the main program loads them: each the road layers' palette (M 0x176A), its entries 1 to 24 STARTING RUN's, which
 * it loads for its layer and no later stage replaces (M 0xB8FA, 0xB91C: 12 pens each), entry 31 the stage's (M 0xB93E,
 * 0xB8DE), and the sky's entries 25 to 30 its stage's first set of them (M 0xB97E), or its last, `skySet` 15, as its
 * change ends (M 0xBC66 to 0xBCD6).
 */
export function stagePalettes(main: Uint8Array, stage: number, skySet = 0): readonly [LayerPalette, LayerPalette] {
  if (!(skySet >= 0 && skySet < SKY_SETS)) throw new RangeError(`BIG RUN's sky has no set ${skySet}`);
  const base = leaAt(main, 0x176a, "the road layers' palette");
  const town = [leaAt(main, 0xb8fa, "STARTING RUN's first layer"), leaAt(main, 0xb924, "STARTING RUN's second layer")];
  const entry31 =
    stage === 0
      ? leaAt(main, 0xb93e, "STARTING RUN's entry 31")
      : (() => {
          const table = leaAt(main, 0xb8de, "the stages' entry 31");
          const record = word(main, table + 4 * stage) * 0x10000 + word(main, table + 4 * stage + 2);
          return word(main, record + 6) * 0x10000 + word(main, record + 8);
        })();
  const skies = leaAt(main, 0xb97e, "the stages' skies");
  const sky = word(main, skies + 8 * stage + 4) * 0x10000 + word(main, skies + 8 * stage + 6);
  const [first, last] = SKY_ENTRIES;
  const skyBytes = (last - first + 1) * 2 * PENS;
  return [0, 1].map((layer) =>
    Array.from({ length: ENTRIES }, (_, e) => {
      if (e >= 1 && e <= 24)
        return words(main, town[layer]! + 2 * LOADED_PENS * (e - 1), LOADED_PENS).concat(
          words(main, base + 2 * PENS * e + 2 * LOADED_PENS, PENS - LOADED_PENS),
        );
      if (e === 31)
        return words(main, entry31, LOADED_PENS).concat(words(main, base + 2 * PENS * e + 2 * LOADED_PENS, 4));
      if (e >= first && e <= last) return words(main, sky + skyBytes * skySet + 2 * PENS * (e - first), PENS);
      return words(main, base + 2 * PENS * e, PENS);
    }),
  ) as unknown as readonly [LayerPalette, LayerPalette];
}

/** How a run of a row's picture draws: as its road's surface, a line on it, its edge, the ground beside it, or clear. */
/** The position from which a stage's sky fades from its first set to its last (M 0xB97E's table, its record's +0). */
export function skyChangeAt(main: Uint8Array, stage: number): number {
  const at = leaAt(main, 0xb97e, "the stages' skies") + 8 * stage;
  return word(main, at) * 0x10000 + word(main, at + 2);
}
