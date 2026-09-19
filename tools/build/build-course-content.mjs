import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { readCourseImages } from '../course/read-course-images.mjs';

const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/content/', import.meta.url);
const entries = [];
for (const name of (await readdir(new URL('courses/', content))).sort()) {
  if (!name.endsWith('.course.json')) continue;
  const bytes = await readFile(new URL(`courses/${name}`, content));
  const document = readCourseDocument(JSON.parse(bytes));
  if (!document.ok) throw new Error(JSON.stringify(document.diagnostics));
  const compiled = await compileCourseDocument(
    document.value,
    await readCourseImages(document.value.assets, new URL('images/', content).pathname),
  );
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
}
for (const directory of ['courses', 'images']) {
  await mkdir(new URL(`${directory}/`, destination), { recursive: true });
  for (const name of (await readdir(new URL(`${directory}/`, content))).sort()) {
    const path = `${directory}/${name}`;
    const source = new URL(path, content);
    const sha256 = createHash('sha256')
      .update(await readFile(source))
      .digest('hex');
    await cp(source, new URL(path, destination));
    entries.push({ path, sha256 });
  }
}
await writeFile(new URL('manifest.json', destination), JSON.stringify({ version: 1, files: entries }) + '\n');
console.log(`Validated and staged ${entries.length} course content files`);
