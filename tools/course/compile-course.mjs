import { readFile } from 'node:fs/promises';
import { readCourseImages } from './read-course-images.mjs';
import { parseCourseDocument } from '../../dist/course/course-document.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { courseFailures, CourseAssetError } from '../../dist/course/course-diagnostics.js';
import { createCourseGroundSource } from '../../dist/groundmap/course-ground-source.js';
const [sourcePath, flag, imageDirectory, ...extra] = process.argv.slice(2);
if (!sourcePath || (flag !== undefined && (flag !== '--images' || !imageDirectory)) || extra.length)
  throw new TypeError('Usage: compile-course.mjs CourseDocument.json [--images directory]');
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
          fork:
            section.fork === null
              ? null
              : {
                  lock: section.fork.lock.s,
                  closure: section.fork.closure.s,
                  regions: section.fork.regions.map(({ link, ...region }) => ({ ...region, link: link.id })),
                },
          presentation:
            section.presentation === null
              ? null
              : {
                  bandBindings: section.presentation.ground.bands.length,
                  stamps: section.presentation.ground.stamps.length,
                  environments: section.presentation.environments.length,
                  scenery: section.presentation.scenery.length,
                  groundOriginRgb555: createCourseGroundSource(section.presentation.ground).sample(0, 0),
                },
        })),
      },
      null,
      2,
    ),
  );
}
