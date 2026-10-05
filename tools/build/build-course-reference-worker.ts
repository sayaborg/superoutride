import type { CourseReferenceJob, CourseReferenceResult } from './build-course-reference.js';
import { parentPort, workerData } from 'node:worker_threads';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { readDeliveredContent } from '../course/read-content.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { createSessionVehicle, sessionVehicleSha256 } from '../../src/content/session-vehicle.js';
import { courseTimeBudgetsProduct } from '../course/course-reference.js';
import { deliveredSchedule, referenceTimes, savedReferenceVehicle } from '../course/measured-products.js';
import { readCourseTimeBudgets } from '../../src/content/course-time-budgets.js';
import { RIVAL_ENVELOPE_FORMAT, readRivalEnvelope } from '../../src/content/rival-envelope.js';
import { readPaceSchedule } from '../../src/content/pace-schedule.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { cachedReference, referenceCacheKey } from '../course/reference-cache.js';
import { measureRivalEnvelope } from '../course/rival-envelope-measurement.js';
import { runCourseReference } from '../course/reference-run.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';

const { vehicleId, courses, measurementSha256, referenceSha256 } = workerData as CourseReferenceJob;
const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const catalog = { vehicles: definitions.vehicles, freePlay: await loadFreePlayRules(content) };
const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === vehicleId)!;
const vehicle = createSessionVehicle(entry, definitions.driving),
  vehicleSha256 = await sessionVehicleSha256(vehicle, materials);
let hits = 0,
  misses = 0;
const envelope = await cachedReference('envelopes', referenceCacheKey(null, vehicleSha256, measurementSha256), () =>
  measureRivalEnvelope(vehicle),
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
  const key = referenceCacheKey(course.identity.buildSha256, vehicleSha256, referenceSha256);
  const cached = await cachedReference('runs', key, async () => {
    return enumerateCourseRoutes(course.entry, course.type).map((route) =>
      runCourseReference(course, vehicle, catalog, envelope.value, route, course.rules.maxLaps),
    );
  });
  if (cached.hit) hits++;
  else misses++;
  const candidate = { vehicleId, vehicleSha256, runs: cached.value };
  const saved = savedReferenceVehicle(course, vehicleId, vehicleSha256, referenceSha256, cached.value);
  const product = courseTimeBudgetsProduct(course, vehicleSha256, referenceTimes(saved), timeMargin);
  requireLoaded(readCourseTimeBudgets(course, vehicleSha256, product, `budget ${stem}/${vehicleId}`));
  products.push({ kind: 'budget', id: `${stem}/${vehicleId}`, value: product });
  const schedule = deliveredSchedule(course.identity.buildSha256, vehicleSha256, saved.schedule);
  requireLoaded(readPaceSchedule(course, vehicleSha256, schedule, `schedule ${stem}/${vehicleId}`));
  products.push({ kind: 'schedule', id: `${stem}/${vehicleId}`, value: schedule });
  references.push({ stem, candidate });
}
parentPort!.postMessage({ vehicleId, products, references, hits, misses } satisfies CourseReferenceResult);
