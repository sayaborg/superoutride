import { referenceModelIdentity } from '../course/reference-identity.mjs';
import { readCourseReference } from '../../dist/runtime/course-reference.js';
import { browserSessionVehicle } from '../../dist/browser/session-vehicle.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readCourseDocument } from '../../dist/course/course-document.js';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCourseGround } from '../../dist/compiler/course-ground.js';
import { readCourseImages } from '../course/read-course-images.mjs';

const content = new URL('../../content/', import.meta.url);
const destination = new URL('../../dist/content/', import.meta.url);
const entries = [];
const modelSha256 = await referenceModelIdentity();
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
  const reference = JSON.parse(
    await readFile(new URL('reference/' + name.replace('.course.json', '.json'), content), 'utf8'),
  );
  if (reference.modelSha256 !== modelSha256)
    throw new RangeError(
      name + ': stale reference model; run course reference-build with the current compiled modules',
    );
  for (const entry of VEHICLE_CATALOG)
    await readCourseReference(compiled.value, browserSessionVehicle(entry), reference);
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
  console.log(
    `${name}: ${ground.manifest.uniqueTiles} unique ground tiles, ${ground.manifest.byteLength} payload bytes`,
  );
}
for (const directory of ['courses', 'images', 'reference']) {
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
