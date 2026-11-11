import type { CourseIndexEntry } from '../content/course-index.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CourseMap } from '../course/course-map.js';
import { courseMapColors, drawCourseMap } from '../view/course-map.js';
import { PAGE, PAGE_COLORS, PAGE_TEXT, type CardPage, type PageCanvas } from './card-face.js';

/** `n` of a thing, in the singular for one (K's prototype of the cards: 1 LAP). */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A course's length as the cards write it: its map's, in kilometres to the metre. */
export const courseLength = (map: CourseMap) => `${(map.lengthMeters / 1000).toFixed(3)}KM`;

/** A course without laps runs in stages: one more than the checkpoint gates on its route. */
const stages = (course: CourseIndexEntry) => count(course.map.checkpoints.length + 1, 'STAGE', 'STAGES');

/** The map's box in the picture, in pixels: 4 clear of the picture's edges, which the map's arrowhead never reaches. */
const MAP_BOX = Object.freeze({ x: 5, y: 29, width: 117, height: 61 });

/**
 * A course's page: its map in the picture on the deep ground, its arrowhead outlined in it, and `rules` in the facts,
 * one a row, each within the facts' columns; and the course's description, under `heading` where there is one.
 */
function page(title: string, course: CourseIndexEntry, rules: readonly string[], heading: string | null): CardPage {
  const { facts } = PAGE_TEXT;
  if (rules.length > facts.rows) throw new RangeError(`A page holds at most ${facts.rows} rules`);
  for (const rule of rules)
    if (rule.length > facts.columns) throw new RangeError(`${JSON.stringify(rule)} is wider than the facts' box`);
  return Object.freeze({
    title,
    paint(canvas: PageCanvas) {
      canvas.box(PAGE.picture, PAGE_COLORS.deep);
      drawCourseMap(canvas.surface, course.map, MAP_BOX, courseMapColors(canvas, PAGE_COLORS.deep));
      canvas.box(PAGE.facts, PAGE_COLORS.ground);
      rules.forEach((rule, i) => canvas.write(facts.column, facts.row + i, rule));
    },
    words: Object.freeze({ heading, description: course.description }),
  });
}

/**
 * A class's card (SELECT CLASS): its title; its course's map and length, the class's laps on a circuit or else the
 * course's stages, its field (BIKES when every entry is a bike), TRAFFIC when traffic runs and TIME LIMIT when a clock
 * does; and the course's description, under the course's name when the class has a title of its own.
 */
export function classPage(runClass: SeriesClass, course: CourseIndexEntry, bikes: boolean): CardPage {
  const field = runClass.entries.length;
  return page(
    runClass.title,
    course,
    [
      courseLength(course.map),
      course.type === 'CIRCUIT' ? count(runClass.laps, 'LAP', 'LAPS') : stages(course),
      bikes ? count(field, 'BIKE', 'BIKES') : count(field, 'CAR', 'CARS'),
      ...(runClass.traffic ? ['TRAFFIC'] : []),
      ...(runClass.timeMargin !== null ? ['TIME LIMIT'] : []),
    ],
    runClass.title === course.name ? null : course.name,
  );
}

/**
 * A course's card in FREE PLAY (SELECT COURSE): its name, map and length, CIRCUIT and the laps it admits or else its
 * stages, and its description.
 */
export function coursePage(course: CourseIndexEntry): CardPage {
  return page(
    course.name,
    course,
    [
      courseLength(course.map),
      ...(course.type === 'CIRCUIT'
        ? ['CIRCUIT', course.maxLaps === 1 ? '1 LAP' : `1-${course.maxLaps} LAPS`]
        : [stages(course)]),
    ],
    null,
  );
}
