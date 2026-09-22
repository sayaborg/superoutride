import { writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { REFERENCE_DRIVER } from '../../dist/race/reference-driving-policy.js';
import { referenceModelIdentity } from '../course/reference-identity.mjs';

/** Build authority: independent vehicle jobs share no mutable mechanics or course state. */
export async function buildCourseReferences(courses, stage) {
  const physicsSha256 = await referenceModelIdentity(),
    stems = courses.map((c) => c.stem);
  const results = new Array(VEHICLE_CATALOG.length),
    running = new Set();
  let next = 0;
  const run = (vehicleId) =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./build-course-reference-worker.mjs', import.meta.url), {
        workerData: { vehicleId, stems, physicsSha256 },
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
        id = VEHICLE_CATALOG[i].profile.id;
      results[i] = await run(id);
      console.log(`${id}: ${results[i].hits} cached / ${results[i].misses} generated reference products`);
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
        vehicles: [],
      },
    ]),
  );
  for (const result of results) {
    for (const product of result.products) await stage(product.path, product.value);
    for (const { stem, candidate } of result.references) references.get(stem).vehicles.push(candidate);
  }
  const offline = new URL('../../dist/offline/reference/', import.meta.url);
  await mkdir(offline, { recursive: true });
  for (const [stem, reference] of references)
    await writeFile(new URL(`${stem}.json`, offline), JSON.stringify(reference) + '\n');
}
