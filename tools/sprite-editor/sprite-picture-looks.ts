import type { ComparisonPictures, ComparisonPicturesRequest } from './sprite-comparison-pictures.js';
import type { CourseReading, CourseReadingRequest } from './sprite-course-reading.js';
import type { CourseEdit, CourseEdited, CourseEditRequest, CourseWidthsRequest } from './sprite-course-edits.js';
import type { PictureLook, PictureLookRequest } from './sprite-look-worker.js';
import { createWorkerRequests } from './worker-requests.js';

/** A thumbnail's side, in screen pixels. */
export const THUMBNAIL = 48;

/** What a picture's look is worked out from: its files' bytes, and the paths and revisions that name them. */
export type PictureLookInput = Omit<PictureLookRequest, 'id'>;

export type PictureLooks = ReturnType<typeof createPictureLooks>;

/**
 * The list's pictures' looks (`PictureLook`) in a worker of their own. Each look is kept by its key (its inputs' paths
 * and revisions), so a change of the working state works out again only the pictures whose files changed; `keep`
 * forgets the looks no longer listed. A worker that fails is started again a few times and then said
 * (`createWorkerRequests`). A look that failed, in part or because its worker did, is forgotten and `again` is told
 * once, so the list asks for it again without waiting for its files to change; failing again, it is kept as it is, its
 * failure said. A second worker of the same script makes the comparison's pictures.
 */
export function createPictureLooks() {
  const ask = createWorkerRequests<PictureLook & { readonly id: number; readonly error?: string }>(
    '../../tools/sprite-editor/sprite-look-worker.js',
    'look',
  );
  const askPictures = createWorkerRequests<{
    id: number;
    pictures: ComparisonPictures;
    reading: CourseReading;
    edited: CourseEdited;
    counts: readonly (readonly [number, number])[];
    error?: string;
  }>('../../tools/sprite-editor/sprite-look-worker.js', 'comparison');
  const looks = new Map<string, Promise<PictureLook>>();
  // The looks asked again once after failing, and who hears that a look is to be asked again.
  const retried = new Set<string>();
  let again = () => {};
  return {
    /** The look of the picture whose inputs `key` names, worked out from `input` (read only when it is not kept). */
    look(key: string, input: () => Promise<PictureLookInput>): Promise<PictureLook> {
      if (!looks.has(key))
        looks.set(
          key,
          input()
            .then((request) => ask(request))
            .then(
              ({ iou, bodies, thumbnail, failure }): PictureLook => ({ iou, bodies, thumbnail, failure }),
              (error: Error): PictureLook => ({ iou: null, bodies: null, thumbnail: null, failure: error.message }),
            )
            .then((look) => {
              if (look.failure && !retried.has(key)) {
                retried.add(key);
                looks.delete(key);
                setTimeout(() => again());
              }
              return look;
            }),
        );
      return looks.get(key)!;
    },
    /** Hear when a failed look is to be asked again. */
    onAgain(listener: () => void) {
      again = listener;
    },
    /**
     * The comparison's pictures 2, 3 and 5 (`comparisonPictures`), made in a worker of their own, so the list's looks
     * never hold them up.
     */
    pictures: (request: Omit<ComparisonPicturesRequest, 'id' | 'kind'>) =>
      askPictures({ kind: 'pictures', ...request } satisfies Omit<ComparisonPicturesRequest, 'id'>).then(
        ({ pictures }) => pictures,
      ),
    /** A product course read off the page's thread (`readCourseForEditor`), in the comparison's worker. */
    course: (course: string, bytes: Uint8Array<ArrayBuffer>) =>
      askPictures({ kind: 'course', course, bytes } satisfies Omit<CourseReadingRequest, 'id'>).then(
        ({ reading }) => reading,
      ),
    /** A product course's document changed by `edits` off the page's thread (`editCourse`). */
    editCourse: (bytes: Uint8Array<ArrayBuffer>, edits: readonly CourseEdit[]) =>
      askPictures({ kind: 'edit', bytes, edits } satisfies Omit<CourseEditRequest, 'id'>).then(({ edited }) => edited),
    /** The collision widths of the placements of `names` in a course's document (`courseWidthsOf`). */
    widthsOf: (bytes: Uint8Array<ArrayBuffer>, names: readonly string[]) =>
      askPictures({ kind: 'widths of', bytes, names } satisfies Omit<CourseWidthsRequest, 'id'>).then(
        ({ counts }) => counts,
      ),
    /** Forget every look but those of `keys`. */
    keep(keys: ReadonlySet<string>) {
      for (const key of looks.keys()) if (!keys.has(key)) looks.delete(key);
      for (const key of retried) if (!keys.has(key)) retried.delete(key);
    },
  };
}
