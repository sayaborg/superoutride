import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { buildCourseReferences } from './build-course-reference.js';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readCourseDocument } from '../../src/course/course-document.js';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { compileCourseImages } from '../course/compile-course-images.mjs';
import { readCourseImages } from '../course/read-course-images.mjs';

const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/content/', import.meta.url);
const entries: { path: string; sha256: string }[] = [];
const courses: { course: CompiledCourse; stem: string }[] = [];
async function stage(path: string, product: unknown) {
  const data = JSON.stringify(product) + '\n';
  const target = new URL(path, destination);
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, data);
  entries.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
}
for (const name of (await readdir(new URL('courses/', content))).sort()) {
  if (!name.endsWith('.course.json')) continue;
  const bytes = await readFile(new URL(`courses/${name}`, content), 'utf8');
  const document = readCourseDocument(JSON.parse(bytes));
  if (!document.ok) throw new Error(JSON.stringify(document.diagnostics));
  const prepared = await compileCourseImages(
    document.value,
    await readCourseImages(document.value.assets, new URL('images/', content).pathname),
  );
  const compiled = await compileCourseDocument(prepared.document, prepared.images);
  await stage(`courses/${name}`, prepared.document);
  for (const image of prepared.images) {
    const path = `images/${image.sha256}.json`;
    if (entries.some((entry) => entry.path === path)) continue;
    await mkdir(new URL('images/', destination), { recursive: true });
    await writeFile(new URL(path, destination), image.bytes);
    entries.push({ path, sha256: image.sha256 });
  }
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  console.log(`${name}: Band ground compiled`);
  courses.push({
    course: compiled.value,
    stem: name.replace('.course.json', ''),
  });
}
await buildCourseReferences(courses, stage);
const spriteLibraryPath = 'sprites/vehicles.json';
entries.push({
  path: spriteLibraryPath,
  sha256: createHash('sha256')
    .update(await readFile(new URL(spriteLibraryPath, destination)))
    .digest('hex'),
});
await writeFile(new URL('manifest.json', destination), JSON.stringify({ version: 1, files: entries }) + '\n');
console.log(`Validated and staged ${entries.length} course content files`);
