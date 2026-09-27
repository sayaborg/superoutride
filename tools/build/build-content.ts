import { compileVehicleDefinitions, DRIVING_DEFINITION_ID } from '../../src/content/vehicle-catalog.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import type { DocumentSource } from '../../src/content/document-catalog.js';
import {
  compileCourseDocument,
  isTimedCourse,
  type CompiledCourse,
  type TimedCompiledCourse,
} from '../../src/course/compiler/compiled-course.js';
import { buildCourseReferences } from './build-course-reference.js';
import { readdir, readFile } from 'node:fs/promises';
import { createContentWriter } from './content-manifest.js';
import { readCourseDocumentBytes } from '../../src/course/course-document.js';
import { compileCourseImages } from '../course/compile-course-images.js';
import { readCourseImages } from '../course/read-course-images.js';
import { courseFileId } from '../course/course-file-id.js';
import { compileSurfaceMaterials, SURFACE_MATERIALS_ID } from '../../src/content/surface-material-catalog.js';
import { validateTireSoundMaterialIds } from '../../src/audio/tire-surface-acoustics.js';
import { compileVehicleSpriteLibrary } from '../graphics/vehicle-sprite-library.js';

/**
 * The content build: every delivered file is compiled from authored documents in dependency order,
 * in one pass: vehicle sprite library, materials, vehicle and driving definitions, courses and their
 * images, then reference runs. Each compile stage receives earlier products directly. Reference workers
 * are the exception: they run in separate threads and read this build's saved content until 14-5.
 */
const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/delivery/', import.meta.url);
const writer = createContentWriter(destination);
const json = async (path: string) => JSON.parse(await readFile(new URL(path, content), 'utf8')) as unknown;

const library = compileVehicleSpriteLibrary(await json('sprites/vehicles.json'), 'content/sprites/vehicles.json');
await writer.stage('image', 'vehicles', library.product);
const levels = library.product.sprites.flatMap((sprite) => sprite.levels.slice(1));
console.log(
  JSON.stringify({
    spriteMasters: library.masters.sprites.length,
    spriteLevels: library.product.sprites.reduce((n, s) => n + s.levels.length, 0),
    masterJsonBytes: Buffer.byteLength(JSON.stringify(library.masters) + '\n'),
    deliveredJsonBytes: Buffer.byteLength(JSON.stringify(library.product) + '\n'),
    addedLodPatternBytes: levels.reduce((n, level) => n + Math.ceil(level.indices.length / 2), 0),
    addedLodRgb555PaletteBytes: levels.length * 32,
  }),
);

// Each document's file name is its manifest identity; catalogs admit these sources as delivery does.
const sources = async (directory: string) => {
  const result: DocumentSource[] = [];
  for (const name of (await readdir(new URL(directory + '/', content))).sort()) {
    if (!name.endsWith('.json')) continue;
    const path = `content/${directory}/${name}`;
    result.push({ id: name.replace(/\.json$/, ''), path, value: await json(`${directory}/${name}`) });
  }
  return result;
};
const materials = requireLoaded(compileSurfaceMaterials(await sources('materials')));
validateTireSoundMaterialIds(materials.source.materials.map((material) => material.id));
await writer.stage('material', SURFACE_MATERIALS_ID, materials.source);

const vehicleSources = await sources('vehicles'),
  listingSources = await sources('vehicle-listings'),
  drivingSources = await sources('driving');
const definitions = requireLoaded(
  compileVehicleDefinitions(library.sprites, drivingSources, vehicleSources, listingSources),
);
for (const vehicle of definitions.vehicles) {
  await writer.stage('vehicle', vehicle.compiledVehicle.id, vehicle.mechanics);
  await writer.stage('vehicle-listing', vehicle.compiledVehicle.id, vehicle.listing);
}
await writer.stage('driving', DRIVING_DEFINITION_ID, definitions.driving.source);

const courses: { course: CompiledCourse; stem: string }[] = [];
for (const name of (await readdir(new URL('courses/', content))).sort()) {
  if (!name.endsWith('.course.json')) continue;
  const id = courseFileId(name);
  const bytes = await readFile(new URL(`courses/${name}`, content));
  const document = requireLoaded(readCourseDocumentBytes(bytes, `content/courses/${name}`));
  const prepared = await compileCourseImages(
    document,
    await readCourseImages(document.assets, new URL('images/', content).pathname),
  );
  const compiled = requireLoaded(
    await compileCourseDocument(prepared.document, id, prepared.images, materials, `content/courses/${name}`),
  );
  await writer.stage('course', id, prepared.document);
  for (const image of prepared.images) await writer.stage('image', image.sha256, null, new Uint8Array(image.bytes));
  console.log(`${name}: Strip ground compiled`);
  courses.push({ course: compiled, stem: id });
}
// Reference workers run in separate threads and read this build's saved content.
await writer.save();
await buildCourseReferences(
  // Only courses whose rules carry CLASSIC settings are timed and receive reference runs and budgets.
  courses.filter((entry): entry is { course: TimedCompiledCourse; stem: string } => isTimedCourse(entry.course)),
  definitions,
  writer.stage,
);
await writer.save();
console.log('Validated and staged manifest content');
