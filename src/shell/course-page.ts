import type { CourseIndexEntry } from '../content/course-index.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CourseMap } from '../course/course-map.js';
import type { CoursePage } from './card-face.js';

/** `n` of a thing, in the singular for one (K's prototype of the cards: 1 LAP). */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A course's length as the cards write it: its map's, in kilometres to the metre. */
export const courseLength = (map: CourseMap) => `${(map.lengthMeters / 1000).toFixed(3)}KM`;

/** A course without laps runs in stages: one more than the checkpoint gates on its route. */
const stages = (course: CourseIndexEntry) => count(course.map.checkpoints.length + 1, 'STAGE', 'STAGES');

/**
 * A class's card (SELECT CLASS): its title; its course's map and length, the class's laps on a circuit or else the
 * course's stages, its field (BIKES when every entry is a bike), TRAFFIC when traffic runs and TIME LIMIT when a clock
 * does; and the course's description, under the course's name when the class has a title of its own.
 */
export function classPage(runClass: SeriesClass, course: CourseIndexEntry, bikes: boolean): CoursePage {
  const field = runClass.entries.length;
  return Object.freeze({
    title: runClass.title,
    map: course.map,
    rules: Object.freeze([
      courseLength(course.map),
      course.type === 'CIRCUIT' ? count(runClass.laps, 'LAP', 'LAPS') : stages(course),
      bikes ? count(field, 'BIKE', 'BIKES') : count(field, 'CAR', 'CARS'),
      ...(runClass.traffic ? ['TRAFFIC'] : []),
      ...(runClass.timeMargin !== null ? ['TIME LIMIT'] : []),
    ]),
    heading: runClass.title === course.name ? null : course.name,
    description: course.description,
  });
}

/**
 * A course's card in FREE PLAY (SELECT COURSE): its name, map and length, CIRCUIT and the laps it admits or else its
 * stages, and its description.
 */
export function coursePage(course: CourseIndexEntry): CoursePage {
  return Object.freeze({
    title: course.name,
    map: course.map,
    rules: Object.freeze([
      courseLength(course.map),
      ...(course.type === 'CIRCUIT'
        ? ['CIRCUIT', course.maxLaps === 1 ? '1 LAP' : `1-${course.maxLaps} LAPS`]
        : [stages(course)]),
    ]),
    heading: null,
    description: course.description,
  });
}
