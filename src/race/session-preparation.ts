import type { ContentDelivery } from '../content/content-delivery.js';
import { readCourseTimeBudgets } from '../content/course-time-budgets.js';
import { admitProduct } from '../content/delivered-product.js';
import type { FreePlayRules } from '../content/free-play-rules.js';
import { readPaceSchedule } from '../content/pace-schedule.js';
import { readRivalEnvelope } from '../content/rival-envelope.js';
import type { SeriesClass } from '../content/series-catalog.js';
import { createSessionVehicle, sessionVehicleSha256, type SessionVehicle } from '../content/session-vehicle.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { SurfaceMaterialCatalog } from '../course/surface-material.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { resolveCourseSession, sessionDemand, type EntryVehicle } from './course-session.js';
import {
  compileSessionConfiguration,
  type SessionConfiguration,
  type SessionRequest,
} from './session-configuration.js';

/** The admitted catalogs every Session is prepared from: vehicles, the game-wide driving, materials and FREE PLAY. */
export interface SessionCatalog {
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly driving: CompiledDrivingDefinition;
  readonly materials: SurfaceMaterialCatalog;
  readonly freePlay: FreePlayRules;
}

/**
 * Prepare a requested Session on `course`, whose class is `arcade` (null on an untimed course): the one path
 * from a request to a Session, which the browser and the driving scenarios share. It admits the request
 * (`compileSessionConfiguration`, with the start speed `initialSpeed`), then loads from delivery, once each, what the
 * Session needs (`sessionDemand`): the player's and every other Session vehicle with its reference identity and
 * envelope, the clock's time budgets and ARCADE's pace schedule. `resolve(seed)` resolves the Session with a seed; a
 * DEV rebuild passes its tuned vehicle and configuration, which have no envelope or budgets. A delivery without
 * measured products (no envelope in its manifest: the workbench's build while measurements are stale) admits only a
 * Session that demands none, and its player drives without an envelope, as a DEV-tuned vehicle does.
 */
export async function prepareSession(
  content: ContentDelivery,
  catalog: SessionCatalog,
  course: CompiledCourse,
  arcade: SeriesClass | null,
  request: SessionRequest,
  initialSpeed = 0,
) {
  const { vehicles, driving, materials } = catalog;
  const configuration = compileSessionConfiguration(request, course, arcade, catalog, initialSpeed);
  const demand = sessionDemand(configuration, arcade, vehicles);
  const measured = content.manifest.files.some((file) => file.kind === 'envelope');
  if (!measured && (demand.vehicleIds.length || demand.budgets || demand.paceSchedule))
    throw new RangeError('Without measured products a Session has no rivals, no traffic and no time limit');
  const loadEntryVehicle = async (id: string): Promise<EntryVehicle & { readonly sha256: string }> => {
    const vehicle = createSessionVehicle(
      vehicles.find((v) => v.compiledVehicle.id === id)!,
      driving,
    );
    const sha256 = await sessionVehicleSha256(vehicle, materials);
    const envelope = measured
      ? await admitProduct(content, 'envelope', id, (value, document) => readRivalEnvelope(sha256, value, document))
      : null;
    return { vehicle, envelope, sha256 };
  };
  const { vehicleId } = configuration;
  const player = await loadEntryVehicle(vehicleId);
  const fieldVehicles = new Map<string, EntryVehicle>([[vehicleId, player]]);
  for (const id of demand.vehicleIds) if (!fieldVehicles.has(id)) fieldVehicles.set(id, await loadEntryVehicle(id));
  const vehicleOf = (id: string) => fieldVehicles.get(id)!;
  // A timed Session's budgets must be delivered; a missing file stops loading rather than dropping the clock.
  const budgets = demand.budgets
    ? await admitProduct(content, 'budget', `${course.id}/${vehicleId}`, (value, document) =>
        readCourseTimeBudgets(course, player.sha256, value, document),
      )
    : null;
  const paceSchedule = demand.paceSchedule
    ? await admitProduct(content, 'schedule', `${course.id}/${vehicleId}`, (value, document) =>
        readPaceSchedule(course, player.sha256, value, document),
      )
    : undefined;
  return Object.freeze({
    configuration,
    /** The player's Session vehicle and its reference identity. */
    vehicle: player.vehicle,
    vehicleSha256: player.sha256,
    /** Resolve the Session with `seed`; a DEV rebuild passes its tuned vehicle and configuration. */
    resolve(
      seed: number,
      tuned: { readonly vehicle: SessionVehicle; readonly configuration: SessionConfiguration } | null = null,
    ) {
      const resolved = tuned?.configuration ?? configuration;
      return resolveCourseSession(
        course,
        arcade,
        resolved,
        seed,
        tuned?.vehicle ?? player.vehicle,
        tuned ? null : player.envelope,
        tuned ? null : budgets,
        { vehicleOf, rivalPool: sessionDemand(resolved, arcade, vehicles).rivalPool, paceSchedule },
      );
    },
  });
}
