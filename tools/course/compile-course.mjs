import { readFile } from 'node:fs/promises';
import { readCourseImages } from './read-course-images.mjs';
import { parseCourseDocument } from '../../dist/course/course-document.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { createRegionSurfaceReader } from '../../dist/physics/region-surface-reader.js';
import { courseFailures, CourseAssetError } from '../../dist/course/course-diagnostics.js';
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
          width: source.format === 'superoutride.sprite-lod' ? source.width : 1280,
          height: source.format === 'superoutride.sprite-lod' ? source.height : 640,
          levels: source.format === 'superoutride.sprite-lod' ? source.levels.length : 1,
        })),
        identity: result.value.identity,
        sections: result.value.sections.map((section) => ({
          id: section.id,
          length: section.raster.length,
          segments: section.raster.segments.length,
          regions: section.regionPartition.regions.length,
          heightNodes: section.height.nodes.length,
          physicalBindings: section.physicalBindings.length,
          maxSupportedAbsL: createRegionSurfaceReader(section.regionPartition, section.physicalBindings)
            .maxSupportedAbsL,
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
                  kind: 'bands',
                  ...section.presentation.ground.metrics,
                  environments: section.presentation.environments.length,
                  scenery: section.presentation.scenery.length,
                },
        })),
      },
      null,
      2,
    ),
  );
}
