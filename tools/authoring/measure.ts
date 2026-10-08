import { formatSavedJson } from '../../src/content/saved-json.js';
import { createSessionVehicle, sessionVehicleSha256 } from '../../src/content/session-vehicle.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import type { RivalEnvelope } from '../../src/content/rival-envelope.js';
import { procedureSha256 } from '../course/procedure.js';
import { ENVELOPE_MEASUREMENT, measureRivalEnvelope } from '../course/rival-envelope-measurement.js';
import { REFERENCE_RUN, runCourseReference } from '../course/reference-run.js';
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
} from '../course/measured-products.js';
import type { CompiledContent } from './compile-content.js';
import type { ContentStore } from './content-store.js';

/**
 * The measured products' one implementation: which saved products are stale, measuring them, and the files to save.
 * It depends on neither Node nor the browser; the measurement tool and the workbench run its jobs on their own
 * workers and write its files through their own stores.
 */

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

/** A saved file to write: its path under `content/`, its text, and the value saved there before (null if none). */
export interface MeasuredWrite {
  readonly path: string;
  readonly text: string;
  readonly previous: unknown;
}

export interface MeasurementPlan {
  /** The jobs to run: one per vehicle with anything stale (everything when asked). */
  readonly jobs: readonly MeasureJob[];
  /** Saved measured products no catalog vehicle or series course owns. */
  readonly extra: readonly string[];
  /** The files the results save, with what changed by gate and lap. */
  assemble(results: ReadonlyMap<string, MeasureResult>): { writes: MeasuredWrite[]; report: unknown[] };
}

/** Run one job on compiled content; `progress` hears each phase as it starts. */
export function runMeasureJob(
  content: CompiledContent,
  job: MeasureJob,
  progress: (phase: string) => void = () => {},
): MeasureResult {
  const entry = content.definitions.vehicles.find((vehicle) => vehicle.compiledVehicle.id === job.vehicleId)!;
  const vehicle = createSessionVehicle(entry, content.definitions.driving);
  if (!job.envelope) progress('envelope');
  const measured = job.envelope ? null : measureRivalEnvelope(vehicle);
  const envelope: RivalEnvelope = job.envelope ?? { maximumSpeed: measured!.maximumSpeed, rows: measured!.rows };
  const catalog = { vehicles: content.definitions.vehicles, freePlay: content.freePlay };
  const runs = job.courses.map((id) => {
    progress(id);
    const course = content.courses.find((candidate) => candidate.id === id)!;
    return {
      course: id,
      runs: enumerateCourseRoutes(course.entry, course.type).map((route) =>
        runCourseReference(course, vehicle, catalog, envelope, route, course.rules.maxLaps),
      ),
    };
  });
  return { vehicleId: job.vehicleId, envelope: measured ? envelope : null, runs };
}

/**
 * Plan a measurement of `content` against the measured products saved in `store`: the stale (or absent) envelopes
 * and course entries, or everything when `everything` is set.
 */
export async function planMeasurement(
  store: ContentStore,
  content: CompiledContent,
  everything: boolean,
): Promise<MeasurementPlan> {
  const savedNames = new Set([
    ...(await store.list('envelopes')).map((name) => `envelopes/${name}`),
    ...(await store.list('reference-times')).map((name) => `reference-times/${name}`),
  ]);
  // The saved JSON at a path, or null when it is absent or not JSON.
  const savedJson = async (path: string): Promise<unknown> => {
    if (!savedNames.has(path)) return null;
    try {
      return JSON.parse(new TextDecoder().decode(await store.read(path)));
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  };
  const measurementSha256 = await procedureSha256(ENVELOPE_MEASUREMENT),
    referenceSha256 = await procedureSha256(REFERENCE_RUN);
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
  for (const { course, settings } of content.seriesClasses)
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
  const owned = new Set([
    ...[...vehicles.keys()].map(measuredEnvelopePath),
    ...courses.map(({ course }) => referenceTimesPath(course.id)),
  ]);
  const extra = [...savedNames].filter((path) => !owned.has(path)).sort();

  const assemble = (results: ReadonlyMap<string, MeasureResult>) => {
    const report: unknown[] = [];
    const writes: MeasuredWrite[] = [];
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
      writes.push({ path: measuredEnvelopePath(vehicleId), text: formatSavedJson(next), previous: vehicle.saved });
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
      writes.push({ path: referenceTimesPath(course.id), text: formatSavedJson(file), previous: saved });
    }
    return { writes, report };
  };
  return { jobs, extra, assemble };
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
