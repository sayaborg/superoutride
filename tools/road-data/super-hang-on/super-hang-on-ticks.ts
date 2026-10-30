/**
 * Where SUPER HANG-ON's scenery stands along a course when its main CPU runs it tick by tick at one speed, the procedure
 * the conversion followed before [Time made into position](../../../docs/original-road-data.md#time-made-into-position).
 * It places nothing in a course; `positions-at-speed` compares it with `courseScenery`, the speed-0 limit.
 */
import { word } from '../sega-16/program-words.js';
import type { SceneryPoint } from '../out-run-board/road-tables.js';
import { readSceneryType, type SceneryItem } from './super-hang-on-road.js';
import { DEPTH_STEPS, sceneryRules, type ScenerySpot } from './super-hang-on-scenery.js';

/**
 * The scenery a course's sections (`points` by section, in the order the course runs them) bring out, run from the
 * course's start at `speed` (the program's speed word; v shows as v × 0x117 / 0xF0 km/h), with the items no free object
 * took. A section's positions run from 0 to its `length` − 1 (2048); each tick, as the main CPU's objects run in their
 * order:
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
export function courseSceneryAtSpeed(
  main: Uint8Array,
  points: readonly (readonly SceneryPoint[])[],
  length: number,
  speed: number,
): { spots: ScenerySpot[]; dropped: number } {
  const rules = sceneryRules(main);
  const step = word(main, DEPTH_STEPS + 2 * speed);
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
    position += rules.advance * speed;
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
