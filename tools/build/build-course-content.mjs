import { buildCourseReferences } from './build-course-reference.mjs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCourseGround } from '../../dist/compiler/course-ground.js';
import { compileCourseImages } from '../course/compile-course-images.mjs';
import { readCourseImages } from '../course/read-course-images.mjs';

const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/content/', import.meta.url);
const entries = [];
const courses = [];
async function stage(path, product) {
  const data = JSON.stringify(product) + '\n';
  const target = new URL(path, destination);
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, data);
  entries.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
}
for (const name of (await readdir(new URL('courses/', content))).sort()) {
  if (!name.endsWith('.course.json')) continue;
  const bytes = await readFile(new URL(`courses/${name}`, content));
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
  if (compiled.value.entry.presentation?.ground.kind === 'resident') {
    const ground = await compileCourseGround(compiled.value);
    await mkdir(new URL('ground/', destination), { recursive: true });
    for (const [suffix, data] of [
      ['json', JSON.stringify(ground.manifest) + '\n'],
      ['bin', ground.payload],
    ]) {
      const path = `ground/${name.replace('.course.json', '')}.${suffix}`;
      await writeFile(new URL(path, destination), data);
      entries.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
    }
    console.log(`${name}: ${ground.manifest.uniqueTiles} resident ground tiles, ${ground.manifest.byteLength} bytes`);
  } else {
    console.log(`${name}: Band ground compiled; no resident payload`);
  }
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
