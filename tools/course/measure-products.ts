import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { compileContent, type CompiledContent } from '../authoring/compile-content.js';
import { createNodeContentStore, CONTENT_ROOT } from '../build/node-content-store.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import type { RivalEnvelope } from '../../src/content/rival-envelope.js';
import { atomicWrite, options, reportError, requireCompiled, requireInput } from './authoring-io.js';
import { procedureSha256 } from './procedure.js';
import { ENVELOPE_MEASUREMENT, measureRivalEnvelope } from './rival-envelope-measurement.js';
import { REFERENCE_RUN, runCourseReference } from './reference-run.js';
import { planMeasurement, type MeasureJob, type MeasureResult } from '../authoring/measure.js';

/**
 * The measured products' tool. `generate` measures again only what is stale (or absent) and writes it; `regenerate`
 * measures and writes everything; `compare` measures everything and writes nothing, failing on any difference;
 * `trace` writes one complete measurement or reference run to a disposable file.
 */
const USAGE =
  'Usage: npm run measure -- generate | regenerate | compare | trace --vehicle ID [--course ID [--route N] [--laps N]] --out file';
const store = createNodeContentStore();

const [verb, ...args] = process.argv.slice(2);
try {
  if (verb === 'trace') await trace(args);
  else {
    requireInput(['generate', 'regenerate', 'compare'].includes(verb!) && !args.length, '/arguments', USAGE);
    await measure(verb as 'generate' | 'regenerate' | 'compare');
  }
} catch (error) {
  reportError(error);
}

async function measure(verb: 'generate' | 'regenerate' | 'compare') {
  const started = performance.now();
  const content = requireCompiled(await compileContent(store, { measured: false }));
  const plan = await planMeasurement(store, content, verb !== 'generate');
  const { writes, report } = plan.assemble(await runJobs(plan.jobs));
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  if (verb === 'compare') {
    const differences: string[] = [];
    for (const { path: file, text } of writes) {
      const current = await store
        .read(file)
        .then((bytes) => new TextDecoder().decode(bytes))
        .catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return null;
        });
      if (current !== text) differences.push(file);
    }
    differences.push(...plan.extra);
    console.log(
      JSON.stringify({ ok: !differences.length, seconds, differences, report: differences.length ? report : [] }),
    );
    if (differences.length) process.exitCode = 1;
    return;
  }
  for (const { path: file, text, previous } of writes)
    if (previous === null || formatSavedJson(previous) !== text)
      await store.write(file, new TextEncoder().encode(text));
  for (const file of plan.extra) await rm(new URL(file, CONTENT_ROOT));
  console.log(
    JSON.stringify({
      ok: true,
      seconds,
      measured: plan.jobs.map(({ vehicleId, envelope, courses: due }) => ({
        vehicle: vehicleId,
        envelope: !envelope,
        courses: due,
      })),
      removed: plan.extra,
      report,
    }),
  );
}

/** Run the jobs on up to four workers; each result by vehicle. */
async function runJobs(jobs: readonly MeasureJob[]): Promise<Map<string, MeasureResult>> {
  const results = new Map<string, MeasureResult>(),
    running = new Set<Worker>();
  let next = 0;
  const run = (job: MeasureJob) =>
    new Promise<MeasureResult>((resolve, reject) => {
      const worker = new Worker(new URL('./measure-worker.ts', import.meta.url), { workerData: job });
      running.add(worker);
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => {
        running.delete(worker);
        if (code !== 0) reject(new Error(`Measurement worker ${job.vehicleId} exited with ${code}`));
      });
    });
  const consume = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      results.set(job.vehicleId, await run(job));
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, availableParallelism()) }, consume));
  } finally {
    await Promise.all([...running].map((worker) => worker.terminate()));
  }
  return results;
}

/** One complete envelope measurement (`--vehicle`) or reference run (`--course`) in a disposable file. */
async function trace(args: readonly string[]) {
  const opts = options(args, ['--vehicle', '--course', '--route', '--laps', '--out']);
  requireInput(opts.has('--vehicle') && opts.has('--out'), '/arguments', USAGE);
  const content: CompiledContent = requireCompiled(await compileContent(store, { measured: false }));
  const entry = content.definitions.vehicles.find((e) => e.compiledVehicle.id === opts.get('--vehicle'));
  requireInput(entry, '/vehicle', 'Unknown catalog vehicle');
  const vehicle = createSessionVehicle(entry, content.definitions.driving);
  const measured = measureRivalEnvelope(vehicle);
  let result;
  if (!opts.has('--course')) {
    requireInput(!opts.has('--route') && !opts.has('--laps'), '/arguments', USAGE);
    result = {
      format: 'superoutride.vehicle-envelope',
      version: 2,
      procedureSha256: await procedureSha256(ENVELOPE_MEASUREMENT),
      vehicle,
      ...measured,
    };
  } else {
    const series = content.seriesClasses.find(({ course }) => course.id === opts.get('--course'));
    requireInput(series, '/course', 'Reference runs need a series course');
    const { course } = series;
    const routes = enumerateCourseRoutes(course.entry, course.type);
    const lapCount = Number(opts.get('--laps') ?? series.settings.laps),
      routeIndex = Number(opts.get('--route') ?? 0);
    requireInput(Number.isInteger(routeIndex) && routes[routeIndex], '/route', 'Unknown route index');
    const envelope: RivalEnvelope = { maximumSpeed: measured.maximumSpeed, rows: measured.rows };
    result = {
      format: 'superoutride.reference-run',
      version: 3,
      courseBuildSha256: course.identity.buildSha256,
      procedureSha256: await procedureSha256(REFERENCE_RUN),
      vehicle,
      ...runCourseReference(
        course,
        vehicle,
        { vehicles: content.definitions.vehicles, freePlay: content.freePlay },
        envelope,
        routes[routeIndex]!,
        lapCount,
        true,
      ),
    };
  }
  const output = path.resolve(opts.get('--out')!);
  await atomicWrite(output, JSON.stringify(result) + '\n');
  console.log(JSON.stringify({ ok: true, output, format: result.format, procedureSha256: result.procedureSha256 }));
}
