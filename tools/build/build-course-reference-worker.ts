import type { CourseReferenceJob, CourseReferenceResult } from './build-course-reference.js';
import { parentPort, workerData } from 'node:worker_threads';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import { REFERENCE_DRIVER } from '../course/reference-driving-policy.js';
import { readCourseReference } from '../course/course-reference.js';
import { courseBudgetLandmarks, readCourseTimeBudgets } from '../../src/race/course-time-budgets.js';
import { cachedReference, referenceCacheKey, digest } from '../course/reference-cache.js';
import { measureVehicleEnvelope } from '../course/vehicle-envelope.js';
import { runCourseReference, courseReferenceRoutes } from '../course/reference-run.js';
import { loadCourse, loadCourseGround } from '../course/authoring-io.js';

const { vehicleId, stems, physicsSha256 } = workerData as CourseReferenceJob;
const entry = VEHICLE_CATALOG.find((v) => v.profile.id === vehicleId)!;
const vehicle = browserSessionVehicle(entry),
  vehicleSha256 = digest(vehicle);
let hits = 0,
  misses = 0;
const envelope = await cachedReference(
  'envelopes',
  referenceCacheKey(null, vehicleSha256, REFERENCE_DRIVER.version, physicsSha256),
  () => measureVehicleEnvelope(entry),
);
if (envelope.hit) hits++;
else misses++;
const products: CourseReferenceResult['products'] = [
    { kind: 'envelope', id: vehicleId, value: { vehicleSha256, envelope: envelope.value } },
  ],
  references: CourseReferenceResult['references'] = [];
for (const stem of stems) {
  const file = new URL(`../../content/courses/${stem}.course.json`, import.meta.url).pathname;
  const { course } = await loadCourse(file);
  const key = referenceCacheKey(course.identity.buildSha256, vehicleSha256, REFERENCE_DRIVER, physicsSha256);
  const cached = await cachedReference('runs', key, async () => {
    const ground = await loadCourseGround(course);
    return courseReferenceRoutes(course).map((route) =>
      runCourseReference(course, ground, entry, envelope.value, route, course.rules!.maxLaps),
    );
  });
  if (cached.hit) hits++;
  else misses++;
  const candidate = { vehicleId, vehicleSha256, runs: cached.value };
  const reference = {
    format: 'superoutride.course-reference',
    version: 1,
    courseBuildSha256: course.identity.buildSha256,
    modelSha256: physicsSha256,
    driver: REFERENCE_DRIVER,
    vehicles: [candidate],
  };
  const budgets = await readCourseReference(course, vehicle, reference);
  const product = {
    format: 'superoutride.course-time-budgets',
    version: 1,
    courseBuildSha256: course.identity.buildSha256,
    vehicleSha256,
    initialMs: budgets.initialMs,
    after: courseBudgetLandmarks(course).map(({ gate, laps }) => [
      gate.id,
      Array.from({ length: laps }, (_, index) => budgets.after(gate, index + 1)),
    ]),
  };
  await readCourseTimeBudgets(course, vehicle, product);
  products.push({ kind: 'budget', id: `${stem}/${vehicleId}`, value: product });
  references.push({ stem, candidate });
}
parentPort!.postMessage({ vehicleId, products, references, hits, misses } satisfies CourseReferenceResult);
