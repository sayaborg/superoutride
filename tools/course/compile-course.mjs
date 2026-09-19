import { readFile } from 'node:fs/promises';
import { courseViewReport, courseDrivingViewReport } from './course-view-report.mjs';
import { readCourseImages } from './read-course-images.mjs';
import { parseCourseDocument } from '../../dist/course/course-document.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import {
  compileCoursePhysicalOverlaps,
  compileCoursePhysicalDomains,
} from '../../dist/compiler/course-physical-overlap.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import {
  courseFailure,
  courseFailures,
  CourseInputError,
  CourseAssetError,
} from '../../dist/course/course-diagnostics.js';
import { compileCourseGeometryWindow } from '../../dist/course/course-geometry-window.js';

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

const [sourcePath, ...arguments_] = process.argv.slice(2);
const imageDirectory = arguments_[0] === '--images' ? arguments_[1] : undefined;
const extra = arguments_[0] === '--images' ? arguments_.slice(2) : arguments_;
if (
  !sourcePath ||
  (arguments_[0] === '--images' && !imageDirectory) ||
  (extra.length &&
    extra[0] !== '--view' &&
    !(extra.length === 8 && extra[0] === '--driving-view') &&
    !(extra.length === 4 && extra[0] === '--geometry-window') &&
    !(extra.length === 1 && extra[0] === '--physical-overlap') &&
    !(extra.length === 2 && extra[0] === '--physical-domain'))
)
  throw new TypeError(
    'Usage: npm run compile:course -- CourseDocument.json [--images directory] [--geometry-window Section-ID start end | --physical-overlap | --physical-domain demand.json | --view source-s behind ahead active-index Link-ID ... | --driving-view min-s max-s advance camera-distance render-depth recovery-backtrack last-safe-s]',
  );
const project = createCourseProject();
const sourceText = await readFile(sourcePath, 'utf8');
let result = parseCourseDocument(sourceText);
if (result.ok) {
  try {
    const inputs = imageDirectory ? await readCourseImages(result.value.assets, imageDirectory) : [];
    result = await project.importDocument(sourceText, inputs);
  } catch (error) {
    if (!(error instanceof CourseAssetError)) throw error;
    result = courseFailures([error]);
  }
}
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else if (extra[0] === '--geometry-window') {
  const section = result.value.sections.find((source) => source.id === extra[1]);
  if (!section) throw new RangeError('Geometry window must name an existing Section');
  const qualification = compileCourseGeometryWindow(section, { sStart: Number(extra[2]), sEnd: Number(extra[3]) });
  if (!qualification.ok) {
    console.error(JSON.stringify(qualification, null, 2));
    process.exitCode = 1;
  } else
    console.log(
      JSON.stringify(
        {
          scope: qualification.value.scope,
          section: section.id,
          interval: qualification.value.interval,
          cells: qualification.value.cells,
          identity: result.value.identity,
        },
        null,
        2,
      ),
    );
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
  const view =
    extra[0] === '--driving-view'
      ? courseDrivingViewReport(result.value, extra.slice(1))
      : courseViewReport(result.value, extra.slice(1));
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
        images: result.value.assets.map(({ id, sha256, source }) => ({
          id,
          sha256,
          width: source.width,
          height: source.height,
          levels: source.levels.length,
        })),
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
