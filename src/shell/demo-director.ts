import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CameraDefinition, CameraState } from '../view/camera.js';
import { RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS } from '../view/camera.js';
import { createCourseScene } from '../view/course-scene.js';
import { routeCamera, type RoutePlace } from '../view/route-camera.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Run, RunLook, RunSight } from './run-assembly.js';

/**
 * A shot of the race film (K, 2026-11-14), every shot a row of one shape: its camera stands `ahead` of its base (the
 * shown vehicle, the grid's rearmost vehicle or the line the shown vehicle finishes at), `aside` of the base's line
 * toward the road's centre and `height` over the road, looking along that line forward or `back`; it travels at `speed`
 * of the shown vehicle's speed (0 stands), following the vehicle's line. CHASE alone has no place: it is the player's
 * camera, the run seen as it is played.
 */
export interface DemoShot {
  readonly name: string;
  readonly base: 'VEHICLE' | 'REARMOST' | 'GOAL' | 'PLAYER';
  readonly ahead: number;
  readonly aside: number;
  readonly height: number;
  readonly speed: number;
  readonly back: boolean;
}

const shot = (
  name: string,
  base: DemoShot['base'],
  [ahead, aside, height, speed]: readonly [number, number, number, number],
  back: boolean,
): DemoShot => Object.freeze({ name, base, ahead, aside, height, speed, back });

/** The race film's shots: metres, and shares of the shown vehicle's speed. START opens it and GOAL closes it. */
export const DEMO_SHOTS: readonly DemoShot[] = Object.freeze([
  shot('START', 'REARMOST', [-10, 0, 3, 0], false),
  shot('FIXED', 'VEHICLE', [30, 3.5, 1.5, 0], false),
  shot('PASSED', 'VEHICLE', [25, 2.5, 1.2, 0.7], false),
  shot('LEFT', 'VEHICLE', [-6, 0, 2, 0.8], false),
  shot('CHASE', 'PLAYER', [0, 0, 0, 0], false),
  shot('LOW', 'VEHICLE', [-4, 0, 0.5, 1], false),
  shot('QUARTER', 'VEHICLE', [-5, 3, 1.2, 1], false),
  shot('FRONT', 'VEHICLE', [8, 0, 1.2, 1], true),
  shot('FRONT QUARTER', 'VEHICLE', [6, 3, 1.2, 1], true),
  shot('APPROACH', 'VEHICLE', [120, 3.5, 1.5, 0], true),
  shot('GOAL', 'GOAL', [-15, 3.5, 1.5, 0], false),
]);

/**
 * The films' timing: the course film's camera travels the road's centre at `intro.speed` m/s (100 km/h), `intro.height`
 * over it; every shot but START and GOAL lasts `cut` seconds; the shown vehicle has left a shot's picture when it is
 * `away` ahead of a camera looking forward, or has reached a camera looking back, and the shot is then set again on its
 * row; GOAL takes over once the shown vehicle has `goal.approach` to go to the line it finishes at, while its camera is
 * still `goal.clear` ahead of it.
 */
export const DEMO_FILM = Object.freeze({
  intro: { speed: 100 / 3.6, height: 4 },
  cut: 15,
  away: 120,
  goal: { approach: 150, clear: 20 },
});

/**
 * The demo's one line of text, its ticker: a subject runs along `row` of the frame's text from its right edge, a
 * character every `stepsPerColumn` fixed steps, until the last has left at the left.
 */
export const DEMO_TICKER = Object.freeze({ row: 27, stepsPerColumn: 3, columns: 40 });

/**
 * The demo's one rule of chance (K, 2026-11-14): one of `count` drawn by `random`, other than `last` (when one is and
 * another can be).
 */
export function drawOther(count: number, last: number, random: () => number): number {
  if (count <= 1) return 0;
  const drawn = Math.floor(random() * (count - 1));
  return last >= 0 && drawn >= last ? drawn + 1 : drawn;
}

/** How many fixed steps `subject` takes to run along the ticker once. */
export const tickerSteps = (subject: string) => (subject.length + DEMO_TICKER.columns) * DEMO_TICKER.stepsPerColumn;

/** The demo's subjects (K, 2026-11-14), each `<name>  <words>`: the course's, the series' and class's, the machine's. */
export interface DemoSubjects {
  readonly course: string;
  readonly series: string;
  readonly machine: string;
}

