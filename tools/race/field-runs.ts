import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { options, reportError, requireInput } from '../course/authoring-io.js';
import { readDeliveredContent } from '../course/read-content.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import type { FieldRunJob, runField } from './field-run.js';

/**
 * The field runs ([Development](../../docs/development.md#field-runs)): FREE PLAY on every delivered course (or
 * `--course`'s), the player driven by its run driver with `--rivals` rivals (11) and `--traffic` traffic (HIGH), for
 * `--seconds` from GO (300), seed `--seed` (0), `--vehicle` the player's (TESTAROSSA); up to three courses at once, each
 * on a worker. It prints one JSON result: each course's run, and the courses whose race threw or whose vehicles' state
 * held a number not finite, and exits 1 when there are any. It reads the build's delivered content (`npm run build`).
 */
const USAGE =
  'Usage: npm run field-runs -- [--course ID] [--vehicle ID] [--rivals N] [--traffic LEVEL] [--seconds S] [--seed N]';
/** Courses run at once: each holds a whole race and its scene. */
const WORKERS = 3;

type FieldRun = Awaited<ReturnType<typeof runField>>;

const run = (job: FieldRunJob) =>
  new Promise<FieldRun>((resolve, reject) => {
    const worker = new Worker(new URL('./field-run-worker.ts', import.meta.url), { workerData: job });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Field run ${job.course} exited with ${code}`));
    });
  });

try {
  const opts = options(process.argv.slice(2), [
    '--course',
    '--vehicle',
    '--rivals',
    '--traffic',
    '--seconds',
    '--seed',
  ]);
  const whole = (name: string, fallback: number, least: number) => {
    const value = Number(opts.get(name) ?? fallback);
    requireInput(
      Number.isInteger(value) && value >= least,
      `/arguments/${name}`,
      `${name} is a whole number, ${USAGE}`,
    );
    return value;
  };
  const index = await loadCourseIndex(await readDeliveredContent());
  const courses = opts.has('--course') ? [opts.get('--course')!] : index.map((c) => c.id);
  for (const id of courses)
    requireInput(
      index.some((c) => c.id === id),
      '/arguments/--course',
      `No delivered course ${id}`,
    );
  const base = {
    vehicle: opts.get('--vehicle') ?? 'TESTAROSSA',
    rivals: whole('--rivals', 11, 0),
    traffic: opts.get('--traffic') ?? 'HIGH',
    seconds: whole('--seconds', 300, 1),
    seed: whole('--seed', 0, 0),
  };
  const runs: FieldRun[] = [];
  let next = 0;
  const consume = async () => {
    while (next < courses.length) runs.push(await run({ ...base, course: courses[next++]! }));
  };
  await Promise.all(Array.from({ length: Math.min(WORKERS, availableParallelism(), courses.length) }, consume));
  runs.sort((a, b) => courses.indexOf(a.course) - courses.indexOf(b.course));
  const faults = runs.filter((r) => r.stopped || r.nonFinite).map((r) => r.course);
  console.log(JSON.stringify({ ok: faults.length === 0, ...base, faults, runs }));
  if (faults.length) process.exitCode = 1;
} catch (error) {
  reportError(error);
}
