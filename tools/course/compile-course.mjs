import { readFile } from 'node:fs/promises';
import { createCourseProject } from '../../dist/runtime/course-project.js';

const [sourcePath, ...extra] = process.argv.slice(2);
if (!sourcePath || extra.length) throw new TypeError('Usage: npm run compile:course -- CourseDocument.json');
const project = createCourseProject();
const result = await project.importDocument(await readFile(sourcePath, 'utf8'));
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  // This is a report, not an independently loadable serialized graph. Reopen authoring through the compiler.
  console.log(
    JSON.stringify(
      {
        id: result.value.id,
        identity: result.value.identity,
        sections: result.value.sections.map((section) => ({
          id: section.id,
          length: section.raster.length,
          segments: section.raster.segments.length,
          bands: section.bandPartition.bands.length,
          carriageways: section.carriageways.length,
        })),
      },
      null,
      2,
    ),
  );
}
