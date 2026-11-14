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
 * The race film's shots (K, 2026-11-12): START stands behind the grid; the race cycles FIXED, PASSED, LEFT and CHASE;
 * GOAL stands before the line the shown vehicle finishes at.
 */
export type DemoShot = 'START' | 'FIXED' | 'PASSED' | 'LEFT' | 'CHASE' | 'GOAL';

/**
 * How the shots are taken, metres, seconds and shares of the shown vehicle's speed:
 *
 * - `intro`: the course film's camera, along the centre of the road at `speed` m/s (100 km/h), `height` over it, from
 *   the front of the grid;
 * - `start`: `behind` the rearmost vehicle on the grid, `height` over the road's centre, until the shown vehicle is
 *   `away` from it;
 * - `fixed`: a point `ahead` of the shown vehicle and `aside` of its line toward the road's centre, `height` over the
 *   road, until it is `away`; then the next point ahead of it;
 * - `passed`: `ahead` of it and `aside`, `height` over the road, travelling at `speed` of its speed until it is `away`;
 * - `left`: right behind it from `behind`, `height` over the road, travelling at `speed` of its speed; back right
 *   behind it once it is `away`;
 * - `chase`: the player's camera;
 * - `goal`: `before` the finishing line and `aside` toward the centre, `height` over the road, from when the shown
 *   vehicle has `approach` to go to the line, if it is still `clear` short of the camera.
 *
 * Every camera but `chase` looks along the road ([route camera](../view/route-camera.ts)): the intro's and START's
 * along its centre, the others along the shown vehicle's line. The race's shots after START take turns, each `cut`
 * seconds; a shot that ends sooner ends there, and FIXED ends at its next point after its time.
 */
