import type { ContentKind } from '../../src/core/content-manifest.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { REFERENCE_DRIVER } from '../course/reference-driving-policy.js';
import { referenceModelIdentity } from '../course/reference-identity.js';

import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { VehicleProfileId } from '../../src/vehicle/physics/vehicle-profiles.js';
import type { runCourseReference } from '../course/reference-run.js';

export interface CourseReferenceJob {
  readonly vehicleId: VehicleProfileId;
  readonly stems: readonly string[];
  readonly physicsSha256: string;
}

interface ReferenceCandidate {
  readonly vehicleId: VehicleProfileId;
  readonly vehicleSha256: string;
  readonly runs: readonly ReturnType<typeof runCourseReference>[];
}

export interface CourseReferenceResult {
  readonly vehicleId: VehicleProfileId;
  readonly products: { kind: ContentKind; id: string; value: unknown }[];
  readonly references: { stem: string; candidate: ReferenceCandidate }[];
  readonly hits: number;
  readonly misses: number;
}

/** Build authority: independent vehicle jobs share no mutable mechanics or course state. */
export async function buildCourseReferences(
  courses: readonly { course: CompiledCourse; stem: string }[],
  stage: (kind: ContentKind, id: string, product: unknown) => Promise<void>,
) {
  const physicsSha256 = await referenceModelIdentity(),
    stems = courses.map((c) => c.stem);
  const results = new Array<CourseReferenceResult>(VEHICLE_CATALOG.length),
    running = new Set<Worker>();
  let next = 0;
  const run = (vehicleId: VehicleProfileId) =>
    new Promise<CourseReferenceResult>((resolve, reject) => {
      const worker = new Worker(new URL('./build-course-reference-worker.ts', import.meta.url), {
        workerData: { vehicleId, stems, physicsSha256 } satisfies CourseReferenceJob,
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
    while (next < VEHICLE_CATALOG.length) {
      const i = next++,
        id = VEHICLE_CATALOG[i]!.profile.id;
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
    courses.map(({ course, stem }) => [
      stem,
      {
        format: 'superoutride.course-reference',
        version: 1,
        courseBuildSha256: course.identity.buildSha256,
        modelSha256: physicsSha256,
        driver: REFERENCE_DRIVER,
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
