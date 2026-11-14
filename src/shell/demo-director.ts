import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseStartGrid } from '../course/compiler/course-rules.js';
import { gridRouteS } from '../course/course-route.js';
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
 * of the shown vehicle's speed (0 stands), following the vehicle's line; the shown vehicle `away` past it, the shot is
 * set again on its row. CHASE alone has no place: it is the player's camera, the run seen as it is played.
 */
export interface DemoShot {
  readonly name: string;
  readonly base: 'VEHICLE' | 'REARMOST' | 'GOAL' | 'PLAYER';
  readonly ahead: number;
  readonly aside: number;
  readonly height: number;
  readonly speed: number;
  readonly back: boolean;
  readonly away: number;
}

const shot = (
  name: string,
  base: DemoShot['base'],
  [ahead, aside, height, speed]: readonly [number, number, number, number],
  back: boolean,
  away: number,
): DemoShot => Object.freeze({ name, base, ahead, aside, height, speed, back, away });

/** The race film's shots: metres, and shares of the shown vehicle's speed. START opens it and GOAL closes it. */
export const DEMO_SHOTS: readonly DemoShot[] = Object.freeze([
  shot('START', 'REARMOST', [-10, 0, 3, 0], false, 150),
  shot('FIXED', 'VEHICLE', [30, 3.5, 1.5, 0], false, 150),
  shot('PASSED', 'VEHICLE', [25, 2.5, 1.2, 0.7], false, 120),
  shot('LEFT', 'VEHICLE', [-6, 0, 2, 0.8], false, 60),
  shot('CHASE', 'PLAYER', [0, 0, 0, 0], false, 0),
  shot('LOW', 'VEHICLE', [-4, 0, 0.5, 1], false, 60),
  shot('QUARTER', 'VEHICLE', [-5, 3, 1.2, 1], false, 60),
  shot('FRONT', 'VEHICLE', [8, 0, 1.2, 1], true, 60),
  shot('FRONT QUARTER', 'VEHICLE', [6, 3, 1.2, 1], true, 60),
  shot('APPROACH', 'VEHICLE', [120, 3.5, 1.5, 0], true, 0),
  shot('GOAL', 'GOAL', [-15, 3.5, 1.5, 0], false, 0),
]);

/**
 * The films' timing: the course film's camera travels the road's centre at `intro.speed` m/s (100 km/h), `intro.height`
 * over it, from the front of the grid; every shot but START and GOAL lasts `cut` seconds; GOAL takes over once the shown
 * vehicle has `goal.approach` to go to the line it finishes at, while its camera is still `goal.clear` ahead of it.
 */
export const DEMO_FILM = Object.freeze({
  intro: { speed: 100 / 3.6, height: 4 },
  cut: 15,
  goal: { approach: 150, clear: 20 },
});

/**
 * The demo's words run along one row of the frame's text from its right edge, a character every `stepsPerColumn`
 * fixed steps, until the last has left at the left.
 */
export const DEMO_TICKER = Object.freeze({ stepsPerColumn: 3, columns: 40 });

/** How many fixed steps `words` take to run along the ticker once. */
export const tickerSteps = (words: string) => (words.length + DEMO_TICKER.columns) * DEMO_TICKER.stepsPerColumn;

/** One film of the attract demo: a picture that moves on step by step until it ends, and the words run over it. */
export interface Film {
  /** One fixed step; whether it cut to a new picture, which thins in over the last as every change of the demo does. */
  step(): boolean;
  /** Draw its picture into `frame` through its camera of the latest step. */
  draw(frame: SoftwareSurface): void;
  /** Whether it has ended. */
  readonly ended: boolean;
  /** The words the ticker runs over it. */
  readonly words: string;
}

/**
 * The course film: a camera travelling the road's centre (`DEMO_FILM.intro`) over a course scene of its own with no
 * vehicle, its window following the camera, each fork taking its first exit. It ends when its `words` have run once on
 * the ticker, or short of a route's end.
 */