export const DEMO_SHOTS = Object.freeze({
  intro: { speed: 100 / 3.6, height: 4 },
  start: { behind: 10, height: 3, away: 150 },
  fixed: { ahead: 30, aside: 3.5, height: 1.5, away: 150 },
  passed: { ahead: 25, aside: 2.5, height: 1.2, speed: 0.7, away: 120 },
  left: { behind: 6, height: 2, speed: 0.8, away: 60 },
  goal: { before: 15, aside: 3.5, height: 1.5, approach: 150, clear: 20 },
  cut: 15,
  race: ['FIXED', 'PASSED', 'LEFT', 'CHASE'] as const,
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
 * The course film: a camera travelling the road's centre (`DEMO_SHOTS.intro`) over a course scene of its own with no
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
    camera = routeCamera(scene.world, { s, l: 0, height: DEMO_SHOTS.intro.height, aim: 0 }, definition);
  };
  travel();
  return {
    words,
    get ended() {
      return ended;
    },
    step() {
      s += DEMO_SHOTS.intro.speed * SIM_DT;
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
 * The race film's camera director: START, the race's turns and GOAL over a watched run, from what it sees after each
 * step. It keeps every camera within the run's resident route: a shot that would leave it ends.
 */
export function createDemoDirector(definition: CameraDefinition) {
  let shot: DemoShot = 'START',
    shotSteps = 0,
    // Whether the latest step cut to a new shot.
    cutNow = false,
    // The race's turn: which of `DEMO_SHOTS.race` is shown.
    turn = -1,
    place: RoutePlace = { s: 0, l: 0, height: DEMO_SHOTS.start.height, aim: 0 },
    previousShown: number | null = null,
    // Whether START has its place: behind the grid as the run first shows it.
    started = false,
    camera: CameraState | null = null;
  const cut = (next: DemoShot, at: RoutePlace) => {
    shot = next;
    shotSteps = 0;
    cutNow = true;
    place = at;
  };
  // Which side of the shown vehicle's line a camera beside it stands: toward the road's centre, on the road.
  const side = (l: number) => (l > 0 ? -1 : 1);
  // A camera beside the shown vehicle's line at `l`, `ahead` of it at `s`, looking along its line.
  const beside = (s: number, l: number, at: { readonly aside: number; readonly height: number }, ahead: number) => ({
    s: s + ahead,
    l: l + side(l) * at.aside,
    height: at.height,
    aim: l,
  });
  const raceShot = (facts: RunSight) => {
    turn = (turn + 1) % DEMO_SHOTS.race.length;
    const next = DEMO_SHOTS.race[turn]!;
    const { s, l } = facts.shown.course;
    if (next === 'FIXED') cut(next, beside(s, l, DEMO_SHOTS.fixed, DEMO_SHOTS.fixed.ahead));
    else if (next === 'PASSED') cut(next, beside(s, l, DEMO_SHOTS.passed, DEMO_SHOTS.passed.ahead));
    else if (next === 'LEFT') cut(next, { s: s - DEMO_SHOTS.left.behind, l, height: DEMO_SHOTS.left.height, aim: l });
    else cut(next, place);
  };
  return Object.freeze({
    get shot() {
      return shot;
    },
    /** The camera of the latest step; null in CHASE, the player's camera. */
    get camera(): CameraState | null {
      return camera;
    },
    /** One step, after the run's, with what it sees of the run; whether it cut to a new shot. */
    step(facts: RunSight): boolean {
      shotSteps++;
      cutNow = false;
      const { s, l } = facts.shown.course;
      const moved = previousShown === null ? 0 : s - previousShown;
      previousShown = s;
      const lowest = facts.retainedFrom + RENDER_NEAR_DEPTH_METERS;
      if (!started) {
        started = true;
        place = {
          s: Math.max(lowest, facts.rearmost - DEMO_SHOTS.start.behind),
          l: 0,
          height: DEMO_SHOTS.start.height,
          aim: 0,
        };
      }
      // GOAL takes over the shot once the shown vehicle nears the line it finishes at, while it is short of the camera.
      const { next } = facts;
      if (
        shot !== 'GOAL' &&
        shot !== 'START' &&
        next?.finish &&
        next.s - s <= DEMO_SHOTS.goal.approach &&
        next.s - DEMO_SHOTS.goal.before - s >= DEMO_SHOTS.goal.clear
      )
        cut('GOAL', beside(s, l, DEMO_SHOTS.goal, next.s - DEMO_SHOTS.goal.before - s));
      const away = s - place.s;
      const timeUp = shotSteps * SIM_DT >= DEMO_SHOTS.cut;
      if (shot === 'START') {
        if (facts.status === 'RUNNING' && (away >= DEMO_SHOTS.start.away || place.s < lowest)) raceShot(facts);
      } else if (shot === 'FIXED') {
        if (away >= DEMO_SHOTS.fixed.away || place.s < lowest) {
          if (timeUp) raceShot(facts);
          else {
            const kept = shotSteps;
            cut('FIXED', beside(s, l, DEMO_SHOTS.fixed, DEMO_SHOTS.fixed.ahead));
            shotSteps = kept;
          }
        }
      } else if (shot === 'PASSED') {
        place = { ...place, s: place.s + DEMO_SHOTS.passed.speed * moved };
        if (away >= DEMO_SHOTS.passed.away || timeUp || place.s < lowest) raceShot(facts);
      } else if (shot === 'LEFT') {
        place = { s: place.s + DEMO_SHOTS.left.speed * moved, l, height: DEMO_SHOTS.left.height, aim: l };
        if (timeUp) raceShot(facts);
        else if (away >= DEMO_SHOTS.left.away || place.s < lowest) {
          const kept = shotSteps;
          cut('LEFT', { s: s - DEMO_SHOTS.left.behind, l, height: DEMO_SHOTS.left.height, aim: l });
          shotSteps = kept;
        }
      } else if (shot === 'CHASE') {
        if (timeUp) raceShot(facts);
      }
      // A roadside camera the run's resident route no longer holds stands at its first station.
      if (place.s < lowest) place = { ...place, s: lowest };
      camera = shot === 'CHASE' ? null : routeCamera(facts.world, place, definition);
      return cutNow;
    },
  });
}
