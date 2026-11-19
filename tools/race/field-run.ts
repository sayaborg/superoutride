/**
 * One field run ([Development](../../docs/development.md#field-runs)): FREE PLAY's RACE, or RACE + TRAFFIC, on a
 * delivered course from GO, the player driven by its run driver, with rivals of its own vehicle, through the browser's path from a request to a race
 * (`prepareRun`) as the driving scenarios prepare theirs. It reports where the race throws and the first vehicle whose
 * state holds a number that is not finite, and how often the field recovered.
 */
import { readDeliveredContent } from '../course/read-content.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { classOnCourse, loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/course/run-rules.js';
import { createCourseScene } from '../../src/view/course-scene.js';

/** A field run: the course, the player's vehicle, how many rivals and whether traffic, how long from GO, the seed. */
export interface FieldRunJob {
  readonly course: string;
  readonly vehicle: string;
  readonly rivals: number;
  readonly traffic: boolean;
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
  const catalog = { vehicles: definitions.vehicles, driving: definitions.driving, materials };
  const indexed = (await loadCourseIndex(content)).find((c) => c.id === job.course);
  if (!indexed) throw new RangeError(`No delivered course ${job.course}`);
  if (!definitions.vehicles.some((v) => v.compiledVehicle.id === job.vehicle))
    throw new RangeError(`No catalog vehicle ${job.vehicle}`);
  const course = await loadDeliveredCourse(content, job.course, materials);
  const pictures = await loadScreenPictures(content);
  const series = await loadSeriesCatalog(
    content,
    definitions.vehicles,
    pictures,
    await loadMusic(content, TEXT_COLUMNS),
  );
  // FREE PLAY's RACE on the course with as many rivals as asked that its grid holds, the player behind them.
  const free = series.seriesClass('free-play', job.traffic ? 'race-traffic' : 'race')!;
  const onCourse = classOnCourse(free, course, job.vehicle, definitions.vehicles);
  const runClass = Object.freeze({ ...onCourse, entries: onCourse.entries.slice(0, job.rivals + 1) });
  const rivals = runClass.entries.length - 1;
  const prepared = await prepareRun(content, catalog, course, runClass, {
    mode: 'RACE',
    vehicleId: job.vehicle,
    color: null,
  });
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const race = createCourseRace({ setup: prepared.resolve(job.seed), runtime: scene.runtime });
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
