/**
 * Where SUPER HANG-ON's scenery stands along a course ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)):
 * the main CPU's program run tick by tick in the limit of a speed falling to 0, bringing objects out by its scenery
 * points and patterns (object 11) into its eight scenery objects (objects 12 to 19), each standing where it passes the
 * bike.
 */
import { instruction, long, word } from './program-words.js';
import type { SceneryPoint } from './road-tables.js';
import { readSceneryType, type SceneryItem } from './super-hang-on-road.js';

/** Main CPU: its first scenery object's template. */
const SCENERY_COUNTER = 0x6ab4 + 0x2e;
/** Main CPU: the depth an object gains a tick by speed, a word for each speed. */
export const DEPTH_STEPS = 0xc5ea;

/**
 * What the program's scenery runs by: the top speed without the turbo (`cmpi.w #$F1, ($260078).l` at 0x64BC) and with
 * it (`cmpi.w #$117` at 0x64A2), the road's advance a tick per speed unit (the long at 0x8848, 16.16 positions), the
 * depth an object gains a tick, half the speed rounded down at every speed to the top (the words at 0xC5EA, checked),
 * the depth at which an object passes the bike (`cmpi.w #$1FF, d0` at 0x71A0 on the depth's top 12 bits), the scenery
 * objects (`cmpi.w #$9, d1` at 0x6F26, the first free of objects 12 to 19), the steps a scenery point's count lasts
 * (`move.b #$F, ($2E, a5)` at 0x6D7A, a count down from 15 through −1) and the step counter's start (its template's
 * byte).
 */
export function sceneryRules(main: Uint8Array) {
  const [speed] = instruction(main, 0x64bc, [0x0c79, null, 0x0026, 0x0078], "the top speed's comparison");
  const [turbo] = instruction(
    main,
    0x64a2,
    [0x0c79, null, 0x0026, 0x0078],
    "the top speed's comparison with the turbo",
  );
  for (let v = 0; v <= turbo!; v++)
    if (word(main, DEPTH_STEPS + 2 * v) !== v >> 1)
      throw new RangeError(`The depth step at speed ${v} is not half the speed`);
  const [passes] = instruction(main, 0x71a0, [0x0c40, null], 'the depth an object passes the bike at');
  const [slots] = instruction(main, 0x6f26, [0x0c41, null], 'the scenery objects');
  const [period] = instruction(main, 0x6d7a, [0x1b7c, null, 0x002e], "the scenery count's steps");
  const advance = long(main, 0x8848);
  /**
   * Positions from depth `depth` to the passing one: the depth gains half the speed a tick, the road `advance` × it.
   */
  const ahead = (depth: number) => (((passes! << 4) - depth) * 2 * advance) / 65536;
  return {
    speed: speed!,
    turbo: turbo!,
    advance,
    passes: passes! << 4,
    ahead,
    /** The positions from an object's coming out (at depth 0) to its passing the bike, in the limit of a speed to 0. */
    passing: ahead(0),
    slots: slots! - 1,
    period: period!,
    start: main[SCENERY_COUNTER]!,
  };
}

/**
 * Where the program's ending stands its figures and the goal's crowd, goal positions, each where its depth puts it as
 * any object's (`ahead`), time made position as the scenery's: the race ends on the first tick from the goal's position `finish` + 1 (`sectionPositions`), that tick's
 * advance going to 0 with the speed, and the speed is cleared (`clr.l ($260078).l` at 0x804A). The ending's
 * depth, 0x1ED0 from the goal (`move.w #$1ED0, ($2600EA).l` at 0x67B6), falls 0x40 a tick (`subi.w #$40, ($2600EA).l`
 * at 0xB736) until it is below 0xFA0 (`cmpi.w #$FA0, ($2600EA).l` at 0xB634); then the speed is 0x53 (`move.w #$53,
 * ($260078).l` at 0xB7AC), the crowd's depth is 0x60 less than the ending's (`move.w ($26, a5), d2` and `subi.w #$60,
 * d2` at 0xB7C8), and each tick the depth gains the speed's step and the road the speed's advance, until the depth
 * reaches 0x1FF0 (`cmpi.w #$1FF0, ($26, a5)` at 0xB82A). On that last tick the ending's figures stand at the ending's
 * depth (0x200F) and the crowd at its own (0x1FAF), each as far beyond the bike as an object at that depth (K,
 * 2026-10-28).
 */
export function endingPlaces(
  main: Uint8Array,
  rules: { readonly advance: number; readonly ahead: (depth: number) => number },
  finish: number,
) {
  instruction(main, 0x804a, [0x42b9, 0x0026, 0x0078], "the speed cleared at the race's end");
  const [from] = instruction(main, 0x67b6, [0x33fc, null, 0x0026, 0x00ea], "the ending's depth at the goal");
  const [fall] = instruction(main, 0xb736, [0x0479, null, 0x0026, 0x00ea], "the ending's fall");
  const [low] = instruction(main, 0xb634, [0x0c79, null, 0x0026, 0x00ea], "the ending's lowest depth");
  const [speed] = instruction(main, 0xb7ac, [0x33fc, null, 0x0026, 0x0078], "the ending's speed");
  const [beyond] = instruction(main, 0xb7c8, [0x342d, 0x0026, 0x0442, null], "the crowd's depth beyond the ending");
  const [stop] = instruction(main, 0xb82a, [0x0c6d, null, 0x0026], "the ending's stop");
  let depth = from!;
  while (depth >= low!) depth -= fall!;
  const step = word(main, DEPTH_STEPS + 2 * speed!);
  let ticks = 0;
  for (; depth < stop!; ticks++) depth += step;
  const bike = finish + 1 + (ticks * rules.advance * speed!) / 65536;
  return { endingAt: bike + rules.ahead(depth), crowdAt: bike + rules.ahead(depth - beyond!) };
}

