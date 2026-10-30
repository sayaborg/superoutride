import { contentDigest } from '../../src/core/content-digest.js';
import { readCourseDocumentBytes, type SpriteDocument } from '../../src/course/course-document.js';
import { readSpriteLodAsset, type SpriteLodAsset } from '../../src/image/sprite.js';
import { coursePathIn, courseIdOfPath, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { spriteBodyPng } from '../graphics/sprite-body-png.js';
import { readSpriteRecipe, recipeOriginal, SPRITE_SOURCES_DIRECTORY } from '../graphics/sprite-import.js';
import { outlineIoU, placedOriginalBody } from '../graphics/sprite-basis.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { REGISTRATION_IOU_LIMIT } from '../graphics/sprite-registration.js';
import { sourceLowResolution } from '../graphics/sprite-source-size.js';
import type { GenerationFrame } from '../graphics/sprite-generation.js';

/** What a picture is, by its data: an image in the originals' place, a sprite source based on one, or anything else. */
export type PictureKind = 'original' | 'product' | 'general';
export type PictureMark = 'REDRAWN' | 'CHANGED' | 'STALE' | 'LOW-RES' | 'OUTLINE';

/** A picture the chosen course uses: an image and, where the course uses its reflection too, that reflection. */
export interface UsedPicture {
  /** The image the entry is named by; `mirrored` adds `<name>-mirrored`. */
  readonly name: string;
  readonly mirrored: boolean;
  /** The placements naming either image (as their picture or a knocked one). */
  readonly placements: number;
  /** The collision widths (m) of the placements showing either image, each once, sorted; none without a body. */
  readonly widths: readonly number[];
  readonly kind: PictureKind;
  /** The original picture it is or is based on; null for a general picture. */
  readonly original: string | null;
  /** The sprite source that writes the image, if one does. */
  readonly source: string | null;
  readonly marks: readonly PictureMark[];
  /** The saved image, for its thumbnail; null when it cannot be read. */
  readonly asset: SpriteLodAsset | null;
}

export interface PictureLists {
  readonly used: readonly UsedPicture[];
  /** Every sprite source no used picture comes from. */
  readonly others: readonly string[];
  /** Placements naming an original picture. */
  readonly originalPlacements: number;
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
 * readings (an image's asset, an original's body digest) is kept by path and revision in `cache`.
 */
export async function readPictureLists(
  context: EditorContext,
  course: string,
  cache: Map<string, Promise<unknown>>,
): Promise<PictureLists> {
  const paths = context.paths();
  const sources = new Set(spriteSources(paths));
  const once = <T>(path: string, kind: string, make: () => Promise<T>): Promise<T> => {
    const key = `${kind} ${path} ${context.revision(path)}`;
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key) as Promise<T>;
  };
  const asset = (name: string) =>
    once(imagePathIn(paths, name), 'asset', async () =>
      readSpriteLodAsset(JSON.parse(new TextDecoder().decode(await context.store.read(imagePathIn(paths, name))))),
    ).catch(() => null);
  const recipe = (name: string) =>
    once(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`, 'recipe', async () =>
      readSpriteRecipe(
        JSON.parse(new TextDecoder().decode(await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`))),
      ),
    ).catch(() => null);
  const digest = (path: string) => once(path, 'digest', async () => contentDigest(await context.store.read(path)));
  const bodyDigest = (name: string) =>
    once(imagePathIn(paths, name), 'body', async () => {
      const original = await asset(name);
      return original ? contentDigest(spriteBodyPng(original)) : null;
    });

  // Each image the course's placements name, with how many placements name it.
  const read = readCourseDocumentBytes(await context.store.read(coursePathIn(paths, course)), course);
  if (!read.ok) throw new RangeError(`${course} does not read: ${read.diagnostics[0]?.message ?? ''}`);
  const uses = new Map<string, number>(),
    widths = new Map<string, Set<number>>();
  const visit = (elements: readonly unknown[]) => {
    for (const element of elements) {
      if ((element as { kind: string }).kind === 'repeat') {
        visit((element as { elements: readonly unknown[] }).elements);
        continue;
      }
      const sprite = element as SpriteDocument;
      const named = new Set([sprite.image]);
      if (sprite.body?.movable) named.add(sprite.body.movable.knocked.airborne).add(sprite.body.movable.knocked.landed);
      for (const name of named) uses.set(name, (uses.get(name) ?? 0) + 1);
      if (sprite.body) widths.set(sprite.image, (widths.get(sprite.image) ?? new Set()).add(sprite.body.width));
    }
  };
  for (const section of read.value.sections) visit(section.sprites);

  const changes = context.changes();
  const used: UsedPicture[] = [];
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
    const saved = await asset(name);
    const marks: PictureMark[] = [];
    if (kind === 'product' && recipeRead && basis) {
      const png = await digest(`${SPRITE_SOURCES_DIRECTORY}/${source}.png`).catch(() => null);
      const redrawn = png !== basis.bodySha256;
      if (redrawn) marks.push('REDRAWN');
      if ((await bodyDigest(basis.image)) !== basis.bodySha256) marks.push('STALE');
      if (redrawn && sourceLowResolution(recipeRead)) marks.push('LOW-RES');
      // The saved picture's outline against its original body placed by the recipe (pictures 5 and 3).
      const original = await asset(basis.image);
      if (saved && original) {
        const level = saved.levels[0]!;
        const placed = placedOriginalBody(recipeRead, level, spriteLayers(original.levels[0]!).body);
        if (outlineIoU(placed, spriteLayers(level).body) < REGISTRATION_IOU_LIMIT) marks.push('OUTLINE');
      }
    }
    const files = [imagePathIn(paths, name), ...(mirrored ? [imagePathIn(paths, `${name}-mirrored`)] : [])];
    if (source) files.push(`${SPRITE_SOURCES_DIRECTORY}/${source}.png`, `${SPRITE_SOURCES_DIRECTORY}/${source}.json`);
    if (files.some((path) => changes.has(path))) marks.push('CHANGED');
    const shown = [...(widths.get(name) ?? []), ...(mirrored ? (widths.get(`${name}-mirrored`) ?? []) : [])];
    used.push({
      name,
      mirrored,
      placements,
      widths: [...new Set(shown)].sort((a, b) => a - b),
      kind,
      original: kind === 'original' ? name : (basis?.image ?? null),
      source,
      marks,
      asset: saved,
    });
  }
  const fromUsed = new Set(used.map((picture) => picture.source));
  return {
    used,
    others: [...sources].filter((name) => !fromUsed.has(name)).sort(),
    originalPlacements,
  };
}

