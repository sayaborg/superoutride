import { formatSavedJson } from '../../src/content/saved-json.js';
import { createRunVehicle, runVehicleSha256, type RunVehicle } from '../../src/content/run-vehicle.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { procedureSha256 } from '../course/procedure.js';
import { referenceProcedure, runCourseReference } from '../course/reference-run.js';
import { RACING_LINE_PROCEDURE } from '../course/racing-line.js';
import { readRacingLines, type RacingLineDocument } from '../../src/content/racing-line.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import {
  REFERENCE_TIMES_FORMAT,
  measureRacingLines,
  measuredCourses,
  racingLinePath,
  racingLineVehicles,
  readSavedRacingLines,
  referenceTimesPath,
  savedReferenceVehicle,
  type SavedReferenceTimes,
  type SavedReferenceVehicle,
} from '../course/measured-products.js';
import type { CompiledContent } from './compile-content.js';
import type { ContentStore } from './content-store.js';
import {
  ENGINE_LOUDNESS_FORMAT,
  engineLoudnessSources,
  readEngineLoudness,
  type EngineLoudnessDocument,
} from '../../src/content/engine-loudness.js';
import { ENGINE_LOUDNESS_PATH, engineLoudnessProcedureSha256, measureEngineLoudness } from './engine-loudness.js';

/**
 * The measured products' one implementation: which saved products are stale, measuring them, and the files to save.
 * It depends on neither Node nor the browser; the measurement tool and the workbench run its jobs on their own
 * workers and write its files through their own stores.
 */

/**
 * One vehicle's measurements: its reference runs on each named course, driving that course's racing lines, and its
 * engine loudness when `loudness` is set.
 */
export interface MeasureJob {
  readonly vehicleId: string;
  readonly courses: readonly string[];
  readonly racingLines: Readonly<Record<string, RacingLineDocument>>;
  readonly loudness: boolean;
}

export interface MeasureResult {
  readonly vehicleId: string;
  readonly runs: readonly { readonly course: string; readonly runs: ReturnType<typeof runCourseReference>[] }[];
  /** The engine loudness (LUFS) when the job measured it, else null. */
  readonly lufs: number | null;
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
  /** The courses whose racing lines are solved: those stale (every course when asked). */
  readonly racingLines: readonly string[];
  /** Saved measured products nothing measured owns. */
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
  const vehicle = createRunVehicle(entry, content.definitions.driving);
  const catalog = { vehicles: content.definitions.vehicles, freePlay: content.freePlay };
  const runs = job.courses.map((id) => {
    progress(`reference runs on ${id}`);
    const course = content.courses.find((candidate) => candidate.id === id)!;
    const lines = requireLoaded(readRacingLines(course, job.racingLines[id]));
    return {
      course: id,
      runs: enumerateCourseRoutes(course.entry, course.type).map((route) =>
        runCourseReference(course, vehicle, catalog, route, course.rules.maxLaps, lines),
      ),
    };
  });
  if (job.loudness) progress('engine loudness');
  const lufs = job.loudness ? measureEngineLoudness(entry, content.audio.exhaust, content.audio.control) : null;
  return { vehicleId: job.vehicleId, runs, lufs };
}

/**
 * Plan a measurement of `content` against the measured products saved in `store`: the stale (or absent) racing lines,
 * course entries and engine loudness entries, or everything when `everything` is set.
 */
