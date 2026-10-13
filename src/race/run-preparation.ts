import type { ContentDelivery } from '../content/content-delivery.js';
import { readCourseTimeBudgets } from '../content/course-time-budgets.js';
import { admitProduct } from '../content/delivered-product.js';
import type { FreePlayRules } from '../content/free-play-rules.js';
import { readPaceSchedule } from '../content/pace-schedule.js';
import { readRacingLines } from '../content/racing-line.js';
import type { SeriesClass } from '../content/series-catalog.js';
import { createRunVehicle, runVehicleSha256, type RunVehicle } from '../content/run-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { resolveRunSetup, runDemand, type EntryVehicle } from './run-setup.js';
import { compileRunConfiguration, type RunConfiguration, type RunRulesRequest } from './run-configuration.js';

/** The admitted catalogs every run is prepared from: vehicles, the game-wide driving, materials and FREE PLAY. */
export interface RunCatalog {
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly driving: CompiledDrivingDefinition;
  readonly materials: SurfaceMaterialCatalog;
  readonly freePlay: FreePlayRules;
}

/**
 * Prepare a requested run on `course`, whose class is `runClass` (null on an untimed course): the one path
 * from a request to a run, which the browser and the driving scenarios share. It admits the request
 * (`compileRunConfiguration`, with the start speed `initialSpeed`), then loads from delivery, once each, what the
 * Run needs (`runDemand`): the player's and every other run vehicle with its reference identity, the
 * clock's time budgets (the course's reference times for the player's vehicle with its class's margin), RACE's pace
 * schedule and the course's racing lines. `resolve(seed)` resolves the run with a seed; a DEV rebuild passes its
 * tuned vehicle and configuration, which have no budgets. A delivery without measured products (no racing lines in its
 * manifest: the workbench's build while measurements are stale) admits only a run that demands no time budgets
 * or pace schedule, whose drivers drive the centre lane for the racing line.
 */
export async function prepareRun(
  content: ContentDelivery,
  catalog: RunCatalog,
  course: CompiledCourse,
  runClass: SeriesClass | null,
  request: RunRulesRequest,
  initialSpeed = 0,
) {
  const { vehicles, driving, materials } = catalog;
  const configuration = compileRunConfiguration(request, course, runClass, catalog, initialSpeed);
  const demand = runDemand(configuration, runClass, vehicles);
  const measured = content.manifest.files.some((file) => file.kind === 'racing-line');
  if (!measured && (demand.budgets || demand.paceSchedule))
    throw new RangeError('Without measured products a run has no time limit and no pace schedule');
  const loadEntryVehicle = async (id: string): Promise<EntryVehicle & { readonly sha256: string }> => {
    const vehicle = createRunVehicle(
      vehicles.find((v) => v.compiledVehicle.id === id)!,
      driving,
    );
    const sha256 = await runVehicleSha256(vehicle, materials);
    return { vehicle, sha256 };
  };
  const { vehicleId } = configuration;
  const player = await loadEntryVehicle(vehicleId);
  const fieldVehicles = new Map<string, EntryVehicle>([[vehicleId, player]]);
  for (const id of demand.vehicleIds) if (!fieldVehicles.has(id)) fieldVehicles.set(id, await loadEntryVehicle(id));
  const vehicleOf = (id: string) => fieldVehicles.get(id)!;
  // A timed run's reference times must be delivered; a missing file stops loading rather than dropping the clock.
  // Its budgets are those times with its class's margin.
  const budgets = demand.budgets
    ? await admitProduct(content, 'reference-times', `${course.id}/${vehicleId}`, (value, document) =>
        readCourseTimeBudgets(course, player.sha256, runClass!.timeMargin, value, document),
      )
    : null;
  const paceSchedule = demand.paceSchedule
    ? await admitProduct(content, 'schedule', `${course.id}/${vehicleId}`, (value, document) =>
        readPaceSchedule(course, player.sha256, value, document),
      )
    : undefined;
  // The course's racing lines, delivered with the measured products.
  const racingLines = measured
    ? await admitProduct(content, 'racing-line', course.id, (value, document) =>
        readRacingLines(course, value, document),
      )
    : null;
  return Object.freeze({
    configuration,
    /** The player's run vehicle and its reference identity. */
    vehicle: player.vehicle,
    vehicleSha256: player.sha256,
    /** Resolve the run with `seed`; a DEV rebuild passes its tuned vehicle and configuration. */
    resolve(
      seed: number,
      tuned: { readonly vehicle: RunVehicle; readonly configuration: RunConfiguration } | null = null,
    ) {
      const resolved = tuned?.configuration ?? configuration;
      return resolveRunSetup(
        course,
        runClass,
        resolved,
        seed,
        tuned?.vehicle ?? player.vehicle,
        tuned ? null : budgets,
        { vehicleOf, rivalPool: runDemand(resolved, runClass, vehicles).rivalPool, paceSchedule, racingLines },
      );
    },
  });
}
