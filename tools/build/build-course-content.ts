import {
  compileVehicleDocument,
  compileDrivingDocument,
  loadVehicleDefinitions,
  loadVehicleSpriteLibrary,
} from '../../src/vehicle/definition-document.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { buildCourseReferences } from './build-course-reference.js';
import { readdir, readFile } from 'node:fs/promises';
import { createContentWriter } from './content-manifest.js';
import { readDeliveredContent } from '../course/read-content.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { compileCourseImages } from '../course/compile-course-images.js';
import { readCourseImages } from '../course/read-course-images.js';
import { compileSurfaceMaterialDocument } from '../../src/course/surface-material.js';
import { validateTireSoundMaterialIds } from '../../src/audio/tire-surface-acoustics.js';

/**
 * Evaluation courses authored beyond the reference driver: delivered without reference runs or time
 * budgets, so every Session on them is untimed.
 */
const UNTIMED_COURSES: ReadonlySet<string> = new Set(['ribbon-rough']);
const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/content/', import.meta.url);
const writer = createContentWriter(destination, (await readDeliveredContent()).manifest.files);
const materialPath = 'content/materials/surface.json';
const materialResult = compileSurfaceMaterialDocument(
  JSON.parse(await readFile(new URL('materials/surface.json', content), 'utf8')),
  materialPath,
);
if (!materialResult.ok) throw new Error(JSON.stringify(materialResult.diagnostics));
const materials = materialResult.value;
validateTireSoundMaterialIds(materials.ids);
await writer.stage('material', materials.source.id, materials.source);
const sprites = await loadVehicleSpriteLibrary(await readDeliveredContent());
for (const [directory, kind, compile] of [
  ['vehicles', 'vehicle', (value: unknown, path: string) => compileVehicleDocument(value, path, sprites)],
  ['driving', 'driving', compileDrivingDocument],
] as const) {
  for (const name of await readdir(new URL(directory + '/', content))) {
    if (!name.endsWith('.json')) continue;
    const path = `content/${directory}/${name}`;
    const result = compile(JSON.parse(await readFile(new URL(`${directory}/${name}`, content), 'utf8')), path);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    await writer.stage(kind, result.value.source.id, result.value.source);
  }
}
const courses: { course: CompiledCourse; stem: string }[] = [];
for (const name of (await readdir(new URL('courses/', content))).sort()) {
  if (!name.endsWith('.course.json')) continue;
  const bytes = await readFile(new URL(`courses/${name}`, content), 'utf8');
  const document = readCourseDocument(JSON.parse(bytes));
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
  await writer.stage('course', name.replace('.course.json', ''), prepared.document);
  for (const image of prepared.images) await writer.stage('image', image.sha256, null, new Uint8Array(image.bytes));
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  console.log(`${name}: Strip ground compiled`);
  courses.push({
    course: compiled.value,
    stem: name.replace('.course.json', ''),
  });
}
// Reference workers use the same admitted delivery for their completed vehicle images.
await writer.save();
await buildCourseReferences(
  courses.filter(({ stem }) => !UNTIMED_COURSES.has(stem)),
  await loadVehicleDefinitions(await readDeliveredContent()),
  writer.stage,
);
await writer.save();
console.log('Validated and staged manifest content');
