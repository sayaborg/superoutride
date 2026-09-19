import { readFile } from 'node:fs/promises';
import { courseViewReport } from './course-view-report.mjs';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import {
  compileCoursePhysicalOverlaps,
  compileCoursePhysicalDomains,
} from '../../dist/compiler/course-physical-overlap.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { courseFailure, CourseInputError } from '../../dist/course/course-diagnostics.js';

async function physicalQualification(course, arguments_) {
  if (arguments_[0] === '--physical-overlap') return compileCoursePhysicalOverlaps(course.links);
  const text = await readFile(arguments_[1], 'utf8');
  let demand;
  try {
    demand = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return courseFailure(new CourseInputError('parse_failure', '/demand', 'Physical demand must be JSON'));
  }
  return compileCoursePhysicalDomains(course.links, demand);
}

const [sourcePath, ...extra] = process.argv.slice(2);
if (
  !sourcePath ||
  (extra.length &&
    extra[0] !== '--view' &&
    !(extra.length === 1 && extra[0] === '--physical-overlap') &&
    !(extra.length === 2 && extra[0] === '--physical-domain'))
)
  throw new TypeError(
    'Usage: npm run compile:course -- CourseDocument.json [--physical-overlap | --physical-domain demand.json | --view source-s behind ahead active-index Link-ID ...]',
  );
const project = createCourseProject();
const result = await project.importDocument(await readFile(sourcePath, 'utf8'));
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else if (extra[0] === '--physical-overlap' || extra[0] === '--physical-domain') {
  const qualification = await physicalQualification(result.value, extra);
  if (!qualification.ok) {
    console.error(JSON.stringify(qualification, null, 2));
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify(
        {
          scope: qualification.value.scope,
          demand: qualification.value.demand,
          recipe: qualification.value.recipe,
          links: qualification.value.links.map((link) => link.id),
          identity: result.value.identity,
        },
        null,
        2,
      ),
    );
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
          heightNodes: section.height.nodes.length,
          physicalBindings: section.physicalBindings.length,
          maxSupportedAbsL: createBandSurfaceReader(section.bandPartition, section.physicalBindings).maxSupportedAbsL,
          carriageways: section.carriageways.length,
          ports: section.ports.length,
        })),
      },
      null,
      2,
    ),
  );
}
