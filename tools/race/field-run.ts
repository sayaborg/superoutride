/**
 * One field run ([Development](../../docs/development.md#field-runs)): FREE PLAY on a delivered course from GO, the
 * player driven by its run driver, with rivals and traffic, through the browser's path from a request to a race
 * (`prepareRun`) as the driving scenarios prepare theirs. It reports where the race throws and the first vehicle whose
 * state holds a number that is not finite, and how often the field recovered.
 */
import { readDeliveredContent } from '../course/read-content.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { formPool } from '../../src/race/free-play-field.js';
import { gridRivalCapacity } from '../../src/race/run-configuration.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { createCourseScene } from '../../src/view/course-scene.js';

/** A field run: the course, the player's vehicle, how many rivals and what traffic, how long from GO, the seed. */
export interface FieldRunJob {
  readonly course: string;
  readonly vehicle: string;
  readonly rivals: number;
  readonly traffic: string;
  readonly seconds: number;
  readonly seed: number;
}

/** Where a run went wrong: the fixed step and race seconds from GO, and what happened there. */
interface Fault {
  readonly tick: number;
  readonly seconds: number;
}

/** The path of the first number in `value` that is not finite, or null when every one is. */
function nonFinite(value: unknown, path: string, seen: Set<object>): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const found = nonFinite(child, `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
}

/** Run `job` to its seconds from GO, or until its race ends, throws, or a vehicle's state holds a number not finite. */
export async function runField(job: FieldRunJob) {
  const content = await readDeliveredContent();
  const materials = await loadSurfaceMaterials(content);
  const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const freePlay = await loadFreePlayRules(content);
  const catalog = { vehicles: definitions.vehicles, driving: definitions.driving, materials, freePlay };
  const indexed = (await loadCourseIndex(content)).find((c) => c.id === job.course);
  if (!indexed) throw new RangeError(`No delivered course ${job.course}`);
  const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === job.vehicle);
  if (!entry) throw new RangeError(`No catalog vehicle ${job.vehicle}`);
  const course = await loadDeliveredCourse(content, job.course, materials);
  // As many rivals as asked that the course's grid holds.
  const rivals = Math.min(job.rivals, gridRivalCapacity(indexed.gridSlots));
  const request = {
    mode: 'FREE_PLAY',
    vehicleId: job.vehicle,
    color: null,
    lapCount: 1,
    rivalCount: rivals,
    rivalPool: formPool(freePlay, entry).id,
    traffic: job.traffic,
  } as const;
  const prepared = await prepareRun(content, catalog, course, null, request);
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const race = createCourseRace({ setup: prepared.resolve(job.seed), runtime: scene.runtime, playerExit: () => 0 });
  race.start();
  const idle = { steering: 0, throttle: false, brake: false };
  const ticks = Math.ceil((READY_SECONDS + job.seconds) / SIM_DT);
  const at = (tick: number): Fault => ({ tick, seconds: Math.round(race.clock.elapsedSeconds * 1000) / 1000 });
  let stopped: (Fault & { readonly error: string }) | null = null,
    broken: (Fault & { readonly vehicle: string; readonly path: string }) | null = null;
  for (let tick = 0; tick < ticks && (race.outcome.status === 'READY' || race.outcome.status === 'RUNNING'); tick++) {
    try {
      // READY holds the player; from GO its run driver drives.
      race.advance(race.outcome.status === 'READY' ? idle : null);
    } catch (error) {
      // Its message and the frame that threw, by its path in the repository.
      const { message, stack } = error as Error;
      const frame = stack?.split('\n')[1]?.trim().replaceAll(`${process.cwd()}/`, '') ?? '';
      stopped = { ...at(tick), error: `${message} ${frame}`.trim() };
      break;
    }
    const vehicles = [
      ...[race.player, ...race.rivals].map((c) => [c.id, c.actor.vehicle] as const),
      ...race.traffic.map((t) => [t.id, t.vehicle] as const),
    ];
    for (const [id, vehicle] of vehicles) {
      const path = nonFinite(vehicle, 'vehicle', new Set());
      if (path) broken ??= { ...at(tick), vehicle: id, path };
    }
    if (broken) break;
  }
  return {
    course: job.course,
    rivals,
    seconds: Math.round(race.clock.elapsedSeconds * 10) / 10,
    status: race.outcome.status,
    stopped,
    nonFinite: broken,
    recoveries: {
      player: race.player.actor.recovery.recoveries,
      rivals: race.rivals.reduce((n, r) => n + r.actor.recovery.recoveries, 0),
    },
  };
}
