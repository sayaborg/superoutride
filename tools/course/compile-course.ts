import { readFile } from 'node:fs/promises';
import { readCourseImages } from './read-course-images.js';
import { createCourseProject, parseCourseDocument } from './course-project.js';
import { courseFailures, CourseAssetError } from '../../src/course/course-diagnostics.js';
const [sourcePath, flag, imageDirectory, ...extra] = process.argv.slice(2);
if (!sourcePath || (flag !== undefined && (flag !== '--images' || !imageDirectory)) || extra.length)
  throw new TypeError('Usage: npm run compile:course -- CourseDocument.json [--images directory]');
const project = createCourseProject();
const sourceText = await readFile(sourcePath, 'utf8');
const parsed = parseCourseDocument(sourceText);
let result: Awaited<ReturnType<typeof project.importDocument>>;
if (parsed.ok) {
  try {
    const inputs = imageDirectory ? await readCourseImages(parsed.value.assets, imageDirectory) : [];
    result = await project.importDocument(sourceText, inputs);
  } catch (error) {
    if (!(error instanceof CourseAssetError)) throw error;
    result = courseFailures([error]);
  }
} else result = parsed;
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
          length: section.coordinates.domain.end,
          segments: section.segments.length,
          materialSlabs: section.material.slabs.length,
          heightNodes: section.height.knots.length,
          lateralBoundsAtStart: section.coordinates.domain.lateralAt(section.coordinates.domain.start, {
            left: 0,
            right: 0,
          }),
          carriageways: section.carriageways.length,
          outgoingLinks: section.outgoing.length,
          fork:
            section.fork === null
              ? null
              : {
                  lock: section.fork.lock.s,
                  closure: section.fork.closure.s,
                  regions: section.fork.regions.map(({ link, ...interval }) => ({ ...interval, link: link.id })),
                },
          presentation:
            section.presentation === null
              ? null
              : {
                  kind: 'strips',
                  ...section.color.metrics,
                  environments: section.presentation.environments.length,
                  sprites: section.presentation.sprites.length,
                },
        })),
      },
      null,
      2,
    ),
  );
}
