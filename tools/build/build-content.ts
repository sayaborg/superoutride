import { compileVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { compileEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { ENGINE_SOUNDS } from '../../src/vehicle/engine-sounds.js';
import { isDeepStrictEqual } from 'node:util';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { authoredDocumentSource, type DocumentSource } from '../../src/content/document-catalog.js';
import type { ContentKind } from '../../src/content/content-load-error.js';
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
import { courseFileId, courseFileSha256 } from '../course/course-file-id.js';
import { compileSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { resolveSurfaceSoundRecords, SURFACE_SOUNDS } from '../../src/audio/surface-sounds.js';
import { compileSurfaceSounds } from '../../src/content/surface-sound-catalog.js';
import { compileVehicleSpriteLibrary } from '../graphics/vehicle-sprite-library.js';

/**
 * The content build: every delivered file is compiled from authored documents in dependency order,
 * in one pass: vehicle sprite library, materials, surface sounds, engine sounds, vehicle and driving definitions, courses and their
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
    result.push(await authoredDocumentSource(name.replace(/\.json$/, ''), path, await json(`${directory}/${name}`)));
  }
  return result;
};
// Admitted documents are delivered as authored, so each delivered digest is its source's `sha256`.
const deliver = async (kind: ContentKind, documents: readonly DocumentSource[]) => {
  for (const source of documents)
    if ((await writer.stage(kind, source.id, source.value)) !== source.sha256)
      throw new Error(`Delivered bytes differ from the admitted source: ${source.path}`);
};
const materialSources = await sources('materials');
const materials = requireLoaded(compileSurfaceMaterials(materialSources));
await deliver('material', materialSources);

// A catalog material without a surface sound and a surface sound for an unknown material are rejected here.
const surfaceSoundSources = await sources('surface-sounds');
const surfaceSounds = requireLoaded(compileSurfaceSounds(surfaceSoundSources));
resolveSurfaceSoundRecords(
  surfaceSounds,
  materials.source.materials.map((material) => material.id),
);
// Until 11-11 deletes the TypeScript table, the document must reproduce it exactly.
for (const id of new Set([...Object.keys(SURFACE_SOUNDS), ...Object.keys(surfaceSounds.surfaces)]))
  if (!isDeepStrictEqual(surfaceSounds.surfaces[id], SURFACE_SOUNDS[id]))
    throw new Error(`Surface sound document differs from SURFACE_SOUNDS: ${id}`);
await deliver('surface-sound', surfaceSoundSources);

const soundSources = await sources('engine-sounds');
const sounds = requireLoaded(compileEngineSounds(soundSources));
// Until 11-11 deletes the TypeScript table, the documents must reproduce it exactly.
const table: Readonly<Record<string, unknown>> = ENGINE_SOUNDS;
for (const id of new Set([...Object.keys(table), ...Object.keys(sounds)])) {
  const sound = sounds[id];
  const values = sound && {
    cycleRevolutions: sound.cycleRevolutions,
    firingPhases: sound.firingPhases,
    exhaust: sound.exhaust,
  };
  if (!Object.hasOwn(table, id) || !isDeepStrictEqual(values, table[id]))
    throw new Error(`Engine sound document differs from ENGINE_SOUNDS: ${id}`);
}
await deliver('engine-sound', soundSources);

const vehicleSources = await sources('vehicles'),
  listingSources = await sources('vehicle-listings'),
  drivingSources = await sources('driving');
const definitions = requireLoaded(
  compileVehicleDefinitions(library.sprites, sounds, drivingSources, vehicleSources, listingSources),
);
await deliver('vehicle', vehicleSources);
await deliver('vehicle-listing', listingSources);
await deliver('driving', drivingSources);

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
  const sha256 = await courseFileSha256(prepared.document);
  const compiled = requireLoaded(
    await compileCourseDocument(prepared.document, id, sha256, prepared.images, materials, `content/courses/${name}`),
  );
  if ((await writer.stage('course', id, prepared.document)) !== sha256)
    throw new Error(`Delivered bytes differ from the compiled course: ${name}`);
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
