import { readFile } from 'node:fs/promises';
import { readCourseImages } from './read-course-images.js';
import { parseCourseDocument } from './course-project.js';
import { readDirectoryFile, requireCompiled } from './authoring-io.js';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from '../build/node-content-store.js';
import { courseFailures, CourseAssetError } from '../../src/course/course-diagnostics.js';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { courseFileId, courseFileSha256 } from './course-file-id.js';
const [sourcePath, flag, imageDirectory, ...extra] = process.argv.slice(2);
if (!sourcePath || (flag !== undefined && (flag !== '--images' || !imageDirectory)) || extra.length)
  throw new TypeError('Usage: npm run compile:course -- CourseDocument.json [--images directory]');
const { materials } = requireCompiled(await compileContent(createNodeContentStore()));
const parsed = parseCourseDocument(await readFile(sourcePath, 'utf8'), sourcePath);
let result: Awaited<ReturnType<typeof compileCourseDocument>>;
if (parsed.ok) {
  try {
    const inputs = imageDirectory ? await readCourseImages(parsed.value.assets, readDirectoryFile(imageDirectory)) : [];
    result = await compileCourseDocument(
      parsed.value,
      courseFileId(sourcePath),
      await courseFileSha256(parsed.value),
      inputs,
      materials,
      sourcePath,
    );
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
        images: result.value.assets.map((asset) => ({
          id: asset.id,
          sha256: asset.sha256,
          width: asset.image.width,
          height: asset.image.height,
          levels: asset.kind === 'sprite' ? asset.image.levels.length : 1,
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
                  exits: section.fork.exits.map(({ link, ...exit }) => ({ ...exit, link: link.id })),
                },
          appearance:
            section.appearance === null
              ? null
              : {
                  ...section.color.metrics,
                  environments: section.appearance.environments.length,
                  sprites: section.appearance.sprites.length,
                },
        })),
      },
      null,
      2,
    ),
  );
}
