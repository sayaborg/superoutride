import { parentPort, workerData } from 'node:worker_threads';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from '../build/node-content-store.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import type { RivalEnvelope } from '../../src/content/rival-envelope.js';
import { requireCompiled } from './authoring-io.js';
import { measureRivalEnvelope } from './rival-envelope-measurement.js';
import { runCourseReference } from './reference-run.js';

/** One vehicle's measurements: its envelope unless one is given, then its reference runs on each named course. */
export interface MeasureJob {
  readonly vehicleId: string;
  readonly envelope: RivalEnvelope | null;
  readonly courses: readonly string[];
}

export interface MeasureResult {
  readonly vehicleId: string;
  /** The measured envelope, or null when the job gave one. */
  readonly envelope: RivalEnvelope | null;
  readonly runs: readonly { readonly course: string; readonly runs: ReturnType<typeof runCourseReference>[] }[];
}

const job = workerData as MeasureJob;
const content = requireCompiled(await compileContent(createNodeContentStore(), { measured: false }));
const entry = content.definitions.vehicles.find((vehicle) => vehicle.compiledVehicle.id === job.vehicleId)!;
const vehicle = createSessionVehicle(entry, content.definitions.driving);
const measured = job.envelope ? null : measureRivalEnvelope(vehicle);
const envelope: RivalEnvelope = job.envelope ?? { maximumSpeed: measured!.maximumSpeed, rows: measured!.rows };
const catalog = { vehicles: content.definitions.vehicles, freePlay: content.freePlay };
const runs = job.courses.map((id) => {
  const course = content.courses.find((candidate) => candidate.id === id)!;
  return {
    course: id,
    runs: enumerateCourseRoutes(course.entry, course.type).map((route) =>
      runCourseReference(course, vehicle, catalog, envelope, route, course.rules.maxLaps),
    ),
  };
});
parentPort!.postMessage({
  vehicleId: job.vehicleId,
  envelope: measured ? envelope : null,
  runs,
} satisfies MeasureResult);
