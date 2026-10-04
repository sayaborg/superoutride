import type { CourseReferenceJob, CourseReferenceResult } from './build-course-reference.js';
import { parentPort, workerData } from 'node:worker_threads';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { readDeliveredContent } from '../course/read-content.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { createSessionVehicle, sessionVehicleSha256 } from '../../src/content/session-vehicle.js';
import { REFERENCE_DRIVER_SHA256 } from '../course/reference-driving-policy.js';
import { readCourseReference } from '../course/course-reference.js';
import {
  COURSE_TIME_BUDGETS_FORMAT,
  courseBudgetLandmarks,
  readCourseTimeBudgets,
} from '../../src/content/course-time-budgets.js';
import { RIVAL_ENVELOPE_FORMAT, readRivalEnvelope } from '../../src/content/rival-envelope.js';
import { PACE_SCHEDULE_FORMAT, PACE_SCHEDULE_SPACING, readPaceSchedule } from '../../src/content/pace-schedule.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { cachedReference, referenceCacheKey } from '../course/reference-cache.js';
import { ENVELOPE_MEASUREMENT, measureRivalEnvelope } from '../course/rival-envelope-measurement.js';
import { runCourseReference } from '../course/reference-run.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';

const { vehicleId, courses, physicsSha256 } = workerData as CourseReferenceJob;
const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === vehicleId)!;
const vehicle = createSessionVehicle(entry, definitions.driving),
  vehicleSha256 = await sessionVehicleSha256(vehicle, materials);
let hits = 0,
  misses = 0;
const envelope = await cachedReference(
  'envelopes',
  referenceCacheKey(null, vehicleSha256, ENVELOPE_MEASUREMENT, physicsSha256),
  () => measureRivalEnvelope(vehicle),
);
if (envelope.hit) hits++;
else misses++;
// The delivered envelope holds only the rows driving admits; the offline measurement trace stays in the cache.
const rivalEnvelope = {
  ...RIVAL_ENVELOPE_FORMAT,
  vehicleSha256,
  envelope: { maximumSpeed: envelope.value.maximumSpeed, rows: envelope.value.rows },
};
requireLoaded(readRivalEnvelope(vehicleSha256, rivalEnvelope, `envelope ${vehicleId}`));
const products: CourseReferenceResult['products'] = [{ kind: 'envelope', id: vehicleId, value: rivalEnvelope }],
  references: CourseReferenceResult['references'] = [];
for (const { stem, timeMargin } of courses) {
  const course = await loadDeliveredCourse(content, stem, materials);
  const key = referenceCacheKey(course.identity.buildSha256, vehicleSha256, REFERENCE_DRIVER_SHA256, physicsSha256);
  const cached = await cachedReference('runs', key, async () => {
    return enumerateCourseRoutes(course.entry, course.type).map((route) =>
      runCourseReference(course, vehicle, definitions.vehicles, envelope.value, route, course.rules.maxLaps),
    );
  });
  if (cached.hit) hits++;
  else misses++;
  const candidate = { vehicleId, vehicleSha256, runs: cached.value };
  const reference = {
    format: 'superoutride.course-reference',
    version: 2,
    courseBuildSha256: course.identity.buildSha256,
    modelSha256: physicsSha256,
    driverSha256: REFERENCE_DRIVER_SHA256,
    vehicles: [candidate],
  };
  const budgets = readCourseReference(course, vehicleId, vehicleSha256, reference, timeMargin);
  const product = {
    ...COURSE_TIME_BUDGETS_FORMAT,
    courseBuildSha256: course.identity.buildSha256,
    vehicleSha256,
    initialMs: budgets.initialMs,
    after: courseBudgetLandmarks(course).map(({ gate, laps }) => [
      gate.id,
      Array.from({ length: laps }, (_, index) => budgets.after(gate, index + 1)),
    ]),
  };
  requireLoaded(readCourseTimeBudgets(course, vehicleSha256, product, `budget ${stem}/${vehicleId}`));
  products.push({ kind: 'budget', id: `${stem}/${vehicleId}`, value: product });
  const schedule = paceScheduleProduct(course.entry.id, course.identity.buildSha256, vehicleSha256, cached.value);
  requireLoaded(readPaceSchedule(course, vehicleSha256, schedule, `schedule ${stem}/${vehicleId}`));
  products.push({ kind: 'schedule', id: `${stem}/${vehicleId}`, value: schedule });
  references.push({ stem, candidate });
}
parentPort!.postMessage({ vehicleId, products, references, hits, misses } satisfies CourseReferenceResult);

/**
 * The delivered pace schedule of one course and vehicle from its reference runs: the start times from GO along the
 * entry Section, and for each Section run from its start the fastest times from that start, in integer milliseconds.
 */
function paceScheduleProduct(
  entryId: string,
  courseBuildSha256: string,
  vehicleSha256: string,
  runs: readonly ReturnType<typeof runCourseReference>[],
) {
  const fastest = (into: number[], values: readonly number[]) =>
    values.forEach((value, index) => (into[index] = Math.min(into[index] ?? Infinity, value)));
  const start: number[] = [];
  const sections = new Map<string, number[]>();
  for (const run of runs) {
    const [first, ...rest] = run.passes;
    if (first!.section !== entryId) throw new Error('A reference run starts outside the entry Section');
    fastest(
      start,
      first!.seconds.map((seconds) => Math.round(1000 * seconds)),
    );
    for (const pass of rest) {
      if (pass.first !== 0) throw new Error(`A reference run enters ${pass.section} past its start`);
      const values = sections.get(pass.section) ?? [];
      fastest(
        values,
        pass.seconds.map((seconds) => Math.round(1000 * (seconds - pass.seconds[0]!))),
      );
      sections.set(pass.section, values);
    }
  }
  return {
    ...PACE_SCHEDULE_FORMAT,
    courseBuildSha256,
    vehicleSha256,
    spacing: PACE_SCHEDULE_SPACING,
    start: { section: entryId, first: runs[0]!.passes[0]!.first, milliseconds: start },
    sections: [...sections].filter(([, values]) => values.length >= 2),
  };
}
