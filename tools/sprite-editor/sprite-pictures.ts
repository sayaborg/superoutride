import { contentDigest } from '../../src/core/content-digest.js';
import type { SpriteLodAsset } from '../../src/image/sprite.js';
import { courseIdOfPath, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { readSpriteRecipe, recipeOriginal, SPRITE_SOURCES_DIRECTORY } from '../graphics/sprite-import.js';
import { REGISTRATION_IOU_LIMIT } from '../graphics/sprite-registration.js';
import { sourceLowResolution } from '../graphics/sprite-source-size.js';
import type { PictureLooks } from './sprite-picture-looks.js';
import type { CourseReadings } from './sprite-course-readings.js';

/** What a picture is, by its data: an image in the originals' place, a sprite source based on one, or anything else. */
export type PictureKind = 'original' | 'product' | 'general';
/** A picture's marks; `STALE?` and `OUTLINE?` say that STALE and OUTLINE could not be checked (`UsedPicture.failure`). */
export type PictureMark = 'REDRAWN' | 'CHANGED' | 'STALE' | 'LOW-RES' | 'OUTLINE' | 'STALE?' | 'OUTLINE?';

/** A picture the chosen course uses: an image and, where the course uses its reflection too, that reflection. */
export interface UsedPicture {
  /** The image the entry is named by; `mirrored` adds `<name>-mirrored`. */
  readonly name: string;
  readonly mirrored: boolean;
  /** The placements naming either image (as their picture or a knocked one). */
  readonly placements: number;
  /** The collision widths (m) of the placements showing either image, each once, sorted; none without a body. */
  readonly widths: readonly number[];
  /** The revision of the course document its placements and widths were read at, which an edit of them carries. */
  readonly courseRevision: number;
  readonly kind: PictureKind;
  /** Whether it is a product picture baked from several pieces. */
  readonly baked: boolean;
  /**
   * The original picture it is or is based on, which names its generation input; a baked picture's own name less
   * `product-`; null for a general picture.
   */
  readonly original: string | null;
  /** The sprite source that writes the image, if one does. */
  readonly source: string | null;
  readonly marks: readonly PictureMark[];
  /** Why part of its look could not be worked out (`PictureLook.failure`), or null. */
  readonly failure: string | null;
  /** Its thumbnail (`PictureLook`); null when it cannot be made. */
  readonly thumbnail: ImageBitmap | null;
}

export interface PictureLists {
  readonly used: readonly UsedPicture[];
  /** Every sprite source no used picture comes from. */
  readonly others: readonly string[];
  /** Placements naming an original picture. */
  readonly originalPlacements: number;
}

/** A saved image's master (its level 0) and its body's digest, read off the page's thread. */
export interface PictureMaster {
  readonly asset: SpriteLodAsset;
  readonly bodySha256: string;
}

// The pictures read, each kept by its path and revision; a few recent ones are kept.
const masters = new Map<string, Promise<PictureMaster | null>>();

/**
 * The saved image `name` as the working state holds it, or null when it cannot be read: read off the page's thread
 * (`PictureLooks.picture`) once for each revision.
 */
export function pictureMaster(
  context: EditorContext,
  looks: PictureLooks,
  name: string,
): Promise<PictureMaster | null> {
  const path = imagePathIn(context.paths(), name);
  const key = `${path}@${context.revision(path)}`;
  if (!masters.has(key))
    masters.set(
      key,
      context.store
        .read(path)
        .then((bytes) => looks.picture(bytes))
        .catch(() => null),
    );
  for (const old of masters.keys()) if (masters.size > 16) masters.delete(old);
  return masters.get(key)!;
}

/** The product courses among the store's paths (`<original id>-product`, outside the originals' place), sorted. */
export function productCourses(paths: readonly string[]): readonly string[] {
  return paths
    .filter((path) => !inOriginalsPlace(path))
    .map(courseIdOfPath)
    .filter((id): id is string => !!id && id.endsWith('-product'))
    .sort();
}

/** The sprite sources among the store's paths, by name. */
export function spriteSources(paths: readonly string[]): readonly string[] {
  return paths
    .filter((path) => path.startsWith(`${SPRITE_SOURCES_DIRECTORY}/`) && path.endsWith('.json'))
    .map((path) => path.slice(SPRITE_SOURCES_DIRECTORY.length + 1, -'.json'.length));
}

/**
 * Read the pictures `course` uses and the other sprite sources from the working state. What does not change between
 * readings (a recipe, a PNG's digest, the course's reading) is kept by path in `cache`, for its latest revision alone; each picture's
 * outline and thumbnail are `looks`', kept by the paths and revisions of the files they are made from, and worked out
 * off the page's thread.
 */
export async function readPictureLists(
  context: EditorContext,
  course: string,
  cache: Map<string, { readonly revision: number; readonly value: Promise<unknown> }>,
  looks: PictureLooks,
  courses: CourseReadings,
): Promise<PictureLists> {
  const paths = context.paths();
  const sources = new Set(spriteSources(paths));
  // Each path's reading of one kind is kept for its latest revision alone, so the cache holds no older revisions.
  const once = <T>(path: string, kind: string, make: () => Promise<T>): Promise<T> => {
    const key = `${kind} ${path}`,
      revision = context.revision(path);
    const kept = cache.get(key);
    if (kept?.revision === revision) return kept.value as Promise<T>;
    const value = make();
    cache.set(key, { revision, value });
    return value;
  };
  const recipe = (name: string) =>
    once(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`, 'recipe', async () =>
      readSpriteRecipe(
        JSON.parse(new TextDecoder().decode(await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`))),
      ),
    ).catch(() => null);
  const digest = (path: string) => once(path, 'digest', async () => contentDigest(await context.store.read(path)));
  // Each image the course's placements name, with how many placements name it, and their widths: the course read
  // and checked once for each revision of it, off the page's thread.
  const reading = await courses.read(course);
  if (reading.reason) throw new RangeError(reading.reason);
  const courseRevision = reading.revision;
  const uses = new Map(reading.uses),
    widths = new Map(reading.widths.map(([name, list]) => [name, new Set(list)]));

  const changes = context.changes();
  const used: UsedPicture[] = [],
    lookKeys = new Set<string>();
  let originalPlacements = 0;
  for (const [name, count] of [...uses].sort(([a], [b]) => a.localeCompare(b))) {
    // A reflection the course also uses unreflected is part of that image's entry.
    const base = name.endsWith('-mirrored') ? name.slice(0, -'-mirrored'.length) : null;
    if (base !== null && uses.has(base)) continue;
    const mirrored = uses.has(`${name}-mirrored`);
    const placements = count + (mirrored ? uses.get(`${name}-mirrored`)! : 0);
    // A source's reflection the course uses alone comes from that source.
    const source = sources.has(name) ? name : base !== null && sources.has(base) ? base : null;
    const recipeRead = source ? await recipe(source) : null;
    const kind: PictureKind = inOriginalsPlace(imagePathIn(paths, name))
      ? 'original'
      : recipeRead?.basedOn
        ? 'product'
        : 'general';
    // The one original a product picture is made from (a baked one has several).
    const basis = recipeRead && recipeOriginal(recipeRead);
    if (kind === 'original') originalPlacements += placements;
    // The outline (pictures 5 and 3: the saved picture against what it is based on, placed by its recipe), the
    // originals' body digests and the thumbnail, made off the page's thread and kept by the files they are made from.
    const imagePath = imagePathIn(paths, name);
    const recipePath = kind === 'product' ? `${SPRITE_SOURCES_DIRECTORY}/${source}.json` : null;
    const pieces = kind === 'product' ? (recipeRead?.basedOn ?? []) : [];
    const originalPaths = pieces.map((piece) => imagePathIn(paths, piece.image));
    const lookKey = [imagePath, recipePath, ...originalPaths]
      .map((path) => path && `${path}@${context.revision(path)}`)
      .join(' ');
    lookKeys.add(lookKey);
    // A product picture without its image still has its originals' bodies checked.
    const look =
      paths.includes(imagePath) || kind === 'product'
        ? await looks.look(lookKey, async () => ({
            image: paths.includes(imagePath) ? await context.store.read(imagePath) : null,
            shadowInMaster: kind === 'original',
            recipe: recipePath ? await context.store.read(recipePath) : null,
            originals: await Promise.all(originalPaths.map((path) => context.store.read(path))),
          }))
        : null;
    const marks: PictureMark[] = [];
    if (kind === 'product' && recipeRead) {
      // Redrawn once its PNG is no longer its original's body (one original) or the one baking wrote (a baked picture);
      // stale when an original's body has changed since.
      const png = await digest(`${SPRITE_SOURCES_DIRECTORY}/${source}.png`).catch(() => null);
      const redrawn = png !== (basis ? basis.bodySha256 : recipeRead.bakedSha256);
      if (redrawn) marks.push('REDRAWN');
      if (!look?.bodies) marks.push('STALE?');
      else if (pieces.some((piece, i) => look.bodies![i] !== piece.bodySha256)) marks.push('STALE');
      if (redrawn && sourceLowResolution(recipeRead)) marks.push('LOW-RES');
    }
    const baked = kind === 'product' && !basis && !!recipeRead?.basedOn;
    if (kind === 'product')
      if (typeof look?.iou !== 'number') marks.push('OUTLINE?');
      else if (look.iou < REGISTRATION_IOU_LIMIT) marks.push('OUTLINE');
    const files = [imagePathIn(paths, name), ...(mirrored ? [imagePathIn(paths, `${name}-mirrored`)] : [])];
    if (source) files.push(`${SPRITE_SOURCES_DIRECTORY}/${source}.png`, `${SPRITE_SOURCES_DIRECTORY}/${source}.json`);
    if (files.some((path) => changes.has(path))) marks.push('CHANGED');
    const shown = [...(widths.get(name) ?? []), ...(mirrored ? (widths.get(`${name}-mirrored`) ?? []) : [])];
    used.push({
      name,
      mirrored,
      placements,
      widths: [...new Set(shown)].sort((a, b) => a - b),
      courseRevision,
      kind,
      baked,
      original: kind === 'original' ? name : baked ? name.replace(/^product-/, '') : (basis?.image ?? null),
      source,
      marks,
      failure: look?.failure ?? null,
      thumbnail: look?.thumbnail ?? null,
    });
  }
  looks.keep(lookKeys);
  const fromUsed = new Set(used.map((picture) => picture.source));
  return {
    used,
    others: [...sources].filter((name) => !fromUsed.has(name)).sort(),
    originalPlacements,
  };
}

/** The files of the originals `names`, each by the key of its path and revision, for a worker to read. */
export function originalFiles(context: EditorContext, names: readonly string[]) {
  return Promise.all(
    names.map(async (name) => {
      const path = imagePathIn(context.paths(), name);
      return { key: `${path} ${context.revision(path)}`, bytes: await context.store.read(path) };
    }),
  );
}
