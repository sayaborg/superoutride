import { loadVehicleDefinitions } from '../../src/vehicle/definition-document.js';
import { readDeliveredContent } from './read-content.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import { REFERENCE_DRIVER } from './reference-driving-policy.js';
import { measureVehicleEnvelope } from './vehicle-envelope.js';
import { courseReferenceRoutes, runCourseReference } from './reference-run.js';
import { referenceModelIdentity } from './reference-identity.js';
import { options, loadCourse, loadCourseGround, requireInput, atomicWrite } from './authoring-io.js';

/** Optional diagnostic exports; ordinary build owns all Session products. */
export async function referenceCommand(verb: string, file: string, args: readonly string[]) {
  const definitions = await loadVehicleDefinitions(await readDeliveredContent());
  const opts = options(args, ['--vehicle', '--laps', '--route', '--out', '--images']);
  const selected = opts.get('--vehicle') ?? (verb === 'envelope' ? file : 'TESTAROSSA');
  const entry = definitions.vehicles.find((e) => e.compiledVehicle.id === selected);
  requireInput(entry, '/vehicle', 'Unknown catalog vehicle');
  const modelSha256 = await referenceModelIdentity(),
    envelope = measureVehicleEnvelope(browserSessionVehicle(entry, definitions.driving));
  let result;
  if (verb === 'envelope')
    result = {
      format: 'superoutride.vehicle-envelope',
      version: 1,
      modelSha256,
      vehicle: browserSessionVehicle(entry, definitions.driving),
      ...envelope,
    };
  else {
    const { course } = await loadCourse(file, opts.get('--images'));
    requireInput(course.rules, '/rules', 'Reference needs authored rules');
    const ground = await loadCourseGround(course),
      routes = courseReferenceRoutes(course);
    const lapCount = Number(opts.get('--laps') ?? course.rules.classic.lapCount),
      routeIndex = Number(opts.get('--route') ?? 0);
    requireInput(Number.isInteger(routeIndex) && routes[routeIndex], '/route', 'Unknown route index');
    result = {
      format: 'superoutride.reference-run',
      version: 1,
      courseBuildSha256: course.identity.buildSha256,
      modelSha256,
      driver: REFERENCE_DRIVER,
      vehicle: browserSessionVehicle(entry, definitions.driving),
      ...runCourseReference(course, ground, entry, definitions, envelope, routes[routeIndex]!, lapCount, true),
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
