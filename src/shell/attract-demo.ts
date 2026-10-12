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

/** How long each class is shown, and the share of the work per frame the demo's fast-forward may take. */
export const ATTRACT_SECONDS = 30;
const SLICE_MILLISECONDS = 12;
/** The overlay's last column and rows: series, class, vehicle and color. */
const OVERLAY = Object.freeze({ lastColumn: 38, series: 21, class: 22, vehicle: 24, color: 25 });

/** One class's demo: its run and what the overlay names. */
interface Shown {
  readonly run: Run;
  readonly lines: readonly (readonly [row: number, text: string])[];
  steps: number;
}

/**
 * The attract demo behind TITLE: the product ARCADE classes, in series and class order, one after another, looping.
 * Each is a real Session of its class and field, assembled by `assemble` with no player input: the class's first
 * vehicle in its first color drives by its Session driver from a seeded point between the second half of lap 1 and the
 * end of lap 2, reached headlessly behind black. Each is shown `ATTRACT_SECONDS` with no HUD and no sound, brightening
 * from black and darkening to black over the transition's steps, with its series, class, vehicle and color written at
 * the right. While a class loads TITLE stands over black. `leave` stops it; the next `enter` resumes with the next class.
 */
export function createAttractDemo(
  classes: readonly SeriesClass[],
  vehicles: readonly CompiledVehicleDefinition[],
  devices: {
    assemble(request: RunRequest, laps: number, sliceMilliseconds: number, signal: AbortSignal): Promise<Run>;
    drawSeed(): number;
  },
): TitleBackground {
  let index = 0,
    shown: Shown | null = null,
    // Steps since it was shown, or into its darkening, and the load under way.
    darkening: number | null = null,
    loading: AbortController | null = null,
    failures = 0;
  const showSteps = Math.round(ATTRACT_SECONDS / SIM_DT);
  const load = () => {
    if (classes.length === 0 || failures >= classes.length) return;
    const chosen = classes[index % classes.length]!;
    const vehicle = vehicles.find((v) => v.compiledVehicle.id === chosen.vehicles[0])!;
    const color = spriteSetColors(vehicle.spriteSet)[0]!;
    const request: RunRequest = Object.freeze({
      mode: 'ARCADE',
      seriesId: chosen.series.id,
      classId: chosen.id,
      vehicleId: vehicle.compiledVehicle.id,
      color,
      track: null,
    });
    // A seeded point from the second half of lap 1 to the end of lap 2.
    const laps = 0.5 + (1.5 * devices.drawSeed()) / 2 ** 32;
    const controller = new AbortController();
    loading = controller;
    const { manufacturer, model } = vehicle.listing.metadata;
    devices.assemble(request, laps, SLICE_MILLISECONDS, controller.signal).then(
      (run) => {
        if (controller.signal.aborted) return run.dispose();
        loading = null;
        failures = 0;
        shown = {
          run,
          steps: 0,
          lines: [
            [OVERLAY.series, chosen.series.title],
            [OVERLAY.class, chosen.title],
            [OVERLAY.vehicle, `${manufacturer} ${model}`.toUpperCase()],
            [OVERLAY.color, vehicle.listing.visuals.colorNames[color]!],
          ],
        };
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // A class that cannot load is passed over; with none loadable the background stays black.
        console.error('Attract demo could not start', error);
        loading = null;
        failures++;
        index++;
        load();
      },
    );
  };
  const stop = () => {
    loading?.abort();
    loading = null;
    shown?.run.dispose();
    shown = null;
    darkening = null;
  };
  return {
    enter() {
      if (!shown && !loading) load();
    },
    leave() {
      if (shown || loading) index++;
      stop();
    },
    tick() {
      if (!shown) return;
      shown.run.tick();
      if (darkening !== null) {
        if (++darkening < TRANSITION_STEPS) return;
        stop();
        index++;
        load();
      } else if (++shown.steps >= showSteps) darkening = 0;
    },
    draw(frame: SoftwareSurface, text: TextLayer) {
      if (!shown) return false;
      shown.run.draw();
      const brightness = darkening !== null ? TRANSITION_STEPS - darkening : Math.min(TRANSITION_STEPS, shown.steps);
      scaleRgb555Pixels(frame.pixels, brightness);
      if (brightness === TRANSITION_STEPS)
        for (const [row, line] of shown.lines)
          text.write(OVERLAY.lastColumn + 1 - line.length, row, line, TEXT_PALETTES.WHITE);
      return true;
    },
  };
}

/** The product ARCADE classes the attract demo runs, in series and class order. */
export function attractClasses(series: readonly { readonly dev: boolean; readonly classes: readonly SeriesClass[] }[]) {
  return series.filter((s) => !s.dev).flatMap((s) => s.classes);
}
