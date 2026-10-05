import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { compileContent, type CompiledContent } from '../authoring/compile-content.js';
import { createNodeContentStore, CONTENT_ROOT } from '../build/node-content-store.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { createSessionVehicle, sessionVehicleSha256 } from '../../src/content/session-vehicle.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import type { RivalEnvelope } from '../../src/content/rival-envelope.js';
import { atomicWrite, options, reportError, requireCompiled, requireInput } from './authoring-io.js';
import { procedureSha256 } from './procedure.js';
import { ENVELOPE_MEASUREMENT, measureRivalEnvelope } from './rival-envelope-measurement.js';
import { REFERENCE_RUN, runCourseReference } from './reference-run.js';
import {
  MEASURED_ENVELOPE_FORMAT,
  REFERENCE_TIMES_FORMAT,
  measuredEnvelopePath,
  referenceTimesPath,
  savedEnvelope,
  savedReferenceVehicle,
  type SavedEnvelope,
  type SavedReferenceTimes,
  type SavedReferenceVehicle,
} from './measured-products.js';
import type { MeasureJob, MeasureResult } from './measure-worker.js';

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

/** The saved JSON of `file` under `content/`, or null when it is absent or not JSON. */
async function savedJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(new URL(file, CONTENT_ROOT), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

/** The names in a directory under `content/`, none when it is absent. */
async function savedNames(directory: string): Promise<readonly string[]> {
  try {
    return await store.list(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function measure(verb: 'generate' | 'regenerate' | 'compare') {
  const started = performance.now();
  const content = requireCompiled(await compileContent(store, { measured: false }));
  const measurementSha256 = await procedureSha256(ENVELOPE_MEASUREMENT),
    referenceSha256 = await procedureSha256(REFERENCE_RUN);
  const everything = verb !== 'generate';
  // Each catalog vehicle's identity and its saved envelope when that is current.
  const vehicles = new Map<string, { sha256: string; envelope: SavedEnvelope | null; saved: unknown }>();
  for (const entry of content.definitions.vehicles) {
    const id = entry.compiledVehicle.id;
    const sha256 = await sessionVehicleSha256(
      createSessionVehicle(entry, content.definitions.driving),
      content.materials,
    );
    const saved = await savedJson(measuredEnvelopePath(id));
    const current = saved as Partial<SavedEnvelope> | null;
    const fresh =
      current?.format === MEASURED_ENVELOPE_FORMAT.format &&
      current.version === MEASURED_ENVELOPE_FORMAT.version &&
      current.vehicleSha256 === sha256 &&
      current.procedureSha256 === measurementSha256;
    vehicles.set(id, { sha256, envelope: fresh ? (saved as SavedEnvelope) : null, saved });
  }
  // Each series course's saved file and its current candidate entries.
  const courses: { course: CompiledContent['courses'][number]; candidates: readonly string[]; saved: unknown }[] = [];
  for (const { course, settings } of content.seriesCourses)
    courses.push({
      course,
      candidates: settings.series.vehicles,
      saved: await savedJson(referenceTimesPath(course.id)),
    });
  const fresh = new Map<string, Map<string, SavedReferenceVehicle>>();
  for (const { course, saved } of courses) {
    const file = saved as Partial<SavedReferenceTimes> | null;
    const entries = new Map<string, SavedReferenceVehicle>();
    if (
      file?.format === REFERENCE_TIMES_FORMAT.format &&
      file.version === REFERENCE_TIMES_FORMAT.version &&
      file.courseBuildSha256 === course.identity.buildSha256 &&
      file.procedureSha256 === referenceSha256 &&
      Array.isArray(file.vehicles)
    )
      for (const entry of file.vehicles)
        if (vehicles.get(entry.vehicleId)?.sha256 === entry.vehicleSha256) entries.set(entry.vehicleId, entry);
    fresh.set(course.id, entries);
  }
  // One job per vehicle with anything to measure.
  const jobs: MeasureJob[] = [];
  for (const [vehicleId, vehicle] of vehicles) {
    const envelope = everything ? null : vehicle.envelope;
    const due = courses
      .filter(
        ({ course, candidates }) =>
          candidates.includes(vehicleId) && (everything || !fresh.get(course.id)!.has(vehicleId)),
      )
      .map(({ course }) => course.id);
    if (!envelope || due.length) jobs.push({ vehicleId, envelope: envelope?.envelope ?? null, courses: due });
  }
  const results = await runJobs(jobs);
  const report: unknown[] = [];
  const writes: { file: string; text: string; previous: unknown }[] = [];
  // Envelopes, in catalog order.
  for (const [vehicleId, vehicle] of vehicles) {
    const result = results.get(vehicleId);
    if (!result?.envelope) continue;
    const next = savedEnvelope(vehicle.sha256, measurementSha256, result.envelope);
    const previous = vehicle.saved as Partial<SavedEnvelope> | null;
    report.push({
      envelope: vehicleId,
      maximumSpeed: { before: previous?.envelope?.maximumSpeed ?? null, after: next.envelope.maximumSpeed },
    });
    writes.push({ file: measuredEnvelopePath(vehicleId), text: formatSavedJson(next), previous: vehicle.saved });
  }
  // Reference times, each course's candidates in its series' order.
  for (const { course, candidates, saved } of courses) {
    const entries = fresh.get(course.id)!;
    let changed = everything || !entries.size;
    const vehiclesOut = candidates.map((vehicleId) => {
      const runs = results.get(vehicleId)?.runs.find((r) => r.course === course.id)?.runs;
      if (!runs) return entries.get(vehicleId)!;
      changed = true;
      const next = savedReferenceVehicle(course, vehicleId, vehicles.get(vehicleId)!.sha256, referenceSha256, runs);
      const before = ((saved as Partial<SavedReferenceTimes> | null)?.vehicles ?? []).find(
        (v) => v.vehicleId === vehicleId,
      );
      report.push({ course: course.id, vehicle: vehicleId, ...timeChanges(before ?? null, next) });
      return next;
    });
    if (!changed && (saved as SavedReferenceTimes).vehicles.length === candidates.length) continue;
    const file: SavedReferenceTimes = {
      ...REFERENCE_TIMES_FORMAT,
      courseBuildSha256: course.identity.buildSha256,
      procedureSha256: referenceSha256,
      vehicles: vehiclesOut,
    };
    writes.push({ file: referenceTimesPath(course.id), text: formatSavedJson(file), previous: saved });
  }
  // Saved files no current vehicle or series course owns.
  const owned = new Set([
    ...[...vehicles.keys()].map(measuredEnvelopePath),
    ...courses.map(({ course }) => referenceTimesPath(course.id)),
  ]);
  const extra = [
    ...(await savedNames('envelopes')).map((name) => `envelopes/${name}`),
    ...(await savedNames('reference-times')).map((name) => `reference-times/${name}`),
  ].filter((file) => !owned.has(file));
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  if (verb === 'compare') {
    const differences: string[] = [];
    for (const { file, text } of writes) {
      let current: string | null = null;
      try {
        current = await readFile(new URL(file, CONTENT_ROOT), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (current !== text) differences.push(file);
    }
    differences.push(...extra);
    console.log(
      JSON.stringify({ ok: !differences.length, seconds, differences, report: differences.length ? report : [] }),
    );
    if (differences.length) process.exitCode = 1;
    return;
  }
  for (const { file, text, previous } of writes)
    if (previous === null || formatSavedJson(previous) !== text)
      await store.write(file, new TextEncoder().encode(text));
  for (const file of extra) await rm(new URL(file, CONTENT_ROOT));
  console.log(
    JSON.stringify({
      ok: true,
      seconds,
      measured: jobs.map(({ vehicleId, envelope, courses: due }) => ({
        vehicle: vehicleId,
        envelope: !envelope,
        courses: due,
      })),
      removed: extra,
      report,
    }),
  );
}

/** A saved entry's times after `gate`, read leniently since the saved file may be stale in any way. */
function previous(entry: SavedReferenceVehicle | null, gate: string): readonly unknown[] | undefined {
  const after: unknown = entry?.after;
  if (!Array.isArray(after)) return undefined;
  const found: unknown = after.find((item: unknown) => Array.isArray(item) && item[0] === gate);
  return Array.isArray(found) && Array.isArray(found[1]) ? found[1] : undefined;
}

/** Every reference time that changed, by gate and lap, before and after. */
function timeChanges(before: SavedReferenceVehicle | null, after: SavedReferenceVehicle) {
  const changes: {
    gate: string;
    lap: number | null;
    before: number | null;
    after: number;
    difference: number | null;
  }[] = [];
  const add = (gate: string, lap: number | null, saved: unknown, next: number) => {
    const prior = typeof saved === 'number' ? saved : null;
    if (prior !== next)
      changes.push({ gate, lap, before: prior, after: next, difference: prior === null ? null : next - prior });
  };
  add('START', null, before?.initialSeconds ?? null, after.initialSeconds);
  for (const [gate, seconds] of after.after)
    seconds.forEach((value, index) => add(gate, index + 1, previous(before, gate)?.[index] ?? null, value));
  const scheduleChanged = JSON.stringify(before?.schedule ?? null) !== JSON.stringify(after.schedule);
  return { changes, scheduleChanged };
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
    const series = content.seriesCourses.find(({ course }) => course.id === opts.get('--course'));
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