/** One film of the attract demo: a picture that moves on step by step until it ends, and the subjects run over it. */
export interface Film {
  /** One fixed step; whether it cut to a new picture, which thins in over the last as every change of the demo does. */
  step(): boolean;
  /** Draw its picture into `frame` through its camera of the latest step. */
  draw(frame: SoftwareSurface): void;
  /** Whether it has ended. */
  readonly ended: boolean;
  /** The subjects the ticker runs over it, each to its end and then the next, again and again. */
  readonly subjects: readonly string[];
  /** Cut by hand to the shot before (-1) or after (1); a film without shots has none. */
  cut?(by: -1 | 1): void;
}

/**
 * The course film: a camera travelling the road's centre (`DEMO_FILM.intro`) over a course scene of its own with no
 * vehicle, its window following the camera, each fork taking its first exit, from a station of the entry Section drawn
 * by `random` that leaves it room to travel there. Its one subject is the course; it ends when that has run once on the
 * ticker, or short of a route's end.
 */
export function createCourseFilm(
  course: CompiledCourse,
  vehicles: readonly CompiledVehicleDefinition[],
  definition: CameraDefinition,
  subject: string,
  random: () => number,
): Film {
  const scene = createCourseScene(course.entry, course.gates, vehicles);
  const { runtime } = scene;
  const steps = tickerSteps(subject);
  const room =
    course.entry.coordinates.domain.end - DEMO_FILM.intro.speed * steps * SIM_DT - RENDER_FAR_DEPTH_METERS / 4;
  let s = random() * Math.max(0, room),
    taken = 0,
    ended = false,
    camera: CameraState;
  const travel = () => {
    const tail = runtime.route.occurrences.at(-1)!;
    if (tail.section.outgoing.length > 1 && s + runtime.coverage.forwardMeters > runtime.route.end)
      runtime.selectSuccessor(tail.section.outgoing[0]!);
    runtime.refresh(s, s);
    camera = routeCamera(scene.world, { s, l: 0, height: DEMO_FILM.intro.height, aim: 0 }, definition);
  };
  travel();
  return {
    subjects: [subject],
    get ended() {
      return ended;
    },
    step() {
      s += DEMO_FILM.intro.speed * SIM_DT;
      const end = runtime.route.terminal;
      if (++taken > steps || (end !== null && s + RENDER_FAR_DEPTH_METERS / 4 > end)) ended = true;
      else travel();
      return false;
    },
    draw(frame) {
      scene.render(frame, null, camera, [], [], [], null);
    },
  };
}

/** A class's films in order, its course's and its race's, and their release. */
export interface DemoReel {
  readonly films: readonly Film[];
  dispose(): void;
}

/**
 * The reel of a watched `run`: its course film over the course, then its race film over the series and the machine:
 * the run, stepped until it has `finished`, seen through its director's shots and drawn into the page's frame.
 */
export function createDemoReel(
  run: Run,
  finished: () => boolean,
  vehicles: readonly CompiledVehicleDefinition[],
  definition: CameraDefinition,
  subjects: DemoSubjects,
  random: () => number,
): DemoReel {
  const director = createDemoDirector(definition, random);
  let cut = false;
  const look: RunLook = (sight) => {
    cut = director.step(sight);
    return director.camera;
  };
  const race: Film = {
    subjects: [subjects.series, subjects.machine],
    get ended() {
      return finished();
    },
    step() {
      cut = false;
      if (!finished()) run.tick(look);
      return cut;
    },
    draw: () => run.draw(),
    cut: (by) => director.cut(by),
  };
  return {
    films: [createCourseFilm(run.course, vehicles, definition, subjects.course, random), race],
    dispose: () => run.dispose(),
  };
}

/**
 * The race film's camera director over a watched run, from what it sees after each step: START, then shots based on
 * the shown vehicle, each drawn by `random` other than the one before or cut to by hand (`cut`, the shot before or
 * after in the table), then GOAL. A camera stands only while the run's resident route holds what it sees, from its
 * station on along the way it looks; a shot whose camera cannot stand is not taken, and one whose camera no longer can
 * stands at the last station that holds it and ends.
 */
