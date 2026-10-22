/**
 * RACING HERO's courses as its main program holds them
 * ([Original road data](../../docs/original-road-data.md#racing-heros-courses-tables)): the section descriptions, each
 * section's road, grade (PIT) and object tables, and COURSE SELECT's choices.
 */
import { entries, long, s8, sword, u8, word } from './program-words.js';

/** The section descriptions: 32 of 22 bytes from 0x1793C. */
const DESCRIPTIONS = 0x1793c;
const DESCRIPTION = 22;
export const DESCRIPTION_COUNT = 32;

/**
 * The ten countries in COURSE SELECT's order of the original's pyramid, each by its first section's description (A,
 * START to CHECK); the second (B, CHECK to GOAL) and the goal's section follow from their road tables.
 */
export const COUNTRIES = Object.freeze([
  { id: 'australia', name: 'AUSTRALIA', section: 0 },
  { id: 'france', name: 'FRANCE', section: 2 },
  { id: 'brazil', name: 'BRAZIL', section: 3 },
  { id: 'china', name: 'CHINA', section: 6 },
  { id: 'japan', name: 'JAPAN', section: 7 },
  { id: 'italy', name: 'ITALY', section: 8 },
  { id: 'the-netherlands', name: 'THE NETHERLANDS', section: 12 },
  { id: 'usa', name: 'U.S.A', section: 13 },
  { id: 'egypt', name: 'EGYPT', section: 14 },
  { id: 'great-britain', name: 'GREAT BRITAIN', section: 15 },
] as const);

/** A section description: its number and its tables' addresses. */
export interface Description {
  readonly number: number;
  readonly road: number;
  readonly grades: number;
  readonly scenery: number;
  readonly traffic: number;
  readonly surface: number;
}

/** Description `k`: word its number, then the road, PIT, scenery, traffic and surface tables' longs. */
export function readDescription(main: Uint8Array, k: number): Description {
  const a = DESCRIPTIONS + DESCRIPTION * k;
  const [road, grades, scenery, traffic, surface] = [0, 1, 2, 3, 4].map((i) => long(main, a + 2 + 4 * i)) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { number: word(main, a), road, grades, scenery, traffic, surface };
}

/** The description a road table's next-section long names, by its number. */
function descriptionAt(address: number): number {
  const k = (address - DESCRIPTIONS) / DESCRIPTION;
  if (!Number.isInteger(k) || k < 0 || k >= DESCRIPTION_COUNT)
    throw new RangeError(`0x${address.toString(16)} is no section description`);
  return k;
}

/** A road table's entry: its length in positions, its event byte, its road type byte and its signed radius. */
export interface RoadEntry {
  readonly length: number;
  readonly event: number;
  readonly type: number;
  readonly radius: number;
}

/** The road table's end mark. */
const ROAD_END = 0x8000;

/**
 * A road table: two longs, the next sections' descriptions (left and right), then entries of 6 bytes {word length,
 * byte event, byte type, signed word radius} up to the word 0x8000.
 */
export function readRoad(main: Uint8Array, address: number) {
  const next = [descriptionAt(long(main, address)), descriptionAt(long(main, address + 4))] as const;
  const road = entries(
    address + 8,
    6,
    (a) => word(main, a) === ROAD_END,
    (a): RoadEntry => ({
      length: word(main, a),
      event: u8(main, a + 2),
      type: u8(main, a + 3),
      radius: sword(main, a + 4),
    }),
  );
  return { next, entries: road };
}

/** A PIT table's entry: its length in positions and the height it reaches. */
export interface GradeEntry {
  readonly length: number;
  readonly height: number;
}

/** A PIT table: entries of 4 bytes {word length, signed word height}, up to one whose first byte has bit 7 set. */
export const readGrades = (main: Uint8Array, address: number): GradeEntry[] =>
  entries(
    address,
    4,
    (a) => s8(main, a) < 0,
    (a) => ({ length: word(main, a), height: sword(main, a + 2) }),
  );

/** An object table's entry: an object, or a mark beginning or ending a repetition. */
export type ObjectEntry =
  | {
      readonly distance: number;
      readonly lateral: number;
      readonly height: number;
      readonly flags: number;
      readonly type: number;
    }
  | { readonly repeat: number }
  | { readonly repeatEnd: true };

