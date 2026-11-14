import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { CourseIndex } from '../content/course-index.js';
import { THINNING_STEPS, thinLines } from '../view/line-thinning.js';
import { DEMO_TICKER, type DemoReel } from './demo-director.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { RunRequest } from './run-request.js';
import type { MainWorld } from './card-rows.js';

/** The longest turn of a class: a race longer than this is left before its goal. */
export const ATTRACT_SECONDS = 300;
/** The overlay's last column and rows: series, class, vehicle and color; and the ticker's row. */
const OVERLAY = Object.freeze({ lastColumn: 38, series: 21, class: 22, vehicle: 24, color: 25, ticker: 27 });
/** The space between the ticker's words and their next run. */
const TICKER_GAP = '    ';

/** One class of the demo: its request, its overlay, its words and its reel, while it holds one. */
interface DemoClass {
  readonly request: RunRequest;
  readonly lines: readonly (readonly [row: number, text: string])[];
  /** The ticker's words: the course's description over the course film, the series' over the race film. */
  readonly words: { readonly course: string; readonly series: string };
  reel: DemoReel | null;
  loading: boolean;
  failed: boolean;
}

/** The class shown and how far its turn has gone: fixed steps shown, the film shown and when its words began. */
interface Turn {
  readonly shown: DemoClass;
  steps: number;
  film: number;
  wordsFrom: number;
}

/**
 * The attract demo behind the main picture, from TITLE until a run starts (K, 2026-11-08), the one owner of the demo
 * runs and their turns: the product classes' RACEs, in series and class order, looping. It holds at most two reels,
 * the shown class's and the next class's, each a watched run in which the class's first vehicle in its first color
 * drives by its run driver, and its films ([demo director](./demo-director.ts)): its course's and then its race's (K,
 * 2026-11-12), each stepped in the race's fixed step only while it is shown. A turn shows its films in order until the
 * last ends (its run's GOAL or GAME OVER and its RESULT delay), or `ATTRACT_SECONDS`, with no HUD and no sound. Every
 * change of picture, a turn's, a film's or a cut's, thins in over the frame drawn before it, and the first over black.
 * On TITLE alone (when `draw` is given the text layer) its series, class, vehicle and color are written at the right,
 * and the ticker runs the shown film's words again and again. When a turn ends its reel is released; each turn has the
 * next class's reel loaded, its run standing in READY, so only the first turn waits on a load, and a class shown again
 * starts a new run. A class that cannot load is passed over. `leave` ends the shown turn; the next `enter` resumes with
 * the next class's turn. `dispose` releases every reel.
 */
