import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { VehicleMetadata } from '../vehicle/definition-document.js';
import type { CourseIndex } from '../content/course-index.js';
import { THINNING_STEPS, thinLines } from '../view/line-thinning.js';
import { DEMO_TICKER, drawOther, tickerSteps, type DemoReel, type DemoSubjects } from './demo-director.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { SeriesClass } from '../content/series-catalog.js';
import { runPlayerColor } from '../race/run-setup.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { RunRequest } from './run-request.js';
import type { MainWorld } from './card-rows.js';

/** The longest turn of a class: a race longer than this is left before its goal. */
export const ATTRACT_SECONDS = 300;
/** A ticker's subject: its name, two spaces and its words. */
const subject = (name: string, words: string) => `${name}  ${words}`.toUpperCase();

/**
 * A machine's words, built from its listing's facts and nothing written for the demo (K, 2026-11-14): its period, its
 * identifier, its engine and its selected specification.
 */
export function machineWords(metadata: VehicleMetadata): string {
  const { period, identifier, engine, selectedSpecification } = metadata;
  return [period, identifier?.officialLabel, engine, ...selectedSpecification].filter(Boolean).join(', ');
}

/** A class's turn, waiting or shown: the class, its request and subjects, and its reel once loaded. */
interface DemoClass {
  readonly at: number;
  readonly request: RunRequest;
  readonly subjects: DemoSubjects;
  /** Chosen by hand: shown once loaded, ending the turn shown. */
  readonly chosen: boolean;
  reel: DemoReel | null;
  /** Replaced while loading: released once loaded. */
  dropped: boolean;
}

/** The class shown and how far its turn has gone: fixed steps shown, the film shown, and its subject and its start. */
interface Turn {
  readonly shown: DemoClass;
  steps: number;
  film: number;
  subject: number;
  subjectFrom: number;
}

/** What the demo takes from TITLE's row: LEFT and RIGHT cut to a shot, UP and DOWN choose the next class. */
export type DemoCommand = 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

/** The product's random source for the demo: a 32-bit generator (mulberry32) seeded with `seed`, the start time. */
export function createDemoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/**
 * The attract demo behind the main picture, from TITLE until a run starts (K, 2026-11-08), the one owner of the demo
 * runs and their turns: the product classes' RACEs, each turn a class drawn at random other than the one before (K,
 * 2026-11-14), its vehicle (of the class's) and color drawn plainly. It holds at most two reels, the shown class's and
 * the next class's, each a watched run in which that vehicle drives by its run driver, and its films ([demo
 * director](./demo-director.ts)): its course's and then its race's (K, 2026-11-12), each stepped in the race's fixed
 * step only while it is shown. A turn shows its films in order until the last ends (its run's GOAL or GAME OVER and its
 * RESULT delay), or `ATTRACT_SECONDS`, with no HUD and no sound. Every change of picture, a turn's, a film's or a
 * cut's, thins in over the frame drawn before it, and the first over black. Its one line of text, on TITLE alone (when
 * `draw` is given the text layer), is the ticker, which runs the shown film's subjects in turn, each to its end. When a
 * turn ends its reel is released; each turn has the next class's reel loaded, its run standing in READY, so only the
 * first turn waits on a load. A class that cannot load is passed over. `steer` takes TITLE's LEFT and RIGHT to the
 * shown film (the race film cuts to the shot before or after) and UP and DOWN to the next class: the class before or
 * after the shown one in the classes' order, or after the one chosen so, which replaces the drawn next class and ends
 * the shown turn once loaded. `random`, the demo's one random source, draws every choice; nothing of the race sees it.
 * `leave` ends the shown turn; the next `enter` resumes with the next class's turn. `dispose` releases every reel.
 */