export function createDemoDirector(definition: CameraDefinition, random: () => number) {
  const START = 0,
    GOAL = DEMO_SHOTS.length - 1;
  let index = START,
    steps = 0,
    // Whether the latest step cut to a new shot.
    cutNow = false,
    place: RoutePlace = { s: 0, l: 0, height: 0, aim: 0 },
    previousShown: number | null = null,
    // A cut by hand waiting for the next step: to the shot before or after.
    asked: -1 | 0 | 1 = 0,
    camera: CameraState | null = null;
  // Which side of the shown vehicle's line a camera beside it stands: toward the road's centre, on the road.
  const side = (l: number) => (l > 0 ? -1 : 1);
  // A shot's place from its base, its camera on the base's line or beside it.
  const placeOf = (row: DemoShot, sight: RunSight): RoutePlace => {
    const { s, l } = sight.shown.course;
    const line = row.base === 'REARMOST' ? 0 : l;
    const at = row.base === 'REARMOST' ? sight.rearmost : row.base === 'GOAL' ? sight.next!.s : s;
    return { s: at + row.ahead, l: line + side(line) * row.aside, height: row.height, aim: line, back: row.back };
  };
  // The first station a camera at `place` must find resident: its own, or the drawing depth behind it looking back.
  const needs = (place: RoutePlace) => place.s - (place.back ? RENDER_FAR_DEPTH_METERS : RENDER_NEAR_DEPTH_METERS);
  const stands = (place: RoutePlace, sight: RunSight) => needs(place) >= sight.retainedFrom;
  const cut = (next: number, at: RoutePlace) => {
    [index, steps, cutNow, place] = [next, 0, true, at];
  };
  // The shots based on the shown vehicle whose cameras can stand now, in the table's order.
  const open = (sight: RunSight) =>
    DEMO_SHOTS.flatMap((row, at) =>
      row.base === 'PLAYER' || (row.base === 'VEHICLE' && stands(placeOf(row, sight), sight)) ? [at] : [],
    );
  // Cut to one of them: drawn other than the shot shown, or by hand the first met going through the table from the shot
  // shown the way pressed.
  const advance = (sight: RunSight, by: -1 | 0 | 1) => {
    const shots = open(sight);
    let next = index;
    if (by === 0) next = shots[drawOther(shots.length, shots.indexOf(index), random)]!;
    else
      do next = (next + by + DEMO_SHOTS.length) % DEMO_SHOTS.length;
      while (!shots.includes(next));
    cut(next, placeOf(DEMO_SHOTS[next]!, sight));
  };
  return Object.freeze({
    get shot() {
      return DEMO_SHOTS[index]!.name;
    },
    /** The camera of the latest step; null in CHASE, the player's camera. */
    get camera(): CameraState | null {
      return camera;
    },
    /** Cut by hand, at the next step, to the shot before (-1) or after (1) the one shown; its cut runs from there. */
    cut(by: -1 | 1) {
      asked = by;
    },
    /** One step, after the run's, with what it sees of the run; whether it cut to a new shot. */
    step(sight: RunSight): boolean {
      cutNow = false;
      const { s } = sight.shown.course;
      const moved = previousShown === null ? 0 : s - previousShown;
      if (previousShown === null) cut(START, placeOf(DEMO_SHOTS[START]!, sight));
      previousShown = s;
      steps++;
      // A cut by hand takes the shot before or after; the next cut is the cut's time from it.
      if (asked !== 0) advance(sight, asked);
      asked = 0;
      let row = DEMO_SHOTS[index]!;
      if (row.speed > 0) place = { ...placeOf(row, sight), s: place.s + row.speed * moved };
      // The vehicle has left the picture: away ahead of a camera looking forward, at a camera looking back.
      const gone = s - place.s >= (place.back ? 0 : DEMO_FILM.away) || !stands(place, sight);
      const { next } = sight;
      if (row.base === 'REARMOST') {
        if (sight.status === 'RUNNING' && gone) advance(sight, 0);
      } else if (row.base !== 'GOAL') {
        const goal = next?.finish ? placeOf(DEMO_SHOTS[GOAL]!, sight) : null;
        if (goal && next!.s - s <= DEMO_FILM.goal.approach && goal.s - s >= DEMO_FILM.goal.clear) cut(GOAL, goal);
        else if (steps * SIM_DT >= DEMO_FILM.cut) advance(sight, 0);
        else if (row.base === 'VEHICLE' && gone) {
          // The vehicle has left the camera: the shot is set again on its row, keeping its time, if it can stand.
          const again = placeOf(row, sight);
          if (!stands(again, sight)) advance(sight, 0);
          else {
            const kept = steps;
            cut(index, again);
            steps = kept;
          }
        }
      }
      row = DEMO_SHOTS[index]!;
      // A camera the run's resident route no longer holds stands at the last station that holds it.
      if (!stands(place, sight)) place = { ...place, s: place.s + sight.retainedFrom - needs(place) };
      camera = row.base === 'PLAYER' ? null : routeCamera(sight.world, place, definition);
      return cutNow;
    },
  });
}
