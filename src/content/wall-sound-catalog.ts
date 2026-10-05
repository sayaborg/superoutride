import { AdmissionError, admit, type AdmissionResult } from '../core/admission.js';
import { compileWallSoundDocument, type CompiledWallSounds } from '../audio/wall-sounds.js';
import type { CourseDocument } from '../course/course-document.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** The single wall-sound document's identifier: its file name and manifest ID. */
export const WALL_SOUNDS_ID = 'default';

/** Admit the wall sounds from their sources, from the build's files or delivery's manifest alike: exactly one document. */
export function compileWallSounds(sources: readonly DocumentSource[]): AdmissionResult<CompiledWallSounds> {
  const single = admitSingleDocument(sources, WALL_SOUNDS_ID, 'wall sound document');
  if (!single.ok) return single;
  return compileWallSoundDocument(single.value.value, single.value.path, single.value.sha256);
}

/** Every solid wall of a course document names a wall sound of the document; checked once, at the content build. */
export function admitCourseWallSounds(
  course: CourseDocument,
  sounds: CompiledWallSounds,
  path: string,
): AdmissionResult<CourseDocument> {
  return admit(path, () => {
    course.sections.forEach((section, i) =>
      section.walls.forEach((wall, j) => {
        if (wall.solid && !Object.hasOwn(sounds.walls, wall.solid.sound))
          throw new AdmissionError(
            'unresolved_reference',
            `/sections/${i}/walls/${j}/solid/sound`,
            `No wall sound ${wall.solid.sound}`,
          );
      }),
    );
    return course;
  });
}

/** Transport verifies the saved bytes before admission; each composition loads the document once. */
export async function loadWallSounds(content: ContentDelivery): Promise<CompiledWallSounds> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'wall-sound'))
    sources.push({
      id: file.id,
      path: file.path,
      value: await content.json('wall-sound', file.id),
      sha256: file.sha256,
    });
  return requireLoaded(compileWallSounds(sources));
}
