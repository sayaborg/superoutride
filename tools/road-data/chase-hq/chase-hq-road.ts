/**
 * CHASE H.Q.'s course tables ([Original road data](../../../docs/original-road-data.md#an-originals-modules)): its ten
 * roads of 16 sections, five stages' approach roads and their chase roads, each section's records and next sections,
 * its road palettes' colors and its farthest sky layer's turn, each found by the instructions that read it.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { nextSections, sectionRecords, type RawRecord } from '../taito/course-records.js';
import { rgb555Of } from '../taito/palette.js';

/** Its roads, a road's sections, and the stages: road `s` is stage `s`'s approach road, road `s + 5` its chase road. */
export const ROADS = 10;
export const SECTIONS = 16;
export const STAGES = 5;
/** A road's records and a section's, bytes apart. */
const ROAD_BYTES = 0x1000;
const SECTION_BYTES = 0x100;

/** A record as the programs read it. */
export interface ChaseHqRecord {
  /** Its curve, signed: positive bends the road right (b0). */
  readonly curve: number;
  /** Its grade, signed (b1). */
  readonly grade: number;
  /** Its event's type (b2's bits 7–5) and its second road (bits 1–0: 3 a fork begins, 1 and 2 a merge). */
  readonly event: number;
  readonly secondRoad: number;
  /** Its lane mask: bits 6 to 1 lanes a to f, P between c and d (b3). */
  readonly mask: number;
  /** Its kind: 6 the dirt road, 4 and 5 a merge's mask kept left or right, 7 no smoothing of the width (b4). */
  readonly kind: number;
  /** Its scene's sky palette (b5's high nibble) and its road palette's entry (its low 7 bits). */
  readonly scene: number;
  readonly palette: number;
  /** Its background set, 0 none (b6), and its event's parameter (b7). */
  readonly background: number;
  readonly parameter: number;
}

const signed = (b: number) => (b << 24) >> 24;

const recordOf = (b: RawRecord): ChaseHqRecord => ({
  curve: signed(b[0]!),
  grade: signed(b[1]!),
  event: b[2]! >> 5,
  secondRoad: b[2]! & 3,
  mask: b[3]!,
  kind: b[4]!,
  scene: b[5]! >> 4,
  palette: b[5]! & 0x7f,
  background: b[6]!,
  parameter: b[7]!,
});

/** A section: its records and its next sections, for the left and the right (the right where the lateral is 0x8000 or more). */
export interface ChaseHqSection {
  readonly records: readonly ChaseHqRecord[];
  readonly next: readonly [number, number];
}

const long = (high: number, low: number) => high * 0x10000 + low;

/**
 * Where the main program holds its tables: its stage's start loads the road (0x7ACC), from 0x20030 by the road's
 * index rotated to 0x1000 a road (0x7AF0, 0x7AF2); the cars take their next section from 0xAF64 by the road, 32 bytes
 * a road (0x803C); the road palette is 0x2E952, 8 bytes an entry (0xF20); the far sky layer's turn is table 2 of three
 * of 128 words from 0x2BD1A, indexed by the curve's size (0x6332).
 */
function tables(main: Uint8Array) {
  instruction(main, 0x7af0, [0xe858], "the road's index rotated to its records (ror.w #4)");
  const records = long(...instruction(main, 0x7af2, [0x207c, null, null], "the road's records (movea.l)"));
  const next = long(...instruction(main, 0x803c, [0x227c, null, null], "the cars' next sections (movea.l)"));
  const palettes = long(...instruction(main, 0xf20, [0x207c, null, null], 'the road palette (movea.l)'));
  const skyTurn = long(...instruction(main, 0x6332, [0x227c, null, null], "the sky layers' turn (movea.l)"));
  return { records, next, palettes, skyTurn };
}

/** The ten roads' sections, each road's 16 in order. */
export function readRoads(main: Uint8Array): readonly (readonly ChaseHqSection[])[] {
  const t = tables(main);
  return Array.from({ length: ROADS }, (_, road) =>
    Array.from({ length: SECTIONS }, (_, section) => ({
      records: sectionRecords(main, t.records + road * ROAD_BYTES + section * SECTION_BYTES).map(recordOf),
      next: nextSections(main, t.next + road * 2 * SECTIONS + section * 2),
    })),
  );
}

/** A road palette entry's colors (RGB555): the road's body, two, and the ground's, two (banks 0–3 and 4–7). */
export function readRoadPalette(main: Uint8Array, entry: number) {
  const at = tables(main).palettes + 8 * entry;
  const colors = [0, 1, 2, 3].map((k) => rgb555Of(word(main, at + 2 * k)));
  return { body: [colors[0]!, colors[1]!] as const, ground: [colors[2]!, colors[3]!] as const };
}

/** The far sky layer's turn by the curve's size, 0 to 127: its pixels a record, eight times over (BG1's upper band). */
export function readSkyTurn(main: Uint8Array): readonly number[] {
  const at = tables(main).skyTurn + 2 * 0x100;
  return Array.from({ length: 128 }, (_, k) => word(main, at + 2 * k));
}

/**
 * The sections a course runs through, as [road, section]: stage `stage`'s approach road from its section 0, taking at
 * a fork the branch `side` names, to its section 15, then its chase road's 16, the chase road being a loop.
 */
export function courseSections(roads: readonly (readonly ChaseHqSection[])[], stage: number, side: 'left' | 'right') {
  const out: [number, number][] = [];
  let section = 0;
  for (let k = 0; ; k++) {
    if (k > SECTIONS) throw romDiffers(`Stage ${stage + 1}'s approach road does not reach its section 15`);
    out.push([stage, section]);
    if (section === SECTIONS - 1) break;
    const [left, right] = roads[stage]![section]!.next;
    section = side === 'left' ? left : right;
  }
  for (let s = 0; s < SECTIONS; s++) out.push([stage + STAGES, s]);
  return out;
}
