import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseStartGrid } from '../course/compiler/course-rules.js';
import { gridRouteS } from '../course/course-route.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { RaceStatus } from '../race/course-race.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CameraDefinition, CameraState } from '../view/camera.js';
import { RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS } from '../view/camera.js';
import { createCourseScene } from '../view/course-scene.js';
import { routeCamera, type RoutePlace } from '../view/route-camera.js';

/**
 * The attract demo's shots (K, 2026-11-12). INTRO travels the road with no vehicle on it; START stands behind the grid;
 * the race cycles FIXED, PASSED, LEFT and CHASE; GOAL stands before the line the shown vehicle finishes at.
 */
export type DemoShot = 'INTRO' | 'START' | 'FIXED' | 'PASSED' | 'LEFT' | 'CHASE' | 'GOAL';

/**
 * How the shots are taken, metres, seconds and shares of the shown vehicle's speed:
 *
 * - `intro`: along the centre of the road at `speed` m/s (100 km/h), `height` over it, from the front of the grid;
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

/** A cut thins from the frame it leaves to the new shot over this many fixed steps, as every change here does. */
export const DEMO_THIN_STEPS = 16;

/**
 * The demo's words run along one row of the frame's text from its right edge, a character every `stepsPerColumn`
 * fixed steps, until the last has left at the left.
 */
export const DEMO_TICKER = Object.freeze({ stepsPerColumn: 3, columns: 40 });

/** How many fixed steps `words` take to run along the ticker once. */
export const tickerSteps = (words: string) => (words.length + DEMO_TICKER.columns) * DEMO_TICKER.stepsPerColumn;

/** What the director reads of the run after each of its steps. */
export interface DemoFacts {
  readonly status: RaceStatus;
  /** The shown vehicle: the player's run driver's. */
  readonly shown: { readonly course: { readonly s: number; readonly l: number } };
  /** The race line the shown vehicle crosses next, and whether it finishes there; null when none is left. */
  readonly next: { readonly s: number; readonly finish: boolean } | null;
  /** The rearmost competitor's route station. */
  readonly rearmost: number;
  /** The run's world, and the first route station resident in it. */
  readonly world: { readonly coordinates: PlanCoordinateReader; readonly height: ProfileReader };
  readonly retainedFrom: number;
  /** The player's camera this step. */
  readonly chase: CameraState;
}

/**
 * The attract demo's camera director for one run: INTRO over a course scene of its own, until its words have run once
 * (`introSteps`), while the run waits; then START, the race's turns and GOAL over the run. It keeps every camera within
 * the run's resident route: a shot that would leave it ends.
 */
export function createDemoDirector(
  course: CompiledCourse,
  vehicles: readonly CompiledVehicleDefinition[],
  definition: CameraDefinition,
  introSteps: number,
) {
  // The intro's own scene: no vehicle, its window following the camera, each fork taking its first exit.
  let intro: ReturnType<typeof createCourseScene> | null = createCourseScene(course.entry, course.gates, vehicles);
  const grid = courseStartGrid(course.gates, false);
  let introS = Math.max(...grid.map((slot) => gridRouteS(intro!.runtime.route, slot)));
  let shot: DemoShot = 'INTRO',
    shotSteps = 0,
    // Steps since the latest cut, which the thinning reads; the run's first frame is no cut.
    cutSteps = DEMO_THIN_STEPS,
    // The race's turn: which of `DEMO_SHOTS.race` is shown.
    turn = -1,
    place: RoutePlace = { s: introS, l: 0, height: DEMO_SHOTS.intro.height, aim: 0 },
    previousShown: number | null = null,
    // Whether START has its place: behind the grid as the run first shows it.
    started = false,
    camera: CameraState | null = null;
  const advanceIntro = () => {
    const { runtime } = intro!;
    const { route } = runtime;
    const tail = route.occurrences.at(-1)!;
    if (tail.section.outgoing.length > 1 && introS + runtime.coverage.forwardMeters > route.end)
      runtime.selectSuccessor(tail.section.outgoing[0]!);
    runtime.refresh(introS, introS);
    place = { s: introS, l: 0, height: DEMO_SHOTS.intro.height, aim: 0 };
    camera = routeCamera(intro!.world, place, definition);
  };
  advanceIntro();
  const cut = (next: DemoShot, at: RoutePlace) => {
    shot = next;
    shotSteps = 0;
    cutSteps = 0;
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
  const raceShot = (facts: DemoFacts) => {
    turn = (turn + 1) % DEMO_SHOTS.race.length;
    const next = DEMO_SHOTS.race[turn]!;
    const { s, l } = facts.shown.course;
    if (next === 'FIXED') cut(next, beside(s, l, DEMO_SHOTS.fixed, DEMO_SHOTS.fixed.ahead));
    else if (next === 'PASSED') cut(next, beside(s, l, DEMO_SHOTS.passed, DEMO_SHOTS.passed.ahead));
    else if (next === 'LEFT') cut(next, { s: s - DEMO_SHOTS.left.behind, l, height: DEMO_SHOTS.left.height, aim: l });
    else cut(next, place);
  };
  return Object.freeze({
    /** Whether the intro is still shown, the run waiting. */
    get introducing() {
      return intro !== null;
    },
    /** The intro's scene while it is shown. */
    get introScene() {
      return intro;
    },
    get shot() {
      return shot;
    },
    /** Steps since the latest cut. */
    get cutSteps() {
      return cutSteps;
    },
    /** Whether the player's picture is drawn as the player's camera draws it: in CHASE alone. */
    get chasing() {
      return shot === 'CHASE';
    },
    get camera(): CameraState {
      return camera!;
    },
    /** One step: of the intro, while it is shown; else after the run's step, with what it reads of the run. */
    step(facts: DemoFacts | null) {
      shotSteps++;
      cutSteps++;
      if (intro) {
        introS += DEMO_SHOTS.intro.speed * SIM_DT;
        const end = intro.runtime.route.terminal;
        if (shotSteps > introSteps || (end !== null && introS + RENDER_FAR_DEPTH_METERS / 4 > end)) {
          intro = null;
          shot = 'START';
          shotSteps = 0;
          cutSteps = 0;
          return;
        }
        return advanceIntro();
      }
      if (!facts) throw new Error('The demo director steps the run with its facts');
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
      camera = shot === 'CHASE' ? facts.chase : routeCamera(facts.world, place, definition);
    },
    /** Release the intro's scene. */
    dispose() {
      intro = null;
    },
  });
}
export type DemoDirector = ReturnType<typeof createDemoDirector>;
