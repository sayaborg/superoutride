import { contentDigest } from '../../dist/core/content-digest.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { REFERENCE_DRIVER } from '../../dist/gameplay/reference-driver.js';
import { readCourseReference } from '../../dist/runtime/course-reference.js';
import { measureVehicleEnvelope } from './vehicle-envelope.mjs';
import { courseReferenceRoutes, runCourseReference } from './reference-run.mjs';
import { referenceModelIdentity } from './reference-identity.mjs';
import { options, loadCourse, loadCourseGround, requireInput, atomicWrite } from './authoring-io.mjs';

export async function referenceCommand(verb, file, args) {
  const opts = options(args, ['--vehicle', '--laps', '--route', '--out', '--images']);
  const selected = opts.get('--vehicle') ?? (verb === 'envelope' ? file : 'TESTAROSSA');
  const entry = VEHICLE_CATALOG.find((e) => e.profile.id === selected);
  requireInput(entry, '/vehicle', 'Unknown catalog vehicle');
  const modelSha256 = await referenceModelIdentity();
  let result;
  if (verb === 'envelope')
    result = {
      format: 'superoutride.vehicle-envelope',
      version: 1,
      modelSha256,
      vehicle: browserSessionVehicle(entry),
      ...measureVehicleEnvelope(entry),
    };
  else {
    const { course } = await loadCourse(file, opts.get('--images'));
    requireInput(course.rules, '/rules', 'Reference needs authored rules');
    const ground = await loadCourseGround(course, file),
      routes = courseReferenceRoutes(course);
    if (verb === 'reference') {
      const lapCount = Number(opts.get('--laps') ?? course.rules.classic.lapCount),
        routeIndex = Number(opts.get('--route') ?? 0);
      requireInput(Number.isInteger(routeIndex) && routes[routeIndex], '/route', 'Unknown route index');
      const envelope = measureVehicleEnvelope(entry);
      result = {
        format: 'superoutride.reference-run',
        version: 1,
        courseBuildSha256: course.identity.buildSha256,
        modelSha256,
        driver: REFERENCE_DRIVER,
        vehicle: browserSessionVehicle(entry),
        envelope,
        ...runCourseReference(course, ground, entry, envelope, routes[routeIndex], lapCount, true),
      };
    } else {
      const vehicles = [];
      for (const entry of VEHICLE_CATALOG) {
        const vehicle = browserSessionVehicle(entry),
          envelope = measureVehicleEnvelope(entry);
        const runs = routes.map((route) =>
          runCourseReference(course, ground, entry, envelope, route, course.rules.maxLaps),
        );
        const vehicleSha256 = await contentDigest(new TextEncoder().encode(JSON.stringify(vehicle)));
        vehicles.push({ vehicleId: entry.profile.id, vehicleSha256, envelope, runs });
        process.stderr.write(
          `${course.id}: ${entry.profile.id}, ${runs.length} continuous route(s), ${course.rules.maxLaps} lap(s)\n`,
        );
      }
      result = {
        format: 'superoutride.course-reference',
        version: 1,
        courseBuildSha256: course.identity.buildSha256,
        modelSha256,
        driver: REFERENCE_DRIVER,
        vehicles,
      };
      for (const entry of VEHICLE_CATALOG) await readCourseReference(course, browserSessionVehicle(entry), result);
    }
  }
  requireInput(opts.has('--out'), '/out', 'Reference commands require --out');
  await atomicWrite(opts.get('--out'), JSON.stringify(result) + '\n');
  return {
    ok: true,
    output: opts.get('--out'),
    format: result.format,
    modelSha256,
    ...(result.elapsedSeconds ? { elapsedSeconds: result.elapsedSeconds, events: result.events } : {}),
  };
}
