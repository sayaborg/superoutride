/**
 * Where SUPER HANG-ON's scenery stands along a course when its main CPU runs it tick by tick at one speed, the procedure
 * the conversion followed before [Time made into position](../../../docs/original-road-data.md#time-made-into-position).
 * It places nothing in a course; `positions-at-speed` compares it with `courseScenery`, the speed-0 limit.
 */
import { word } from '../sega-16/program-words.js';
import type { SceneryPoint } from '../out-run-hardware/road-tables.js';
import { readCourses, readSection, sectionPositions } from './super-hang-on-road.js';
import {
  DEPTH_STEPS,
  sceneryRules,
  type ScenerySpot,
  courseScenery,
  runCourseScenery,
} from './super-hang-on-scenery.js';
import { displayKmh } from './super-hang-on-course.js';
import { assembleSuperHangOnPrograms } from './super-hang-on-rom.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { round3, compareStandings, type Standing } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';

/**
 * The scenery a course's sections (`points` by section, in the order the course runs them) bring out, run from the
 * course's start at `speed` (the program's speed word; v shows as v × 0x117 / 0xF0 km/h), with the items no free object
 * took, as `courseScenery` runs it (`runCourseScenery`) but for its stepping. A section's positions run from 0 to its
 * `length` − 1 (2048); each tick, as the main CPU's objects run in their order:
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
  return runCourseScenery(main, points, ({ objects, control, stand, nextSection, done }) => {
    // The road's position in its section (16.16); an object counts by its depth.
    let position = 0;
    for (;;) {
      // Object 7: past the section's last position, the next section.
      if (position >>> 16 >= length) {
        nextSection();
        position = 0;
      }
      if (done()) break;
      // Object 8: the road advances; object 11: a point taken, then a step.
      position += rules.advance * speed;
      control(position >>> 16, 0);
      // Objects 12 to 19: each comes nearer, and stands where it passes the bike.
      objects.forEach((o, k) => {
        if (!o) return;
        o.count += step;
        if (o.count >= rules.passes) stand(k, position / 65536);
      });
    }
  });
}

// A SUPER HANG-ON object's kind: its section and item.
const superHangOnStanding = (o: ScenerySpot): Standing => ({
  position: o.position,
  x: o.item.x,
  key: `section ${o.section} sprite ${o.item.sprite} palette ${o.item.palette} x ${o.item.x} ${o.item.mirrored}`,
});

/**
 * SUPER HANG-ON's scenery in the limit and by the ticks at the speed word nearest `kmh` that its depth steps' divisor
 * divides (v shows as `displayKmh` km/h), compared course by course in each section's positions. An object's depth
 * gains ⌊v / divisor⌋ a tick (the words at 0xC5EA, `sceneryRules`), the speed's share only where the divisor divides v,
 * so the limit is the one through those speed words (K, 2026-10-27).
 */
export function superHangOnAtSpeed(set: RomSet, kmh: number) {
  const programs = assembleSuperHangOnPrograms(set);
  const { main } = programs;
  const positions = sectionPositions(main);
  const rules = sceneryRules(main);
  const speed = rules.divisor * Math.round(kmh / displayKmh(main) / rules.divisor);
  requireInput(
    speed > 0 && speed <= rules.speed,
    '/arguments/--kmh',
    `--kmh is SUPER HANG-ON's speed word ${speed}, a multiple of ${rules.divisor}, above 0 and at most its top speed's, ${rules.speed}`,
  );
  // A tick at `speed` advances the road this many positions: where the ticks place an object, to within one.
  const tolerance = (rules.advance * speed) / 65536;
  const courses = readCourses(main).map((course) => {
    const points = course.sections.map((n) => readSection(programs, n, positions.length).scenery);
    const limit = courseScenery(main, points, positions.length);
    const ticks = courseSceneryAtSpeed(main, points, positions.length, speed);
    return {
      course: course.name,
      ...compareStandings(limit.spots.map(superHangOnStanding), ticks.spots.map(superHangOnStanding), tolerance),
    };
  });
  return { original: 'super-hang-on', kmh, speed, tolerance: round3(tolerance), courses };
}