export function createAttractDemo(
  classes: readonly SeriesClass[],
  vehicles: readonly CompiledVehicleDefinition[],
  courses: CourseIndex,
  assemble: (request: RunRequest, words: DemoClass['words']) => Promise<DemoReel>,
): Omit<MainWorld, 'logo'> & { dispose(): void } {
  const demo = classes.map((chosen): DemoClass => {
    const vehicle = vehicles.find((v) => v.compiledVehicle.id === chosen.vehicles[0])!;
    const color = spriteSetColors(vehicle.spriteSet)[0]!;
    const { manufacturer, model } = vehicle.listing.metadata;
    return {
      request: Object.freeze({
        seriesId: chosen.series.id,
        classId: chosen.id,
        session: 'RACE',
        vehicleId: vehicle.compiledVehicle.id,
        color,
        track: null,
      }),
      lines: [
        [OVERLAY.series, chosen.series.title],
        [OVERLAY.class, chosen.title],
        [OVERLAY.vehicle, `${manufacturer} ${model}`.toUpperCase()],
        [OVERLAY.color, vehicle.listing.visuals.colorNames[color]!],
      ],
      words: {
        course: courses.find((course) => course.id === chosen.course)?.description ?? '',
        series: chosen.series.description,
      },
      reel: null,
      loading: false,
      failed: false,
    };
  });
  const showSteps = Math.round(ATTRACT_SECONDS / SIM_DT);
  let index = 0,
    turn: Turn | null = null,
    entered = false,
    disposed = false,
    // The frame drawn last, which a change of picture thins over (black before the first), and how far it has gone.
    left: Uint16Array | null = null,
    thinning = THINNING_STEPS;
  // Load a class's reel (loading only: its run stands in READY until its turn), unless it has one or is loading.
  const ensure = (at: number) => {
    const entry = demo[at % demo.length];
    if (!entry || entry.reel || entry.loading || entry.failed) return;
    entry.loading = true;
    assemble(entry.request, entry.words).then(
      (reel) => {
        entry.loading = false;
        if (disposed) return reel.dispose();
        entry.reel = reel;
        if (!turn) begin();
      },
      (error: unknown) => {
        // A class that cannot load is passed over; with none loadable the main world stays over black.
        console.error('Attract demo could not start', error);
        entry.loading = false;
        entry.failed = true;
        if (!turn) begin();
      },
    );
  };
  // Begin the turn of the class at `index`, passing over classes that failed, once its reel is loaded; the next
  // class loads meanwhile.
  const begin = () => {
    if (!entered || turn || disposed) return;
    for (let i = 0; i < demo.length && demo[index]!.failed; i++) index = (index + 1) % demo.length;
    const entry = demo[index];
    if (!entry || entry.failed) return;
    ensure(index);
    if (!entry.reel) return;
    turn = { shown: entry, steps: 0, film: 0, wordsFrom: 0 };
    thinning = 0;
    ensure(index + 1);
  };
  // A turn has ended: its reel is released, and a class shown again starts a new one.
  const release = (ended: DemoClass) => {
    ended.reel?.dispose();
    ended.reel = null;
  };
  // The turn has darkened: the next class's turn begins.
  const end = () => {
    const ended = turn!.shown;
    turn = null;
    release(ended);
    index = (index + 1) % demo.length;
    begin();
  };
  return {
    enter() {
      entered = true;
      begin();
    },
    leave() {
      entered = false;
      // Leaving ends the shown turn; returning resumes with the next class's turn, whose run stands loaded.
      if (!turn) return;
      release(turn.shown);
      [turn, index] = [null, (index + 1) % demo.length];
    },
    tick() {
      if (!turn) return;
      const { films } = turn.shown.reel!;
      thinning++;
      // An ended film gives way to the next, which thins in, its words starting on the ticker.
      if (films[turn.film]!.ended && turn.film + 1 < films.length)
        [turn.film, turn.wordsFrom, thinning] = [turn.film + 1, turn.steps, 0];
      const film = films[turn.film]!;
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
        for (const [row, line] of turn.shown.lines)
          text.write(OVERLAY.lastColumn + 1 - line.length, row, line, TEXT_PALETTES.WHITE);
        // The ticker: its words, then a gap, from the right edge, a character every few steps.
        const run = `${film.words}${TICKER_GAP}`,
          moved = Math.floor((turn.steps - turn.wordsFrom) / DEMO_TICKER.stepsPerColumn),
          length = run.length + DEMO_TICKER.columns,
          at = DEMO_TICKER.columns - (moved % length);
        for (let column = Math.max(0, at); column < DEMO_TICKER.columns; column++) {
          const character = run[column - at];
          if (character && character !== ' ') text.write(column, OVERLAY.ticker, character, TEXT_PALETTES.WHITE);
        }
      }
      return true;
    },
    dispose() {
      disposed = true;
      turn = null;
      for (const entry of demo) release(entry);
    },
  };
}

/** The product classes whose RACEs the attract demo runs, in series and class order. */
export function attractClasses(series: readonly { readonly dev: boolean; readonly classes: readonly SeriesClass[] }[]) {
  return series.filter((s) => !s.dev).flatMap((s) => s.classes);
}
