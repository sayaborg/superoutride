import { readGeneratedSource } from './generation.js';
import { importPublicPicture } from './import.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { encodeContentJson } from '../../src/content/content-manifest.js';
import {
  courseImageNames,
  readCourseDocumentBytes,
  type CourseDocument,
  type SpriteDocument,
} from '../../src/course/course-document.js';
import type { RepeatElement } from '../../src/course/course-repeat.js';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { courseImageFile } from '../graphics/sprite-import.js';
import { scalePublicPicture } from './scaled-picture.js';
import { mirrorSprite } from '../graphics/sprite-mirror.js';
import { PUBLIC_TABLE_PATH, readPublicPictureTable, type PublicPictureSettings } from './table.js';

export const PUBLIC_COURSE_ID = 'enduro-racer-public';
const originalPath = 'courses/enduro-racer.course.json';

/** Derive from the store's current original, including local originals/workbench changes. Never write the base. */
export async function derivePublicPictures(store: ContentStore) {
  const changes = new Map<string, Uint8Array<ArrayBuffer> | null>();
  if (!(await store.list('public-pictures')).includes('enduro-racer.json')) return changes;
  const table = readPublicPictureTable(JSON.parse(new TextDecoder().decode(await store.read(PUBLIC_TABLE_PATH))));
  const course = requireLoaded(readCourseDocumentBytes(await store.read(originalPath), originalPath));
  const used = courseImageNames(course).filter((name) => /^enduror-[0-9a-f]{5}(-mirrored)?$/.test(name));
  const canonical = [...new Set(used.map((name) => name.replace(/-mirrored$/, '')))];
  if (canonical.length !== Object.keys(table.pictures).length || canonical.some((name) => !table.pictures[name]))
    throw new RangeError('Public table must cover exactly the original course object pictures');
  const sourceFiles = await store.list('images');
  const generations = await store.list('public-picture-sources');
  const mappings = new Map<string, { name: string; scale: number; settings: PublicPictureSettings }>();
  for (const name of canonical) {
    const mirrored = !sourceFiles.includes(`${name}.json`);
    const path = `images/${name}${mirrored ? '-mirrored' : ''}.json`;
    const asset = readSpriteLodAsset(JSON.parse(new TextDecoder().decode(await store.read(path))));
    const settings = table.pictures[name]!;
    const { master, scale } = generations.includes(`${name}.json`)
      ? importPublicPicture(asset, settings, (await readGeneratedSource(store, name)).image, mirrored, table.dither)
      : scalePublicPicture(asset, settings, mirrored);
    for (const originalName of used.filter((key) => key.replace(/-mirrored$/, '') === name)) {
      const picture = originalName.endsWith('-mirrored') ? mirrorSprite(master) : master;
      const file = courseImageFile(picture);
      changes.set(file.path, file.bytes);
      mappings.set(originalName, { name: picture.name, scale, settings });
    }
  }
  const imageName = (name: string) => mappings.get(name)?.name ?? name;
  function sprite(element: RepeatElement<SpriteDocument>): RepeatElement<SpriteDocument> {
    if (element.kind === 'repeat') return { ...element, elements: element.elements.map(sprite) };
    const mapping = mappings.get(element.image);
    if (!mapping) return element;
    const body = element.body;
    return {
      ...element,
      image: mapping.name,
      body: body
        ? {
            ...body,
            width: mapping.settings.collisionWidth ?? body.width * mapping.scale,
            movable: body.movable
              ? {
                  ...body.movable,
                  knocked: {
                    airborne: imageName(body.movable.knocked.airborne),
                    landed: imageName(body.movable.knocked.landed),
                  },
                }
              : null,
          }
        : null,
    };
  }
  const derived: CourseDocument = {
    ...course,
    name: 'ENDURO RACER PUBLIC',
    sections: course.sections.map((section) => ({ ...section, sprites: section.sprites.map(sprite) })),
  };
  changes.set(`courses/${PUBLIC_COURSE_ID}.course.json`, encodeContentJson(derived));
  return changes;
}

/** Every authoring compilation sees the same reproducible derivative. */
export async function publicPictureStore(store: ContentStore): Promise<ContentStore> {
  const layered = createLayeredStore(store, await derivePublicPictures(store));
  return Object.freeze({
    ...layered,
    async list(directory: string) {
      const names = await layered.list(directory);
      if (directory !== 'courses') return names;
      const publicFile = `${PUBLIC_COURSE_ID}.course.json`;
      if (!names.includes(publicFile)) return names;
      const ordered = names.filter((name) => name !== publicFile);
      ordered.splice(ordered.indexOf('enduro-racer.course.json') + 1, 0, publicFile);
      return ordered;
    },
  });
}