export function createCourseFilm(
  course: CompiledCourse,
  vehicles: readonly CompiledVehicleDefinition[],
  definition: CameraDefinition,
  words: string,
): Film {
  const scene = createCourseScene(course.entry, course.gates, vehicles);
  const { runtime } = scene;
  const steps = tickerSteps(words);
  let s = Math.max(...courseStartGrid(course.gates, false).map((slot) => gridRouteS(runtime.route, slot))),
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
    words,
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
 * The reel of a watched `run`: its course film over the course's words, then its race film over the series': the run,
 * stepped until it has `finished`, seen through its director's shots and drawn into the page's frame.
 */
export function createDemoReel(
  run: Run,
  finished: () => boolean,
  vehicles: readonly CompiledVehicleDefinition[],
  definition: CameraDefinition,
  words: { readonly course: string; readonly series: string },
): DemoReel {
  const director = createDemoDirector(definition);
  let cut = false;
  const look: RunLook = (sight) => {
    cut = director.step(sight);
    return director.camera;
  };
  const race: Film = {
    words: words.series,
    get ended() {
      return finished();
    },
    step() {
      cut = false;
      if (!finished()) run.tick(look);
      return cut;
    },
    draw: () => run.draw(),
  };
  return {
    films: [createCourseFilm(run.course, vehicles, definition, words.course), race],
    dispose: () => run.dispose(),
  };
}

/**
 * The race film's camera director over a watched run, from what it sees after each step: START, then the shots based
 * on the shown vehicle in the table's order, then GOAL. A camera stands only while the run's resident route holds what
 * it sees, from its station on along the way it looks; one that would not ends its shot, standing at the last station
 * that holds it.
 */
export function createDemoDirector(definition: CameraDefinition) {
  const START = 0,
    GOAL = DEMO_SHOTS.length - 1;
  let index = START,
    steps = 0,
    // Whether the latest step cut to a new shot.
    cutNow = false,
    place: RoutePlace = { s: 0, l: 0, height: 0, aim: 0 },
    previousShown: number | null = null,
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
  // The next shot based on the shown vehicle, in the table's order, whose camera can stand.
  const advance = (sight: RunSight) => {
    for (let next = index + 1; ; next++) {
      const row = DEMO_SHOTS[next % GOAL]!;
      if (row.base !== 'VEHICLE' && row.base !== 'PLAYER') continue;
      const at = placeOf(row, sight);
      if (row.base === 'PLAYER' || stands(at, sight)) return cut(next % GOAL, at);
    }
  };
  return Object.freeze({
    get shot() {
      return DEMO_SHOTS[index]!.name;
    },
    /** The camera of the latest step; null in CHASE, the player's camera. */
    get camera(): CameraState | null {
      return camera;
    },
    /** One step, after the run's, with what it sees of the run; whether it cut to a new shot. */
    step(sight: RunSight): boolean {
      cutNow = false;
      const { s } = sight.shown.course;
      const moved = previousShown === null ? 0 : s - previousShown;
      if (previousShown === null) cut(START, placeOf(DEMO_SHOTS[START]!, sight));
      previousShown = s;
      steps++;
      let row = DEMO_SHOTS[index]!;
      if (row.speed > 0) place = { ...placeOf(row, sight), s: place.s + row.speed * moved };
      const gone = s - place.s >= row.away || !stands(place, sight);
      const { next } = sight;
      if (row.base === 'REARMOST') {
        if (sight.status === 'RUNNING' && gone) advance(sight);
      } else if (row.base !== 'GOAL') {
        const goal = next?.finish ? placeOf(DEMO_SHOTS[GOAL]!, sight) : null;
        if (goal && next!.s - s <= DEMO_FILM.goal.approach && goal.s - s >= DEMO_FILM.goal.clear) cut(GOAL, goal);
        else if (steps * SIM_DT >= DEMO_FILM.cut) advance(sight);
        else if (row.base === 'VEHICLE' && gone) {
          // The vehicle has left the camera: the shot is set again on its row, keeping its time, if it can stand.
          const again = placeOf(row, sight);
          if (!stands(again, sight)) advance(sight);
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
