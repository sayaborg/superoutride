import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { CourseIndex } from '../content/course-index.js';
import { lineThinningRanks, newLineCount } from '../view/line-thinning.js';
import { DEMO_THIN_STEPS, DEMO_TICKER } from './demo-director.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { RunRequest } from './run-request.js';
import type { Run } from './run-assembly.js';
import type { MainWorld } from './card-rows.js';

/** The longest turn of a class: a race longer than this is left before its goal. */
export const ATTRACT_SECONDS = 300;
/** The overlay's last column and rows: series, class, vehicle and color; and the ticker's row. */
const OVERLAY = Object.freeze({ lastColumn: 38, series: 21, class: 22, vehicle: 24, color: 25, ticker: 27 });
/** The space between the ticker's words and their next run. */
const TICKER_GAP = '    ';

/** A demo run as a run, and whether it has ended and stood its RESULT delay. */
export interface DemoRun {
  readonly run: Run;
  finished(): boolean;
}

/** One class of the demo: its request, its overlay, its words and its live run, while it holds one. */
interface DemoClass {
  readonly request: RunRequest;
  readonly lines: readonly (readonly [row: number, text: string])[];
  /** The ticker's words: the course's description over the intro, the series' over the race. */
  readonly words: { readonly intro: string; readonly race: string };
  demo: DemoRun | null;
  loading: boolean;
  failed: boolean;
}

/** The class shown and how far its turn has gone: fixed steps shown, and the ticker's words and their start. */
interface Turn {
  readonly shown: DemoClass;
  steps: number;
  words: string;
  wordsFrom: number;
}

/**
 * The attract demo behind the main picture, from TITLE until a run starts (K, 2026-11-08), the one owner of the demo
 * runs and their turns: the product classes' RACEs, in series and class order, looping. It holds at most two runs, the
 * shown class's and the next class's, each a run with no player input in which the class's first vehicle in its first
 * color drives by its run driver, stepped in the race's fixed step only while its turn is shown. A run shows its course
 * first and then its race as the demo's director takes them (K, 2026-11-12; [demo director](./demo-director.ts)); its
 * turn lasts until its run ends (GOAL or GAME OVER) and has stood its RESULT delay, or `ATTRACT_SECONDS`, with no HUD
 * and no sound. A turn thins in over the turn before it, and the first over black. On TITLE alone (when `draw` is given
 * the text layer) its series, class, vehicle and color are written at the right, and the ticker runs its words: the
 * course's description over the intro, the series' over the race, again and again. When a turn ends its run is
 * released; each turn has the next class's run loaded, standing in READY, so only the first turn waits on a load, and
 * a class shown again starts a new run. A class that cannot load is passed over. `leave` ends the shown turn; the next
 * `enter` resumes with the next class's turn. `dispose` releases every run.
 */
export function createAttractDemo(
  classes: readonly SeriesClass[],
  vehicles: readonly CompiledVehicleDefinition[],
  courses: CourseIndex,
  assemble: (request: RunRequest) => Promise<DemoRun>,
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
        intro: courses.find((course) => course.id === chosen.course)?.description ?? '',
        race: chosen.series.description,
      },
      demo: null,
      loading: false,
      failed: false,
    };
  });
  const showSteps = Math.round(ATTRACT_SECONDS / SIM_DT);
  let index = 0,
    turn: Turn | null = null,
    entered = false,
    disposed = false,
    // The frame the turn before left, which the next thins over, and how far that thinning has gone.
    left: Uint16Array | null = null,
    thinning = DEMO_THIN_STEPS,
    ranks: Uint16Array | null = null;
  // Load a class's run (loading only: it stands in READY until its turn), unless it has one or is loading.
  const ensure = (at: number) => {
    const entry = demo[at % demo.length];
    if (!entry || entry.demo || entry.loading || entry.failed) return;
    entry.loading = true;
    assemble(entry.request).then(
      (demo) => {
        entry.loading = false;
        if (disposed) return demo.run.dispose();
        entry.demo = demo;
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
  // Begin the turn of the class at `index`, passing over classes that failed, once its run is loaded; the next
  // class loads meanwhile.
  const begin = () => {
    if (!entered || turn || disposed) return;
    for (let i = 0; i < demo.length && demo[index]!.failed; i++) index = (index + 1) % demo.length;
    const entry = demo[index];
    if (!entry || entry.failed) return;
    ensure(index);
    if (!entry.demo) return;
    turn = { shown: entry, steps: 0, words: entry.words.intro, wordsFrom: 0 };
    thinning = 0;
    ensure(index + 1);
  };
  // A turn has ended: its run is released, and a class shown again starts a new one.
  const release = (ended: DemoClass) => {
    ended.demo?.run.dispose();
    ended.demo = null;
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
      const { demo } = turn.shown;
      if (!demo!.finished()) demo!.run.tick();
      turn.steps++;
      thinning++;
      // The ticker turns to the race's words when the intro ends.
      const words = demo!.run.demo?.introducing ? turn.shown.words.intro : turn.shown.words.race;
      if (words !== turn.words) [turn.words, turn.wordsFrom] = [words, turn.steps];
      if (turn.steps >= showSteps || demo!.finished()) end();
    },
    draw(frame: SoftwareSurface, text: TextLayer | null) {
      if (!turn) return false;
      turn.shown.demo!.run.draw();
      // The turn thins in over the frame the turn before left.
      if (thinning < DEMO_THIN_STEPS) {
        ranks ??= lineThinningRanks(frame.height);
        const shown = newLineCount(frame.height, (thinning + 1) / DEMO_THIN_STEPS);
        for (let row = 0; row < frame.height; row++)
          if (ranks[row]! >= shown) {
            if (left) frame.pixels.set(left.subarray(row * frame.width, (row + 1) * frame.width), row * frame.width);
            else frame.pixels.fill(0, row * frame.width, (row + 1) * frame.width);
          }
      }
      (left ??= new Uint16Array(frame.pixels.length)).set(frame.pixels);
      if (text) {
        for (const [row, line] of turn.shown.lines)
          text.write(OVERLAY.lastColumn + 1 - line.length, row, line, TEXT_PALETTES.WHITE);
        // The ticker: its words, then a gap, from the right edge, a character every few steps.
        const run = `${turn.words}${TICKER_GAP}`,
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
      for (const entry of demo) {
        entry.demo?.run.dispose();
        entry.demo = null;
      }
    },
  };
}

/** The product classes whose RACEs the attract demo runs, in series and class order. */
export function attractClasses(series: readonly { readonly dev: boolean; readonly classes: readonly SeriesClass[] }[]) {
  return series.filter((s) => !s.dev).flatMap((s) => s.classes);
}