export function createAttractDemo(
  classes: readonly SeriesClass[],
  vehicles: readonly CompiledVehicleDefinition[],
  courses: CourseIndex,
  random: () => number,
  assemble: (request: RunRequest, subjects: DemoSubjects, random: () => number) => Promise<DemoReel>,
): Omit<MainWorld, 'logo'> & { dispose(): void } {
  const draw = (count: number) => Math.floor(random() * count);
  // The class at `at` with its vehicle and color drawn.
  const classAt = (at: number, chosen: boolean): DemoClass => {
    const shown = classes[at]!;
    const vehicle = vehicles.find((v) => v.compiledVehicle.id === shown.vehicles[draw(shown.vehicles.length)])!;
    const colors = spriteSetColors(vehicle.spriteSet);
    const color = runPlayerColor(shown, vehicle, colors[draw(colors.length)]!);
    const { metadata } = vehicle.listing,
      course = courses.find((entry) => entry.id === shown.course);
    return {
      at,
      request: Object.freeze({
        seriesId: shown.series.id,
        classId: shown.id,
        session: 'RACE',
        vehicleId: vehicle.compiledVehicle.id,
        color,
        track: null,
      }),
      subjects: {
        course: subject(course?.name ?? shown.course, course?.description ?? ''),
        series: subject(`${shown.series.title} ${shown.title}`, shown.series.description),
        machine: subject(
          `${metadata.manufacturer} ${metadata.model} ${vehicle.listing.visuals.colorNames[color]!}`,
          machineWords(metadata),
        ),
      },
      chosen,
      reel: null,
      dropped: false,
    };
  };
  const showSteps = Math.round(ATTRACT_SECONDS / SIM_DT);
  const failed = new Set<number>();
  let turn: Turn | null = null,
    next: DemoClass | null = null,
    entered = false,
    disposed = false,
    // The frame drawn last, which a change of picture thins over (black before the first), and how far it has gone.
    left: Uint16Array | null = null,
    thinning = THINNING_STEPS;
  // A turn's class released: its reel, or once loaded the reel it is loading.
  const release = (ended: DemoClass | null) => {
    if (!ended) return;
    ended.dropped = true;
    ended.reel?.dispose();
    ended.reel = null;
  };
  // Choose the next turn's class, `at` by hand or else drawn other than the shown one, and load it; it replaces the next.
  const prepare = (at: number | null) => {
    const open = classes.flatMap((_, i) => (failed.has(i) ? [] : [i]));
    if (open.length === 0) return;
    release(next);
    const entry = (next = classAt(
      at ?? open[drawOther(open.length, open.indexOf(turn?.shown.at ?? -1), random)]!,
      at !== null,
    ));
    assemble(entry.request, entry.subjects, random).then(
      (reel) => {
        if (disposed || entry.dropped) return reel.dispose();
        entry.reel = reel;
        if (!turn) begin();
        else if (entry.chosen) end();
      },
      (error: unknown) => {
        // A class that cannot load is passed over; with none loadable the main world stays over black.
        console.error('Attract demo could not start', error);
        failed.add(entry.at);
        if (next === entry) [next, entry.dropped] = [null, true];
        if (!next && !disposed) prepare(null);
      },
    );
  };
  // Begin the next class's turn once its reel is loaded; the class after it loads meanwhile.
  const begin = () => {
    if (!entered || turn || disposed || !next?.reel) return;
    turn = { shown: next, steps: 0, film: 0, subject: 0, subjectFrom: 0 };
    [next, thinning] = [null, 0];
    prepare(null);
  };
  // The turn has ended: its reel is released, and the next class's turn begins.
  const end = () => {
    release(turn!.shown);
    turn = null;
    begin();
  };
  return {
    enter() {
      entered = true;
      if (!next) prepare(null);
      begin();
    },
    leave() {
      entered = false;
      // Leaving ends the shown turn; returning resumes with the next class's turn, whose run stands loaded.
      release(turn?.shown ?? null);
      turn = null;
    },
    steer(command: DemoCommand) {
      if (command === 'LEFT' || command === 'RIGHT') {
        if (turn) turn.shown.reel!.films[turn.film]!.cut?.(command === 'LEFT' ? -1 : 1);
        return;
      }
      // UP and DOWN: the class before or after the shown one, or the one chosen so, passing over those that failed.
      const from = next && (next.chosen || !turn) ? next.at : turn?.shown.at;
      if (from === undefined || failed.size === classes.length) return;
      let at = from;
      do at = (at + (command === 'UP' ? -1 : 1) + classes.length) % classes.length;
      while (failed.has(at));
      prepare(at);
    },
    tick() {
      if (!turn) return;
      const { films } = turn.shown.reel!;
      thinning++;
      // An ended film gives way to the next, which thins in, its first subject starting on the ticker.
      if (films[turn.film]!.ended && turn.film + 1 < films.length)
        [turn.film, turn.subject, turn.subjectFrom, thinning] = [turn.film + 1, 0, turn.steps, 0];
      const film = films[turn.film]!;
      // A subject that has run to its end gives way to the film's next.
      if (turn.steps - turn.subjectFrom >= tickerSteps(film.subjects[turn.subject]!))
        [turn.subject, turn.subjectFrom] = [(turn.subject + 1) % film.subjects.length, turn.steps];
      if (film.step()) thinning = 0;
      turn.steps++;
      if (turn.steps >= showSteps || (turn.film + 1 === films.length && film.ended)) end();
    },
    draw(frame: SoftwareSurface, text: TextLayer | null) {
      if (!turn) return false;
      const film = turn.shown.reel!.films[turn.film]!;
      film.draw(frame);
      left ??= new Uint16Array(frame.pixels.length);
      if (thinning < THINNING_STEPS)
        thinLines(frame.pixels, left, frame.width, frame.height, (thinning + 1) / THINNING_STEPS);
      left.set(frame.pixels);
      if (text) {
        // The ticker: the shown subject from the right edge, a character every few steps.
        const shown = film.subjects[turn.subject]!,
          at = DEMO_TICKER.columns - Math.floor((turn.steps - turn.subjectFrom) / DEMO_TICKER.stepsPerColumn);
        for (let column = Math.max(0, at); column < DEMO_TICKER.columns; column++) {
          const character = shown[column - at];
          if (character && character !== ' ') text.write(column, DEMO_TICKER.row, character, TEXT_PALETTES.WHITE);
        }
      }
      return true;
    },
    dispose() {
      disposed = true;
      release(turn?.shown ?? null);
      release(next);
      [turn, next] = [null, null];
    },
  };
}

/** The product classes whose RACEs the attract demo runs, in series and class order. */
export function attractClasses(series: readonly { readonly dev: boolean; readonly classes: readonly SeriesClass[] }[]) {
  return series.filter((s) => !s.dev).flatMap((s) => s.classes);
}