/**
 * Picture 3 of a course picture: a product's original body placed by its recipe at its saved image's extent and base
 * point, or an original's own body; in its original's default colors, with the original. Null for a general picture
 * or one that does not read.
 */
export async function placedPicture(
  context: EditorContext,
  picture: UsedPicture,
): Promise<{
  readonly frame: GenerationFrame;
  readonly colors: readonly number[];
  readonly original: SpriteLodAsset;
} | null> {
  if (!picture.original || !picture.asset) return null;
  const paths = context.paths();
  const original =
    picture.kind === 'original'
      ? picture.asset
      : readSpriteLodAsset(
          JSON.parse(new TextDecoder().decode(await context.store.read(imagePathIn(paths, picture.original)))),
        );
  const body = spriteLayers(original.levels[0]!).body;
  const colors = original.palettes[original.defaultPalette]!.colors;
  if (picture.kind === 'original') return { frame: body, colors, original };
  if (!picture.source) return null;
  const recipe = readSpriteRecipe(
    JSON.parse(
      new TextDecoder().decode(await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${picture.source}.json`)),
    ),
  );
  const level = picture.asset.levels[0]!;
  const placed = placedOriginalBody(recipe, level, body);
  return { frame: { ...placed, anchorX: level.anchorX, anchorY: level.anchorY }, colors, original };
}
