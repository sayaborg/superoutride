import { coursePathIn } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import type { CourseReading } from './sprite-course-reading.js';
import type { PictureLooks } from './sprite-picture-looks.js';

export type CourseReadings = ReturnType<typeof createCourseReadings>;

/**
 * The product courses as the sprite editor reads them (`readCourseForEditor`): each course's reading made once for each
 * revision of its document, off the page's thread, and kept for its latest revision alone; the list and Baking share it.
 */
export function createCourseReadings(context: EditorContext, looks: PictureLooks) {
  const kept = new Map<
    string,
    { readonly revision: number; readonly reading: Promise<CourseReading & { readonly revision: number }> }
  >();
  return {
    /** The course `id` as it stands now, with the revision it was read at. */
    read(id: string) {
      const path = coursePathIn(context.paths(), id),
        revision = context.revision(path);
      const found = kept.get(path);
      if (found?.revision === revision) return found.reading;
      const reading = context
        .readFile(path)
        .then(async (file) => ({ ...(await looks.course(id, file.bytes)), revision: file.revision }));
      kept.set(path, { revision, reading });
      reading.catch(() => kept.get(path)?.reading === reading && kept.delete(path));
      return reading;
    },
  };
}
