import { compileVehicleDefinitions } from '../../src/vehicle/definition-document.js';
import type { AdmissionResult, DocumentSource } from '../../src/core/admission.js';
import {
  compileCourseDocument,
  isTimedCourse,
  type CompiledCourse,
  type TimedCompiledCourse,
} from '../../src/course/compiler/compiled-course.js';
import { buildCourseReferences } from './build-course-reference.js';
import { readdir, readFile } from 'node:fs/promises';
import { createContentWriter } from './content-manifest.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { compileCourseImages } from '../course/compile-course-images.js';
import { readCourseImages } from '../course/read-course-images.js';
import { compileSurfaceMaterials } from '../../src/course/surface-material.js';
import { validateTireSoundMaterialIds } from '../../src/audio/tire-surface-acoustics.js';
import { compileVehicleSpriteLibrary } from '../graphics/vehicle-sprite-library.js';

/**
 * The content build: every delivered file is compiled from authored documents in dependency order,
 * in one pass: vehicle sprite library, materials, vehicle and driving definitions, courses and their
 * images, then reference runs. Each compile stage receives earlier products directly. Reference workers
 * are the exception: they run in separate threads and read this build's saved content until 14-5.
 */
const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/content/', import.meta.url);
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
const admitted = <T>(result: AdmissionResult<T>) => {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
};

const materials = admitted(compileSurfaceMaterials(await sources('materials')));
validateTireSoundMaterialIds(materials.ids);
await writer.stage('material', materials.source.id, materials.source);

const vehicleSources = await sources('vehicles'),
  drivingSources = await sources('driving');
const definitions = admitted(compileVehicleDefinitions(library.sprites, drivingSources, vehicleSources));
for (const { id } of vehicleSources)
  await writer.stage('vehicle', id, definitions.vehicles.find((entry) => entry.source.id === id)!.source);
await writer.stage('driving', definitions.driving.source.id, definitions.driving.source);

const courses: { course: CompiledCourse; stem: string }[] = [];
for (const name of (await readdir(new URL('courses/', content))).sort()) {
  if (!name.endsWith('.course.json')) continue;
  const bytes = await readFile(new URL(`courses/${name}`, content), 'utf8');
  const document = readCourseDocument(JSON.parse(bytes), `content/courses/${name}`);
  if (!document.ok) throw new Error(JSON.stringify(document.diagnostics));
  const prepared = await compileCourseImages(
    document.value,
    await readCourseImages(document.value.assets, new URL('images/', content).pathname),
  );
  const compiled = await compileCourseDocument(
    prepared.document,
    prepared.images,
    materials,
    `content/courses/${name}`,
  );
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  await writer.stage('course', name.replace('.course.json', ''), prepared.document);
  for (const image of prepared.images) await writer.stage('image', image.sha256, null, new Uint8Array(image.bytes));
  console.log(`${name}: Strip ground compiled`);
  courses.push({
    course: compiled.value,
    stem: name.replace('.course.json', ''),
  });
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
