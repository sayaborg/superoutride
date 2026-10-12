import { TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import { halveRgb555 } from '../image/rgb555.js';
import type { TilePicture } from '../image/tile-picture.js';
import { SIM_DT } from '../race/fixed-step.js';
import { drawCourseMap, type CourseMap } from '../view/course-map.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import type { Screen } from './screen-host.js';
import { SCREEN_BACKGROUND } from './menu.js';
import { formatMilliseconds, NO_TIME } from './race-time.js';
import { MODE_NAMES, type RunRequest } from './run-request.js';
import type { SeriesCatalog } from '../content/series-catalog.js';
import type { CourseIndex } from '../content/course-index.js';

/** The card shows at least this long, and until its run is assembled. */
export const PRE_RACE_SECONDS = 2.5;
/** The first text row the series image is darkened from, and the card's text column. */
const DARK_FROM_ROW = 17;
const COLUMN = 17;
/** The map's box: x 8–136, y 136–232. */
const MAP_BOX = Object.freeze({ x: 8, y: 136, width: 129, height: 97 });
/** The progress bar: columns 17–37 of row 28, 4 pixels high in the row's middle. */
const BAR = Object.freeze({ column: 17, columns: 21, row: 28, height: 4 });
/** RGB555 colors of the map's line and core and of the bar's empty part. */
const WHITE = 0x7fff;
const GRAY = (16 << 10) | (16 << 5) | 16;
const DARK_GRAY = (6 << 10) | (6 << 5) | 6;

/** What the card shows from the run's request, before anything loads. */
export interface PreRaceCard {
  /** In ARCADE the series image, darkened from row 17; otherwise none, on black. */
  readonly background: TilePicture | null;
  /** The class title in ARCADE, else the mode's name. */
  readonly title: string;
  readonly courseName: string;
  /** The laps of a circuit's run; null on other courses. */
  readonly laps: number | null;
}

/**
 * The card a request shows: in ARCADE its series image and class title, else the mode's name on black; its course's
 * display name from the course index, and its laps on a circuit. An unknown class or course is a `RangeError`.
 */
export function preRaceCardOf(request: RunRequest, series: SeriesCatalog, courses: CourseIndex): PreRaceCard {
  let arcade = null,
    courseId: string,
    laps: number;
  if (request.mode === 'ARCADE') {
    arcade = series.seriesClass(request.seriesId, request.classId);
    if (!arcade) throw new RangeError(`Unknown class ${request.classId} of series ${request.seriesId}`);
    [courseId, laps] = [arcade.course, arcade.laps];
  } else [courseId, laps] = [request.courseId, request.lapCount];
  const course = courses.find((c) => c.id === courseId);
  if (!course) throw new RangeError(`Unknown course ${courseId}`);
  return Object.freeze({
    background: arcade ? arcade.series.image : null,
    title: arcade ? arcade.title : MODE_NAMES[request.mode],
    courseName: course.name,
    laps: course.type === 'CIRCUIT' ? laps : null,
  });
}

/** What the card shows once the run's course is compiled and its Session prepared. */
export interface PreRaceFacts {
  readonly map: CourseMap;
  /** The competitors, the player included, and whether they are all bikes. */
  readonly field: number;
  readonly bikes: boolean;
  /** The player's grid slot, 1 at the front. */
  readonly slot: number;
  /** The record READY shows, in milliseconds; null when there is none yet, undefined when the mode keeps none. */
  readonly best: number | null | undefined;
}

/**
 * The PRE-RACE card, which stands while a run loads: its class or mode, course, laps, field and start slot, the record
 * READY will show and the course map, with a progress bar of the run's loading. It stays at least `PRE_RACE_SECONDS`
 * (counted in fixed steps) and until the run is loaded; then `ready` is called once.
 */
export function createPreRaceScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  card: PreRaceCard,
  ready: () => void,
) {
  let steps = 0,
    progress = 0,
    facts: PreRaceFacts | null = null,
    loaded = false,
    done = false;
  const minimum = Math.ceil(PRE_RACE_SECONDS / SIM_DT - 1e-9);
  const check = () => {
    if (done || !loaded || steps < minimum) return;
    done = true;
    ready();
  };
  const screen: Screen = {
    live: false,
    tick() {
      steps++;
      check();
    },
    command() {},
    render() {
      if (card.background) {
        card.background.draw(frame, 0, 0);
        for (let i = DARK_FROM_ROW * TEXT_TILE_SIZE * frame.width; i < frame.pixels.length; i++)
          frame.pixels[i] = halveRgb555(halveRgb555(frame.pixels[i]!));
      } else frame.clear(SCREEN_BACKGROUND);
      text.clear();
      text.write(COLUMN, 18, card.title, TEXT_PALETTES.YELLOW);
      text.write(COLUMN, 20, card.courseName, TEXT_PALETTES.WHITE);
      if (facts) {
        drawCourseMap(frame, facts.map, MAP_BOX, {
          line: WHITE,
          core: GRAY,
          start: text.mainColor(TEXT_PALETTES.YELLOW),
          checkpoint: text.mainColor(TEXT_PALETTES.GREEN),
        });
        const length = `${(facts.map.lengthMeters / 1000).toFixed(3)}KM`;
        text.write(COLUMN, 21, card.laps === null ? length : `${length}  ${card.laps} LAPS`, TEXT_PALETTES.WHITE);
        text.write(
          COLUMN,
          23,
          `${facts.field} ${facts.bikes ? 'BIKES' : 'CARS'}  START P${facts.slot}`,
          TEXT_PALETTES.WHITE,
        );
        if (facts.best !== undefined)
          text.write(
            COLUMN,
            25,
            `BEST ${facts.best === null ? NO_TIME : formatMilliseconds(facts.best)}`,
            TEXT_PALETTES.GREEN,
          );
      }
      const left = BAR.column * TEXT_TILE_SIZE,
        width = BAR.columns * TEXT_TILE_SIZE,
        top = BAR.row * TEXT_TILE_SIZE + (TEXT_TILE_SIZE - BAR.height) / 2;
      const filled = Math.round(width * Math.min(1, Math.max(0, progress)));
      for (let y = top; y < top + BAR.height; y++) {
        frame.fillSpan(y, left, left + width - 1, DARK_GRAY);
        if (filled > 0) frame.fillSpan(y, left, left + filled - 1, text.mainColor(TEXT_PALETTES.YELLOW));
      }
      text.draw(frame);
      present();
    },
  };
  return Object.freeze({
    screen,
    /** The share of the run's loading done, 0 to 1. */
    progress(value: number) {
      progress = Math.max(progress, value);
    },
    /** The run's course and Session facts. */
    facts(value: PreRaceFacts) {
      facts = value;
    },
    /** The run is loaded: the card leaves once it has stood its minimum. */
    loaded() {
      progress = 1;
      loaded = true;
      check();
    },
  });
}
export type PreRaceScreen = ReturnType<typeof createPreRaceScreen>;
