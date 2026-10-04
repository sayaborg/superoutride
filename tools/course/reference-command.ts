import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { readDeliveredContent } from './read-content.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { REFERENCE_DRIVER_SHA256 } from './reference-driving-policy.js';
import { measureRivalEnvelope } from './rival-envelope-measurement.js';
import { runCourseReference } from './reference-run.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { referenceModelIdentity } from './reference-identity.js';
import { options, loadCourse, requireInput, atomicWrite } from './authoring-io.js';
import { loadSeriesCatalog, loadSeriesCourse } from '../../src/content/series-catalog.js';

/** Optional diagnostic exports; ordinary build owns all Session products. */
export async function referenceCommand(verb: string, file: string | null, args: readonly string[]) {
  const content = await readDeliveredContent();
  const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const opts = options(args, ['--vehicle', '--laps', '--route', '--out', '--images']);
  requireInput(opts.has('--vehicle'), '/vehicle', 'Reference commands require --vehicle');
  const entry = definitions.vehicles.find((e) => e.compiledVehicle.id === opts.get('--vehicle'));
  requireInput(entry, '/vehicle', 'Unknown catalog vehicle');
  // A reference run drives the course document with its own materials; an envelope needs no course.
  const loaded = verb === 'envelope' ? null : await loadCourse(file!, opts.get('--images'));
  const vehicle = createSessionVehicle(entry, definitions.driving);
  const modelSha256 = await referenceModelIdentity(),
    envelope = measureRivalEnvelope(vehicle);
  let result;
  if (verb === 'envelope')
    result = {
      format: 'superoutride.vehicle-envelope',
      version: 1,
      modelSha256,
      vehicle,
      ...envelope,
    };
  else {
    const { course } = loaded!;
    const series = await loadSeriesCatalog(content, definitions.vehicles);
    const arcade = loadSeriesCourse(content, series, course);
    requireInput(arcade, '/course', 'Reference runs need a delivered series course');
    const routes = enumerateCourseRoutes(course.entry, course.type);
    const lapCount = Number(opts.get('--laps') ?? arcade.laps),
      routeIndex = Number(opts.get('--route') ?? 0);
    requireInput(Number.isInteger(routeIndex) && routes[routeIndex], '/route', 'Unknown route index');
    result = {
      format: 'superoutride.reference-run',
      version: 2,
      courseBuildSha256: course.identity.buildSha256,
      modelSha256,
      driverSha256: REFERENCE_DRIVER_SHA256,
      vehicle,
      ...runCourseReference(course, vehicle, definitions.vehicles, envelope, routes[routeIndex]!, lapCount, true),
    };
  }
  requireInput(opts.has('--out'), '/out', 'Reference commands require --out');
  await atomicWrite(opts.get('--out')!, JSON.stringify(result) + '\n');
  return {
    ok: true,
    output: opts.get('--out'),
    format: result.format,
    modelSha256,
    ...('elapsedSeconds' in result && result.elapsedSeconds
      ? { elapsedSeconds: result.elapsedSeconds, events: result.events }
      : {}),
  };
}
