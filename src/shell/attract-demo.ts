import { TEXT_PALETTES } from '../image/text-tiles.js';
import { scaleRgb555Pixels } from '../image/rgb555.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { SeriesClass } from '../content/series-catalog.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { RunRequest } from './run-request.js';
import type { Run } from './run-assembly.js';
import { TRANSITION_STEPS } from './screen-host.js';
import type { TitleBackground } from './title-screen.js';

/** How long each turn of a class is shown. */
export const ATTRACT_SECONDS = 30;
/** The overlay's last column and rows: series, class, vehicle and color. */
const OVERLAY = Object.freeze({ lastColumn: 38, series: 21, class: 22, vehicle: 24, color: 25 });

/** A demo Session as a run, and whether it has ended and stood its RESULT delay. */
export interface DemoSession {
  readonly run: Run;
  finished(): boolean;
}

/** One class of the demo: its request, its overlay and its live Session, while it holds one. */
interface DemoClass {
  readonly request: RunRequest;
  readonly lines: readonly (readonly [row: number, text: string])[];
  session: DemoSession | null;
  loading: boolean;
  failed: boolean;
}

/** The class shown and how far its turn has gone: fixed steps shown, and steps into its darkening. */
interface Turn {
  readonly shown: DemoClass;
  steps: number;
  darkening: number | null;
}

/**
 * The attract demo behind TITLE, the one owner of the demo Sessions and their turns: the product classes' RACEs, in
 * series and class order, looping. It holds at most two Sessions, the shown class's and the next class's, each a run
 * with no player input in which the class's first vehicle in its first color drives by its Session driver, stepped in
 * the race's fixed step only while its turn is shown. A turn lasts `ATTRACT_SECONDS`, with no HUD and no sound,
 * brightening from black and darkening to black over the transition's steps, its series, class, vehicle and color
 * written at the right. A Session that ends (GOAL or GAME OVER) is shown to the end of its RESULT delay and its turn
 * ends there. When a turn ends its Session is released; each turn has the next class's Session loaded, standing in
 * READY, so only the first turn waits on a load, over black, and a class shown again starts a new Session. A class
 * that cannot load is passed over. `leave` ends the shown turn; the next `enter` resumes with the next class's turn.
 * `dispose` releases every Session.
 */
export function createAttractDemo(
  classes: readonly SeriesClass[],
  vehicles: readonly CompiledVehicleDefinition[],
  assemble: (request: RunRequest) => Promise<DemoSession>,
): TitleBackground & { dispose(): void } {
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
      session: null,
      loading: false,
      failed: false,
    };
  });
  const showSteps = Math.round(ATTRACT_SECONDS / SIM_DT);
  let index = 0,
    turn: Turn | null = null,
    entered = false,
    disposed = false;
  // Load a class's Session (loading only: it stands in READY until its turn), unless it has one or is loading.
  const ensure = (at: number) => {
    const entry = demo[at % demo.length];
    if (!entry || entry.session || entry.loading || entry.failed) return;
    entry.loading = true;
    assemble(entry.request).then(
      (session) => {
        entry.loading = false;
        if (disposed) return session.run.dispose();
        entry.session = session;
        if (!turn) begin();
      },
      (error: unknown) => {
        // A class that cannot load is passed over; with none loadable TITLE stays over black.
        console.error('Attract demo could not start', error);
        entry.loading = false;
        entry.failed = true;
        if (!turn) begin();
      },
    );
  };
  // Begin the turn of the class at `index`, passing over classes that failed, once its Session is loaded; the next
  // class loads meanwhile.
  const begin = () => {
    if (!entered || turn || disposed) return;
    for (let i = 0; i < demo.length && demo[index]!.failed; i++) index = (index + 1) % demo.length;
    const entry = demo[index];
    if (!entry || entry.failed) return;
    ensure(index);
    if (!entry.session) return;
    turn = { shown: entry, steps: 0, darkening: null };
    ensure(index + 1);
  };
  // A turn has ended: its Session is released, and a class shown again starts a new one.
  const release = (ended: DemoClass) => {
    ended.session?.run.dispose();
    ended.session = null;
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
      // Leaving ends the shown turn; returning resumes with the next class's turn, whose Session stands loaded.
      if (!turn) return;
      release(turn.shown);
      [turn, index] = [null, (index + 1) % demo.length];
    },
    tick() {
      if (!turn) return;
      const { session } = turn.shown;
      if (!session!.finished()) session!.run.tick();
      turn.steps++;
      if (turn.darkening !== null) {
        if (++turn.darkening >= TRANSITION_STEPS) end();
      } else if (turn.steps >= showSteps - TRANSITION_STEPS || session!.finished()) turn.darkening = 0;
    },
    draw(frame: SoftwareSurface, text: TextLayer) {
      if (!turn) return false;
      turn.shown.session!.run.draw();
      const brightness =
        turn.darkening !== null ? TRANSITION_STEPS - turn.darkening : Math.min(TRANSITION_STEPS, turn.steps);
      scaleRgb555Pixels(frame.pixels, brightness);
      if (brightness === TRANSITION_STEPS)
        for (const [row, line] of turn.shown.lines)
          text.write(OVERLAY.lastColumn + 1 - line.length, row, line, TEXT_PALETTES.WHITE);
      return true;
    },
    dispose() {
      disposed = true;
      turn = null;
      for (const entry of demo) {
        entry.session?.run.dispose();
        entry.session = null;
      }
    },
  };
}

/** The product classes whose RACEs the attract demo runs, in series and class order. */
export function attractClasses(series: readonly { readonly dev: boolean; readonly classes: readonly SeriesClass[] }[]) {
  return series.filter((s) => !s.dev).flatMap((s) => s.classes);
}