const REPEAT = 0x7fff;
const REPEAT_END = 0x7ffe;
/** An object table's entries are 12 bytes; its third word and tenth byte are 0. */
const OBJECT = 12;

/**
 * An object table (scenery or surface): entries of 12 bytes {word distance, signed word lateral, word 0, signed word
 * height, byte flags, byte 0, word type}, the word 0x7FFF (its next word a count) beginning a repetition and 0x7FFE
 * ending it, up to an entry whose first byte has bit 7 set.
 */
export function readObjects(main: Uint8Array, address: number): ObjectEntry[] {
  return entries(
    address,
    OBJECT,
    (a) => s8(main, a) < 0,
    (a): ObjectEntry => {
      const first = word(main, a);
      if (first === REPEAT) return { repeat: word(main, a + 2) };
      if (first === REPEAT_END) return { repeatEnd: true };
      if (word(main, a + 4) !== 0 || u8(main, a + 9) !== 0)
        throw new RangeError(`The object at 0x${a.toString(16)} is not in RACING HERO's format`);
      return {
        distance: first,
        lateral: sword(main, a + 2),
        height: sword(main, a + 6),
        flags: u8(main, a + 8),
        type: word(main, a + 10),
      };
    },
  );
}

/** COURSE SELECT's choices: 6 longs from 0x5D58, each two entries {long text, word, word, word x, word y}, left first. */
const CHOICES = 0x5d58;
const CHOICE_COUNT = 6;
/** The next country of each choice's two, by its first section's description: 6 pairs of words from 0x5C50. */
const NEXT_COUNTRIES = 0x5c50;
/** No text runs longer. */
const MOST_TEXT = 32;

/** A zero-ended text at `address`, its byte 0x0A a line break. */
function readText(main: Uint8Array, address: number): string {
  let text = '';
  for (let a = address; u8(main, a) !== 0; a++) {
    if (text.length >= MOST_TEXT) throw new RangeError(`The text at 0x${address.toString(16)} has no end`);
    text += String.fromCharCode(u8(main, a));
  }
  return text;
}

/** COURSE SELECT's six choices with their texts, and the next countries' words. */
export function readCourseSelect(main: Uint8Array) {
  const choices = Array.from({ length: CHOICE_COUNT }, (_, c) => {
    const a = long(main, CHOICES + 4 * c);
    return [0, 1].map((k) => {
      const e = a + 12 * k;
      return {
        text: readText(main, long(main, e)),
        words: [word(main, e + 4), word(main, e + 6)],
        x: sword(main, e + 8),
        y: sword(main, e + 10),
      };
    });
  });
  const next = Array.from({ length: CHOICE_COUNT }, (_, c) => [
    word(main, NEXT_COUNTRIES + 4 * c),
    word(main, NEXT_COUNTRIES + 4 * c + 2),
  ]);
  return { choices, next };
}

/** An object as a section places it: at the sum of the distances of the objects before it, from the section's start. */
export interface PlacedObject {
  readonly position: number;
  readonly lateral: number;
  readonly height: number;
  readonly flags: number;
  readonly type: number;
}

/** An object table's objects in order, each repetition written out its count of times; repetitions do not nest. */
export function expandObjects(table: readonly ObjectEntry[]): PlacedObject[] {
  const out: PlacedObject[] = [];
  let position = 0;
  for (let k = 0; k < table.length; k++) {
    const entry = table[k]!;
    if ('repeatEnd' in entry) throw new RangeError('A repetition ends where none began');
    let body: readonly ObjectEntry[] = [entry],
      count = 1;
    if ('repeat' in entry) {
      const end = table.findIndex((e, j) => j > k && 'repeatEnd' in e);
      if (end < 0) throw new RangeError('A repetition has no end');
      body = table.slice(k + 1, end);
      count = entry.repeat;
      k = end;
    }
    for (let n = 0; n < count; n++)
      for (const e of body) {
        if (!('type' in e)) throw new RangeError('Repetitions nest');
        out.push({ position, lateral: e.lateral, height: e.height, flags: e.flags, type: e.type });
        position += e.distance;
      }
  }
  return out;
}
