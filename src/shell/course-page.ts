import type { CourseIndexEntry } from '../content/course-index.js';
import type { CourseMap } from '../course/course-map.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import { courseMapColors, drawCourseMap } from '../view/course-map.js';
import type { CardPage, PageCanvas, PixelBox } from './card-face.js';
import type { CardStyle, PageFact, PageParts, PageSheet } from './card-styles.js';

/** A course's length as the cards write it: its map's, in kilometres to the metre. */
export const courseLength = (map: CourseMap) => `${(map.lengthMeters / 1000).toFixed(3)}KM`;

/** A height or a distance in metres: whole from 100 up, to a tenth below. */
const meters = (value: number) => (value >= 99.95 ? Math.round(value).toString() : value.toFixed(1));

/** The profile draws a climb of this many metres or more as tall as its strip, and a smaller one in proportion. */
const PROFILE_FULL_METERS = 40;
/** The map and the profile stand this many pixels clear of their boxes' edges. */
const CLEAR = 4;

/** The profile's name stands in the strip's top rows, which the road's line leaves clear. */
const PROFILE_NAME_ROWS = 7;

/**
 * The course's road in profile in `box`: its heights from its start to its end, left to right, filled down to the
 * strip's foot in `fill` under a line of `line`, below the strip's name.
 */
function drawProfile(canvas: PageCanvas, course: CourseIndexEntry, box: PixelBox, fill: number, line: number) {
  const { profile, climbMeters } = course.figures;
  const lowest = Math.min(...profile),
    top = box.y + PROFILE_NAME_ROWS,
    foot = box.y + box.height - 1,
    perMeter = (foot - 2 - top) / Math.max(climbMeters, PROFILE_FULL_METERS);
  let before: number | null = null;
  for (let x = box.x; x < box.x + box.width; x++) {
    const at = ((x - box.x) / (box.width - 1)) * (profile.length - 1),
      i = Math.min(profile.length - 2, Math.floor(at)),
      height = profile[i]! + (profile[i + 1]! - profile[i]!) * (at - i),
      y = Math.round(foot - 2 - (height - lowest) * perMeter);
    for (let row = y + 1; row <= foot; row++) canvas.surface.setPixel(x, row, fill);
    // The line, joined to the column before it.
    for (let row = Math.min(before ?? y, y); row <= Math.max(before ?? y, y); row++)
      canvas.surface.setPixel(x, row, line);
    before = y;
  }
}

/** A surface's share the sheet names it from, and a material ID as the sheet writes it. */
const SURFACE_SHARE = 0.05;
const material = (id: string) => id.replaceAll('_', ' ');
/** A least and a most, one of them where they are the same. */
const span = (least: string, most: string) => (least === most ? least : `${least}-${most}`);

/**
 * What SHEET writes of a course (K, 2026-11-20): the course alone, from the course index. Beside its map its type,
 * length, laps on a circuit or else stages, grid, road (width, lanes and surfaces), forks, corners, turning per
 * kilometre and longest straight; under its profile its tightest radius, steepest and average grade, climb with its
 * highest and lowest points from its start, and gains and losses in all.
 */
