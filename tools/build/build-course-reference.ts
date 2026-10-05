import type { ContentKind } from '../../src/content/content-load-error.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { VehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { procedureSha256 } from '../course/procedure.js';
import { ENVELOPE_MEASUREMENT } from '../course/rival-envelope-measurement.js';
import { REFERENCE_RUN } from '../course/reference-run.js';

import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { SeriesCourse } from '../../src/content/series-catalog.js';
import type { VehicleId } from '../../src/vehicle/physics/vehicle-definitions.js';
import type { runCourseReference } from '../course/reference-run.js';

export interface CourseReferenceJob {
  readonly vehicleId: VehicleId;
  /** Each series course holding this vehicle as a candidate, with its series' time margin. */
  readonly courses: readonly { readonly stem: string; readonly timeMargin: number }[];
  readonly measurementSha256: string;
  readonly referenceSha256: string;
}

interface ReferenceCandidate {
  readonly vehicleId: VehicleId;
  readonly vehicleSha256: string;
  readonly runs: readonly ReturnType<typeof runCourseReference>[];
}

export interface CourseReferenceResult {
  readonly vehicleId: VehicleId;
  readonly products: { kind: ContentKind; id: string; value: unknown }[];
  readonly references: { stem: string; candidate: ReferenceCandidate }[];
  readonly hits: number;
  readonly misses: number;
}

/** Build authority: independent vehicle jobs share no mutable mechanics or course state. */
export async function buildCourseReferences(
  courses: readonly { course: CompiledCourse; settings: SeriesCourse }[],
  definitions: VehicleDefinitions,
  stage: (kind: ContentKind, id: string, product: unknown) => Promise<unknown>,
) {
  const measurementSha256 = await procedureSha256(ENVELOPE_MEASUREMENT),
    referenceSha256 = await procedureSha256(REFERENCE_RUN),
    jobs = courses.map(({ course, settings }) => ({
      stem: course.id,
      timeMargin: settings.series.timeMargin,
      vehicles: settings.series.vehicles,
    }));
  const results = new Array<CourseReferenceResult>(definitions.vehicles.length),
    running = new Set<Worker>();
  let next = 0;
  const run = (vehicleId: VehicleId) =>
    new Promise<CourseReferenceResult>((resolve, reject) => {
      const worker = new Worker(new URL('./build-course-reference-worker.ts', import.meta.url), {
        workerData: {
          vehicleId,
          courses: jobs
            .filter((job) => job.vehicles.includes(vehicleId))
            .map(({ stem, timeMargin }) => ({ stem, timeMargin })),
          measurementSha256,
          referenceSha256,
        } satisfies CourseReferenceJob,
      });
      running.add(worker);
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => {
        running.delete(worker);
        if (code !== 0) reject(new Error(`Reference worker ${vehicleId} exited with ${code}`));
      });
    });
  const consume = async () => {
    while (next < definitions.vehicles.length) {
      const i = next++,
        id = definitions.vehicles[i]!.compiledVehicle.id;
      const result = await run(id);
      results[i] = result;
      console.log(`${id}: ${result.hits} cached / ${result.misses} generated reference products`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, availableParallelism()) }, consume));
  } finally {
    await Promise.all([...running].map((worker) => worker.terminate()));
  }
  const references = new Map(
    courses.map(({ course }) => [
      course.id,
      {
        format: 'superoutride.course-reference',
        version: 3,
        courseBuildSha256: course.identity.buildSha256,
        procedureSha256: referenceSha256,
        vehicles: [] as ReferenceCandidate[],
      },
    ]),
  );
  for (const result of results) {
    for (const product of result.products) await stage(product.kind, product.id, product.value);
    for (const { stem, candidate } of result.references) references.get(stem)!.vehicles.push(candidate);
  }
  const offline = new URL('../../dist/offline/reference/', import.meta.url);
  await mkdir(offline, { recursive: true });
  for (const [stem, reference] of references)
    await writeFile(new URL(`${stem}.json`, offline), JSON.stringify(reference) + '\n');
}