export async function planMeasurement(
  store: ContentStore,
  content: CompiledContent,
  everything: boolean,
): Promise<MeasurementPlan> {
  const savedNames = new Set([
    ...(await store.list('reference-times')).map((name) => `reference-times/${name}`),
    ...(await store.list('racing-lines')).map((name) => `racing-lines/${name}`),
    ...(await store.list('engine-loudness')).map((name) => `engine-loudness/${name}`),
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
  // Every course's racing lines, solved again when stale; reference runs drive them.
  const lineSha256 = await procedureSha256(RACING_LINE_PROCEDURE);
  const referenceSha256 = await procedureSha256(referenceProcedure(RACING_LINE_PROCEDURE));
  // Each catalog vehicle's run vehicle and identity.
  const vehicles = new Map<string, { vehicle: RunVehicle; sha256: string }>();
  for (const entry of content.definitions.vehicles) {
    const vehicle = createRunVehicle(entry, content.definitions.driving);
    vehicles.set(entry.compiledVehicle.id, { vehicle, sha256: await runVehicleSha256(vehicle, content.materials) });
  }
  // Each course's lines with the vehicles that time them: the saved document when current, else solved now.
  const lines: { course: CompiledContent['courses'][number]; saved: unknown; stale: boolean }[] = [];
  const lineDocuments = new Map<string, RacingLineDocument>();
  for (const course of content.courses) {
    const saved = await savedJson(racingLinePath(course.id));
    const timing = racingLineVehicles(course.id, content.seriesClasses, [...vehicles.keys()]).map((vehicleId) => ({
      vehicleId,
      vehicleSha256: vehicles.get(vehicleId)!.sha256,
      vehicle: vehicles.get(vehicleId)!.vehicle,
    }));
    const stale = everything || !readSavedRacingLines(course, lineSha256, timing, saved).ok;
    lines.push({ course, saved, stale });
    lineDocuments.set(
      course.id,
      stale
        ? measureRacingLines(course, RACING_LINE_PROCEDURE, lineSha256, timing, content.definitions.vehicles)
        : (saved as RacingLineDocument),
    );
  }
  const staleLines = lines.filter(({ stale }) => stale);
  // Each course a class runs, with its saved file and the vehicles the classes run there.
  const courses: { course: CompiledContent['courses'][number]; candidates: readonly string[]; saved: unknown }[] = [];
  for (const { course, vehicles: candidates } of measuredCourses(content.seriesClasses, [...vehicles.keys()]))
    courses.push({ course, candidates, saved: await savedJson(referenceTimesPath(course.id)) });
  const fresh = new Map<string, Map<string, SavedReferenceVehicle>>();
  for (const { course, saved } of courses) {
    const file = saved as Partial<SavedReferenceTimes> | null;
    const entries = new Map<string, SavedReferenceVehicle>();
    if (
      file?.format === REFERENCE_TIMES_FORMAT.format &&
      file.version === REFERENCE_TIMES_FORMAT.version &&
      file.courseBuildSha256 === course.identity.buildSha256 &&
      file.procedureSha256 === referenceSha256 &&
      Array.isArray(file.vehicles) &&
      // Reference runs drive the course's racing lines, so lines solved again make them stale.
      !staleLines.some((stale) => stale.course === course)
    )
      for (const entry of file.vehicles)
        if (vehicles.get(entry.vehicleId)?.sha256 === entry.vehicleSha256) entries.set(entry.vehicleId, entry);
    fresh.set(course.id, entries);
  }
  // Each catalog vehicle's saved engine loudness while its identities are current; any other change measures all.
  const loudnessSources = engineLoudnessSources(content.definitions.vehicles, content.audio.sha256);
  const loudnessSha256 = await engineLoudnessProcedureSha256();
  const savedLoudness = await savedJson(ENGINE_LOUDNESS_PATH);
  const freshLoudness = new Map<string, number>();
  if (!everything) {
    const current = readEngineLoudness(savedLoudness, loudnessSources, '', { procedureSha256: loudnessSha256 });
    if (current.ok) for (const [vehicleId, lufs] of current.value) freshLoudness.set(vehicleId, lufs);
  }
  // One job per vehicle with anything to measure.
  const jobs: MeasureJob[] = [];
  for (const vehicleId of vehicles.keys()) {
    const due = courses
      .filter(
        ({ course, candidates }) =>
          candidates.includes(vehicleId) && (everything || !fresh.get(course.id)!.has(vehicleId)),
      )
      .map(({ course }) => course.id);
    const loudness = !freshLoudness.has(vehicleId);
    if (due.length || loudness)
      jobs.push({
        vehicleId,
        courses: due,
        racingLines: Object.fromEntries(due.map((id) => [id, lineDocuments.get(id)!])),
        loudness,
      });
  }
  const owned = new Set([
    ...courses.map(({ course }) => referenceTimesPath(course.id)),
    ...content.courses.map((course) => racingLinePath(course.id)),
    ENGINE_LOUDNESS_PATH,
  ]);
  const extra = [...savedNames].filter((path) => !owned.has(path)).sort();

  const assemble = (results: ReadonlyMap<string, MeasureResult>) => {
    const report: unknown[] = [];
    const writes: MeasuredWrite[] = [];
    // Racing lines, in course order.
    for (const { course, saved } of staleLines) {
      const next = lineDocuments.get(course.id)!;
      report.push({ racingLines: course.id });
      writes.push({ path: racingLinePath(course.id), text: formatSavedJson(next), previous: saved });
    }
    // Reference times, each course's vehicles in catalog order.
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
        // A run that recovered still measures; the report counts its recoveries.
        const recoveries = runs.reduce((sum, run) => sum + run.metrics.recoveries, 0);
        report.push({ course: course.id, vehicle: vehicleId, recoveries, ...timeChanges(before ?? null, next) });
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
    // The engine loudness, every catalog vehicle in catalog order, written when any was measured.
    const measuredLoudness = [...results.values()].filter((result) => result.lufs !== null);
    if (measuredLoudness.length) {
      const loudness: EngineLoudnessDocument = {
        ...ENGINE_LOUDNESS_FORMAT,
        procedureSha256: loudnessSha256,
        audioSha256: loudnessSources.audioSha256,
        vehicles: loudnessSources.vehicles.map((sources) => ({
          ...sources,
          lufs: results.get(sources.vehicleId)?.lufs ?? freshLoudness.get(sources.vehicleId)!,
        })),
      };
      for (const { vehicleId, lufs } of measuredLoudness) report.push({ engineLoudness: vehicleId, lufs });
      writes.push({ path: ENGINE_LOUDNESS_PATH, text: formatSavedJson(loudness), previous: savedLoudness });
    }
    return { writes, report };
  };
  return { jobs, racingLines: staleLines.map(({ course }) => course.id), extra, assemble };
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