function courseSheet(course: CourseIndexEntry, tag: string): PageSheet {
  const { figures, map } = course,
    { road } = figures,
    kilometres = map.lengthMeters / 1000,
    circuit = course.type === 'CIRCUIT',
    corners = figures.corners.left + figures.corners.right;
  const surfaces = road.surfaces.filter((surface, i) => i === 0 || surface.share >= SURFACE_SHARE);
  const average = ((figures.ascentMeters + figures.descentMeters) / map.lengthMeters) * 100;
  return Object.freeze({
    line: [],
    beside: [
      { label: 'TYPE', value: tag },
      { label: 'LENGTH', value: kilometres.toFixed(3), unit: 'KM', main: true },
      circuit
        ? { label: 'MAX LAPS', value: String(course.maxLaps) }
        : { label: 'STAGES', value: String(map.checkpoints.length + 1) },
      { label: 'GRID', value: String(course.gridSlots) },
      { label: 'WIDTH', value: span(meters(road.widthMeters.least), meters(road.widthMeters.most)), unit: 'M' },
      { label: 'LANES', value: span(String(road.lanes.least), String(road.lanes.most)) },
      {
        label: 'SURFACE',
        value:
          surfaces.length === 1
            ? material(surfaces[0]!.material)
            : surfaces.map((s) => `${material(s.material)} ${Math.round(s.share * 100)}%`).join(', '),
      },
      { label: 'FORKS', value: figures.partings === 0 ? 'NONE' : String(figures.partings) },
      { label: 'CORNERS', value: String(corners), note: `L${figures.corners.left} R${figures.corners.right}` },
      {
        label: 'TURNING',
        value: String(Math.round((figures.turnRadians * 180) / Math.PI / kilometres)),
        unit: 'DEG/KM',
      },
      { label: 'STRAIGHT', value: String(figures.longestStraightMeters), unit: 'M', note: 'LONGEST' },
    ],
    table: null,
    rest: [
      figures.tightestRadiusMeters === null
        ? { label: 'RADIUS', value: '-' }
        : { label: 'RADIUS', value: String(figures.tightestRadiusMeters), unit: 'M', note: 'MIN' },
      {
        label: 'GRADE',
        value: (figures.steepestGrade * 100).toFixed(1),
        unit: '%',
        note: `MAX, ${average.toFixed(1)}% AVG`,
      },
      {
        label: 'CLIMB',
        value: meters(figures.climbMeters),
        unit: 'M',
        note: `+${meters(Math.max(...figures.profile))}/-${meters(-Math.min(...figures.profile))}`,
      },
      { label: 'UP/DOWN', value: `${meters(figures.ascentMeters)}/${meters(figures.descentMeters)}`, unit: 'M' },
    ],
  });
}

/** What a course's card says of it: the course alone, the same in every series and in FREE PLAY (K, 2026-11-12). */
function courseParts(course: CourseIndexEntry): PageParts {
  const { figures, map } = course,
    circuit = course.type === 'CIRCUIT',
    stages = map.checkpoints.length + 1,
    corners = figures.corners.left + figures.corners.right;
  const facts: PageFact[] = [
    { label: 'LENGTH', value: (map.lengthMeters / 1000).toFixed(3), unit: 'KM' },
    { label: 'CLIMB', value: meters(figures.climbMeters), unit: 'M' },
    { label: 'GRADE', value: (figures.steepestGrade * 100).toFixed(1), unit: '%', note: 'MAX' },
    { label: 'CORNERS', value: String(corners), note: `L${figures.corners.left} R${figures.corners.right}` },
    { label: 'STRAIGHT', value: String(figures.longestStraightMeters), unit: 'M' },
    figures.tightestRadiusMeters === null
      ? { label: 'RADIUS', value: '-' }
      : { label: 'RADIUS', value: String(figures.tightestRadiusMeters), unit: 'M', note: 'MIN' },
    { label: 'HIGHEST', value: `+${meters(Math.max(...figures.profile))}`, unit: 'M' },
    circuit
      ? { label: 'LOWEST', value: `-${meters(-Math.min(...figures.profile))}`, unit: 'M' }
      : { label: 'STAGES', value: String(stages) },
  ];
  const tag = circuit ? 'CIRCUIT' : 'POINT TO POINT';
  return Object.freeze({
    title: course.name,
    sheet: courseSheet(course, tag),
    tag,
    factsName: 'COURSE',
    facts,
    moreName: '',
    more: [],
    choice: null,
    chart: 'strip',
    chartName: 'PROFILE',
    words: Object.freeze({ heading: null, description: course.description }),
  });
}

/**
 * A course's card (SELECT CLASS and SELECT COURSE alike) in `style`: its name; whether it is a circuit; its length,
 * climb, steepest grade, corners, longest straight, tightest radius and, when no circuit, its stages (one more than its
 * checkpoint gates); its map, its arrowhead outlined; its profile; and its description.
 */
export function coursePage(course: CourseIndexEntry, style: CardStyle): CardPage {
  const parts = courseParts(course);
  return Object.freeze({
    title: parts.title,
    faces: style.faces(parts),
    paint(canvas: PageCanvas, face: number) {
      const { picture, chart, words } = style.page(canvas, parts, face);
      if (picture) {
        const { x, y, width, height } = picture.box;
        drawCourseMap(
          canvas.surface,
          course.map,
          { x: x + CLEAR, y: y + CLEAR, width: width - 2 * CLEAR, height: height - 2 * CLEAR },
          courseMapColors(canvas, picture.ground),
        );
      }
      if (chart) {
        drawProfile(canvas, course, chart.box, chart.ink, canvas.mainColor(TEXT_PALETTES.WHITE));
        canvas.small(chart.box.x + 2, chart.box.y + 1, parts.chartName, chart.ink);
      }
      return words;
    },
  });
}
