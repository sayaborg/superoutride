import { readFile } from 'node:fs/promises';
import { courseViewReport } from './course-view-report.mjs';
import { createCourseProject } from '../../dist/runtime/course-project.js';

const [sourcePath, ...extra] = process.argv.slice(2);
if (!sourcePath || (extra.length && extra[0] !== '--view'))
  throw new TypeError(
    'Usage: npm run compile:course -- CourseDocument.json [--view source-s behind ahead active-index Link-ID ...]',
  );
const project = createCourseProject();
const result = await project.importDocument(await readFile(sourcePath, 'utf8'));
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else if (extra.length) {
  const view = courseViewReport(result.value, extra.slice(1));
  if (!view.ok) {
    console.error(JSON.stringify(view, null, 2));
    process.exitCode = 1;
  } else console.log(JSON.stringify(view.value, null, 2));
} else {
  // This is a report, not an independently loadable serialized graph. Reopen authoring through the compiler.
  console.log(
    JSON.stringify(
      {
        id: result.value.id,
        type: result.value.type,
        entrySection: result.value.entry.id,
        links: result.value.links.length,
        identity: result.value.identity,
        sections: result.value.sections.map((section) => ({
          id: section.id,
          length: section.raster.length,
          segments: section.raster.segments.length,
          bands: section.bandPartition.bands.length,
          carriageways: section.carriageways.length,
          ports: section.ports.length,
        })),
      },
      null,
      2,
    ),
  );
}
