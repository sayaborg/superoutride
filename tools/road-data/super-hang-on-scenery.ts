/**
 * Where SUPER HANG-ON's scenery stands along a course ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * the main CPU's program run tick by tick at the top speed, bringing objects out by its scenery points and patterns
 * (object 11) into its eight scenery objects (objects 12 to 19), each standing where it passes the bike.
 */
import { instruction, long, word } from './program-words.js';
import { readSceneryType, type SceneryItem, type SceneryPoint } from './super-hang-on-road.js';

/** Main CPU: the depth an object gains a tick by speed (a word for each), its first scenery object's template. */
const DEPTH_STEPS = 0xc5ea;
const SCENERY_COUNTER = 0x6ab4 + 0x2e;

/**
 * What the program's scenery runs by: the top speed without the turbo (`cmpi.w #$F1, ($260078).l` at 0x64BC), the
 * road's advance a tick per speed unit (the long at 0x8848, 16.16 positions), the depth at which an object passes the
 * bike (`cmpi.w #$1FF, d0` at 0x71A0 on the depth's top 12 bits), the scenery objects (`cmpi.w #$9, d1` at 0x6F26, the
 * first free of objects 12 to 19), the steps a scenery point's count lasts (`move.b #$F, ($2E, a5)` at 0x6D7A, a count
 * down from 15 through −1) and the step counter's start (its template's byte).
 */
export function sceneryRules(main: Uint8Array) {
  const [speed] = instruction(main, 0x64bc, [0x0c79, null, 0x0026, 0x0078], "the top speed's comparison");
  const [passes] = instruction(main, 0x71a0, [0x0c40, null], "the depth an object passes the bike at");
  const [slots] = instruction(main, 0x6f26, [0x0c41, null], 'the scenery objects');
  const [period] = instruction(main, 0x6d7a, [0x1b7c, null, 0x002e], "the scenery count's steps");
  return {
    speed: speed!,
    advance: long(main, 0x8848),
    passes: passes! << 4,
    slots: slots! - 1,
    period: period!,
    start: main[SCENERY_COUNTER]!,
  };
}

/** An object placed: its section (its place in the course, the goal after the last), its position there, its item. */
export interface ScenerySpot {
  readonly section: number;
  readonly position: number;
  readonly item: SceneryItem;
}

/**
 * The scenery a course's sections (`points` by section, in the order the course runs them) bring out, run from the
 * course's start at the top speed, with the items no free object took. A section's positions run from 0 to its `length`
 * − 1 (2048); each tick, as the main CPU's objects run in their order:
 * - object 7: past the section's last position, the next section begins at 0 with its points;
 * - object 8: the road advances `advance × speed` (16.16 positions);
 * - object 11: a point is taken when the position reaches it (cursor at it, its count, its type's pattern and first
 *   item); while its count lasts and the cursor is at most the position, a step: the cursor moves on, the pattern turns
 *   left once and a counter of steps counts down, a count spent each time it passes 0; a 1 turned out brings out the
 *   next item (the last's next the first) into the first free scenery object, none if all are taken;
 * - objects 12 to 19: each object's depth gains the step its speed gives, and at `passes` it passes the bike and stands
 *   at the road's position.
 * A section's points end with it: the cursor, past the next section's first points, waits for them. Objects still
 * coming when the course's last section ends stand where they pass, in the goal's positions.
 */
export function courseScenery(
  main: Uint8Array,
  points: readonly (readonly SceneryPoint[])[],
  length: number,
): { spots: ScenerySpot[]; dropped: number } {
  const rules = sceneryRules(main);
  const step = word(main, DEPTH_STEPS + 2 * rules.speed);
  const types = new Map<number, ReturnType<typeof readSceneryType>>();
  const typeOf = (t: number) => types.get(t) ?? types.set(t, readSceneryType(main, t)).get(t)!;
  const spots: ScenerySpot[] = [];
  const objects: ({ depth: number; item: SceneryItem } | null)[] = Array<null>(rules.slots).fill(null);
  let [position, section, next] = [0, 0, 0];
  let [cursor, count, pattern, item, counter] = [0, 0, 0, 0, rules.start];
  let items: readonly SceneryItem[] = [];
  let dropped = 0;
  for (;;) {
    // Object 7: past the section's last position, the next section.
    if (position >>> 16 >= length) [section, position, next] = [section + 1, 0, 0];
    if (section === points.length && objects.every((o) => o === null)) break;
    // Object 8: the road advances.
    position += rules.advance * rules.speed;
    // Object 11: a point taken, then a step.
    const at = position >>> 16;
    const own = points[section] ?? [];
    if (next < own.length && own[next]!.position <= at) {
      const point = own[next++]!;
      const type = typeOf(point.type);
      [cursor, count, pattern, item, items] = [point.position, point.count, type.pattern, 0, type.items];
    }
    if (section < points.length && count > 0 && cursor <= at) {
      cursor++;
      const out = pattern >> 15;
      pattern = ((pattern << 1) | out) & 0xffff;
      if (--counter < 0) [count, counter] = [count - 1, rules.period];
      if (out) {
        if (item >= items.length) item = 0;
        const free = objects.indexOf(null);
        if (free >= 0) objects[free] = { depth: 0, item: items[item]! };
        else dropped++;
        item++;
      }
    }
    // Objects 12 to 19: each comes nearer, and stands where it passes the bike.
    objects.forEach((o, k) => {
      if (!o) return;
      o.depth += step;
      if (o.depth < rules.passes) return;
      spots.push({ section, position: position / 65536, item: o.item });
      objects[k] = null;
    });
  }
  return { spots, dropped };
}
