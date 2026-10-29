import { admit, AdmissionError } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import type { ContentStore } from './content-store.js';

/**
 * The originals' place under `content/`: the original courses and pictures, which the road data tool raises from the
 * ROMs alone ([Original road data](../../docs/original-road-data.md#raising-the-originals-again)) and no person edits.
 * Every other course and picture is made by hand and lies in `courses/` and `images/`.
 */
export const ORIGINALS_PLACE = 'originals';
/** Whether `path` under `content/` lies in the originals' place, which no page or command but road data writes. */
export const inOriginalsPlace = (path: string) => path.startsWith(`${ORIGINALS_PLACE}/`);
const COURSE_DIRECTORIES = ['courses', `${ORIGINALS_PLACE}/courses`] as const;
const IMAGE_DIRECTORIES = ['images', `${ORIGINALS_PLACE}/images`] as const;
const COURSE_EXTENSION = '.course.json';
const IMAGE_EXTENSION = '.json';

/** Where each course and image lies under `content/`: one path an id or name, the hand-made place's first. */
export interface ContentPlaces {
  /** Each course document's path by its course id. */
  readonly courses: ReadonlyMap<string, string>;
  /** Each saved image's path by its name. */
  readonly images: ReadonlyMap<string, string>;
}

/**
 * The places of the store's courses and images. A course id or image name in both places is refused, so that a name
 * finds one file.
 */
export async function readContentPlaces(store: ContentStore): Promise<ContentPlaces> {
  const placed = async (directories: readonly string[], extension: string) => {
    const paths = new Map<string, string>();
    for (const directory of directories)
      for (const file of await store.list(directory)) {
        if (!file.endsWith(extension)) continue;
        const name = file.slice(0, -extension.length),
          path = `${directory}/${file}`,
          other = paths.get(name);
        if (other !== undefined)
          requireLoaded(
            admit(`content/${path}`, () => {
              throw new AdmissionError('duplicate_id', '', `${name} lies in both content/${other} and content/${path}`);
            }),
          );
        paths.set(name, path);
      }
    return paths;
  };
  return Object.freeze({
    courses: await placed(COURSE_DIRECTORIES, COURSE_EXTENSION),
    images: await placed(IMAGE_DIRECTORIES, IMAGE_EXTENSION),
  });
}

/** The name of the file at `path` under `content/` among `directories` with `extension`, else null. */
function nameOfPath(path: string, directories: readonly string[], extension: string): string | null {
  for (const directory of directories) {
    const file = path.startsWith(`${directory}/`) ? path.slice(directory.length + 1) : '';
    if (file.endsWith(extension) && !file.includes('/')) return file.slice(0, -extension.length);
  }
  return null;
}

/** The course id of a course document's path under `content/`, in either place, else null. */
export const courseIdOfPath = (path: string) => nameOfPath(path, COURSE_DIRECTORIES, COURSE_EXTENSION);

/** The image name of a saved image's path under `content/`, in either place, else null. */
export const imageNameOfPath = (path: string) => nameOfPath(path, IMAGE_DIRECTORIES, IMAGE_EXTENSION);

/** The path of the image `name` under `content/`: its place's, or the hand-made place's where it lies in neither. */
export const imagePath = (places: ContentPlaces, name: string) =>
  places.images.get(name) ?? `images/${name}${IMAGE_EXTENSION}`;

/** The path of the course `id` under `content/`: its place's, or the hand-made place's where it lies in neither. */
export const coursePath = (places: ContentPlaces, id: string) =>
  places.courses.get(id) ?? `courses/${id}${COURSE_EXTENSION}`;

/** The path of the course `id` among the store's `paths`: its place's, or the hand-made place's where it lies in neither. */
export const coursePathIn = (paths: readonly string[], id: string) =>
  paths.find((path) => courseIdOfPath(path) === id) ?? `courses/${id}${COURSE_EXTENSION}`;

/** The path of the image `name` among the store's `paths`: its place's, or the hand-made place's where it lies in neither. */
export const imagePathIn = (paths: readonly string[], name: string) =>
  paths.find((path) => imageNameOfPath(path) === name) ?? `images/${name}${IMAGE_EXTENSION}`;
