/**
 * CISCO HEAT's road pictures ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-road-across)): a plan
 * record's picture, its nearest line of the road ROMs (`jaleco/road-lines`), as its road CPU picks it, and its lines'
 * paints, their surface the pen they cover most; the table found by the instruction that reads it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { LINES, lineRuns, paintedRuns, roadPictureOf, widestSurface, type PaintedRun } from '../jaleco/road-lines.js';
import type { RoadPicture } from '../shared/two-roads.js';

/** The kinds below which a picture's lines lie past the one-line pictures (R1 and R2 0x199A: cmpi.w #$14). */
const MANY_LINES = 0x14;

/**
 * The nearest line of a plan record's picture, its kind `kind` (+0x16), in either road CPU's program `program` (R1 and
 * R2 0x198C to 0x19A6, alike but for their tables): the word its line-kind table gives the kind (a word a kind's even
 * byte offset), 294 more for a kind below 0x14, a picture of many lines; from 0x14 on, a picture of one line.
 */
export function nearestLine(program: Uint8Array, kind: number): number {
  const [disp] = instruction(program, 0x1990, [0x41fa, null, 0x4e71, 0x3a30, 0x0000], 'the line kinds (lea pc)');
  const [below, more] = instruction(
    program,
    0x199a,
    [0x0c40, null, 0x6400, 0x0006, 0x0645, null],
    'the kinds of many lines (cmpi.w, addi.w)',
  );
  if (below !== MANY_LINES) throw romDiffers(`The road CPU takes many lines below kind ${below}`);
  const line = word(program, 0x1992 + ((disp << 16) >> 16) + kind) + (kind < below ? more : 0);
  if (!(kind % 2 === 0 && line < LINES)) throw romDiffers(`A plan record's picture ${kind} lies past the road ROMs`);
  return line;
}

/** A line's painted runs, its surface the pen its runs cover most of it with (`widestSurface`), its centre a lane line. */
export const ciscoHeatPaints = (rom: Uint8Array, line: number): PaintedRun[] =>
  paintedRuns(lineRuns(rom, line), widestSurface);

/** The kind of its most common picture, whose lanes its two roads keep wherever they go: four lanes and its kerbs. */
export const LANES_KIND = 2;

/** The picture its lanes are taken from: `LANES_KIND`'s nearest line in `program`, a road CPU's, painted. */
export const ciscoHeatLanePicture = (program: Uint8Array, rom: Uint8Array): RoadPicture =>
  roadPictureOf(ciscoHeatPaints(rom, nearestLine(program, LANES_KIND)));
