import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { ENVELOPE_MEASUREMENT, measureRivalEnvelope } from './rival-envelope-measurement.js';
import { REFERENCE_RUN, runCourseReference } from './reference-run.js';
import { procedureSha256 } from './procedure.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { options, loadCourse, requireInput, atomicWrite, requireCompiled } from './authoring-io.js';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from '../build/node-content-store.js';

/** Optional diagnostic exports; ordinary build owns all Session products. */
export async function referenceCommand(verb: string, file: string | null, args: readonly string[]) {
  const opts = options(args, ['--vehicle', '--laps', '--route', '--out', '--images']);
  requireInput(opts.has('--vehicle'), '/vehicle', 'Reference commands require --vehicle');
  // A reference run drives the course document compiled with the content; an envelope needs no course.
  const loaded = verb === 'envelope' ? null : await loadCourse(file!, opts.get('--images'));
  const content = loaded?.content ?? requireCompiled(await compileContent(createNodeContentStore()));
  const { definitions } = content;
  const entry = definitions.vehicles.find((e) => e.compiledVehicle.id === opts.get('--vehicle'));
  requireInput(entry, '/vehicle', 'Unknown catalog vehicle');
  const vehicle = createSessionVehicle(entry, definitions.driving);
  const envelope = measureRivalEnvelope(vehicle);
  let result;
  if (verb === 'envelope')
    result = {
      format: 'superoutride.vehicle-envelope',
      version: 2,
      procedureSha256: await procedureSha256(ENVELOPE_MEASUREMENT),
      vehicle,
      ...envelope,
    };
  else {
    const { course } = loaded!;
    const arcade = content.seriesCourses.find((series) => series.course === course)?.settings;
    requireInput(arcade, '/course', 'Reference runs need a series course');
    const routes = enumerateCourseRoutes(course.entry, course.type);
    const lapCount = Number(opts.get('--laps') ?? arcade.laps),
      routeIndex = Number(opts.get('--route') ?? 0);
    requireInput(Number.isInteger(routeIndex) && routes[routeIndex], '/route', 'Unknown route index');
    result = {
      format: 'superoutride.reference-run',
      version: 3,
      courseBuildSha256: course.identity.buildSha256,
      procedureSha256: await procedureSha256(REFERENCE_RUN),
      vehicle,
      ...runCourseReference(
        course,
        vehicle,
        { vehicles: definitions.vehicles, freePlay: content.freePlay },
        envelope,
        routes[routeIndex]!,
        lapCount,
        true,
      ),
    };
  }
  requireInput(opts.has('--out'), '/out', 'Reference commands require --out');
  await atomicWrite(opts.get('--out')!, JSON.stringify(result) + '\n');
  return {
    ok: true,
    output: opts.get('--out'),
    format: result.format,
    procedureSha256: result.procedureSha256,
    ...('elapsedSeconds' in result && result.elapsedSeconds
      ? { elapsedSeconds: result.elapsedSeconds, events: result.events }
      : {}),
  };
}