/** The screen lines by a depth's top 9 bits: a rival's (read at 0x7990) and the scenery's. */
const RIVAL_LINES = 0xce40;
const SCENERY_LINES = 0xd240;
const DEPTHS = 512;

/**
 * How far ahead of the bike at GO a rival the program places at depth `depth` stands, positions: where the scenery
 * the original draws on the rival's line stands (K, 2026-10-25). The rival's line is its depth's word in 0xCE40 shifted
 * right 4 (0x7990); the scenery's depth on that line is the middle between the last of 0xD240's depths drawn above it
 * and the first drawn below, and stands as far ahead as an object at that depth passes the bike (`ahead`), as a gate
 * part does.
 */
export function rivalAhead(main: Uint8Array, rules: ReturnType<typeof sceneryRules>, depth: number): number {
  const line = word(main, RIVAL_LINES + 2 * (depth >> 4)) >> 4;
  const lines = Array.from({ length: DEPTHS }, (_, i) => word(main, SCENERY_LINES + 2 * i) >> 4);
  // The lines grow with the depth.
  const above = lines.filter((l) => l < line).length - 1;
  const below = DEPTHS - lines.filter((l) => l > line).length;
  const middle = (16 * (above + below)) / 2 + 8;
  return rules.ahead(middle);
}

/** An object placed: its section (its place in the course, the goal after the last), its position there, its item. */
export interface ScenerySpot {
  readonly section: number;
  readonly position: number;
  readonly item: SceneryItem;
}

/**
 * The scenery a course's sections (`points` by section, in the order the course runs them) bring out, run from the
 * course's start by the program's ticks in the limit of a speed falling to 0
 * ([Original road data](../../docs/original-road-data.md#time-made-into-position)), with the items no free object took. A
 * section's positions run from 0 to its `length` − 1 (2048); as the main CPU's objects run in their order:
 * - object 7: past the section's last position, the next section begins at 0 with its points;
 * - object 11: a point is taken when the position reaches it (cursor at it, its count, its type's pattern and first
 *   item); while its count lasts and the cursor is at most the position, a step: the cursor moves on, the pattern turns
 *   left once and a counter of steps counts down, a count spent each time it passes 0; a 1 turned out brings out the
 *   next item (the last's next the first) into the first free scenery object, none if all are taken;
 * - objects 12 to 19: each passes the bike `passing` positions on from where it came out, and stands there.
 * A section's points end with it: the cursor, past the next section's first points, waits for them. Objects still
 * coming when the course's last section ends stand where they pass, in the goal's positions.
 */
export function courseScenery(
  main: Uint8Array,
  points: readonly (readonly SceneryPoint[])[],
  length: number,
): { spots: ScenerySpot[]; dropped: number } {
  const rules = sceneryRules(main);
  const { passing } = rules;
  const types = new Map<number, ReturnType<typeof readSceneryType>>();
  const typeOf = (t: number) => types.get(t) ?? types.set(t, readSceneryType(main, t)).get(t)!;
  const spots: ScenerySpot[] = [];
  // Each object's travel from the course's start where it passes the bike.
  const objects: ({ passes: number; item: SceneryItem } | null)[] = Array<null>(rules.slots).fill(null);
  // The travel from the course's start, and where the section's position 0 lies on it.
  let [travel, begins, section, next] = [0, 0, 0, 0];
  let [cursor, count, pattern, item, counter] = [0, 0, 0, 0, rules.start];
  let items: readonly SceneryItem[] = [];
  let dropped = 0;
  // Object 11 at the section's position `at`: a point taken, then a step. Whether it did either.
  const control = (at: number) => {
    let acted = false;
    const own = points[section] ?? [];
    if (next < own.length && own[next]!.position <= at) {
      const point = own[next++]!;
      const type = typeOf(point.type);
      [cursor, count, pattern, item, items] = [point.position, point.count, type.pattern, 0, type.items];
      acted = true;
    }
    if (section < points.length && count > 0 && cursor <= at) {
      cursor++;
      const out = pattern >> 15;
      pattern = ((pattern << 1) | out) & 0xffff;
      if (--counter < 0) [count, counter] = [count - 1, rules.period];
      if (out) {
        if (item >= items.length) item = 0;
        const free = objects.indexOf(null);
        if (free >= 0) objects[free] = { passes: travel + passing, item: items[item]! };
        else dropped++;
        item++;
      }
      acted = true;
    }
    return acted;
  };
  while (control(0));
  for (;;) {
    // The next place on: the section's end, the next point or step, or an object passing the bike.
    const own = points[section] ?? [];
    const candidates = [
      begins + length,
      next < own.length ? begins + own[next]!.position : Infinity,
      section < points.length && count > 0 ? begins + cursor : Infinity,
      ...objects.flatMap((o) => (o ? [o.passes] : [])),
    ].filter((t) => t > travel);
    travel = Math.min(...candidates);
    const at = () => Math.floor(travel - begins + 1e-9);
    // Objects 11, then 12 to 19: those that reach the bike stand where it is.
    control(at());
    objects.forEach((o, k) => {
      if (!o || o.passes > travel) return;
      spots.push({ section, position: travel - begins, item: o.item });
      objects[k] = null;
    });
    // Object 7: past the section's last position, the next section.
    if (travel - begins >= length) [section, begins, next] = [section + 1, travel, 0];
    if (section === points.length && objects.every((o) => o === null)) break;
    while (control(at()));
  }
  return { spots, dropped };
}
