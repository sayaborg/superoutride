import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { coursePathIn, imageNameOfPath, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import { renameCoursePictures, savedCourseDocument } from '../authoring/course-edits.js';
import type { Json } from '../authoring/json-pointer.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { confirmField, finiteNumber } from '../browser-shared/pending-edit.js';
import { SPRITE_DITHERS } from '../graphics/sprite-colors.js';
import {
  importedImageFiles,
  readSpriteRecipe,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
} from '../graphics/sprite-import.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import { originalProductSource } from '../graphics/sprite-product.js';
import { spriteMasterWidth, type SourceImage } from '../graphics/sprite-source-compiler.js';
import type { OpenSource } from './sprite-comparison.js';
import type { SpriteImporter } from './sprite-importer.js';
import type { UsedPicture } from './sprite-pictures.js';

/** The picture the controls edit: a chosen entry of the product course's list and, for a product, its open source. */
export interface ControlTarget {
  readonly picture: UsedPicture;
  readonly course: string;
  readonly source: OpenSource | null;
}

/**
 * The recipe an edit begins from: a product's open source, or for an original the product picture its first edit
 * makes (`png` then being written too).
 */
interface Reading {
  readonly target: ControlTarget;
  readonly name: string;
  readonly recipe: SpriteRecipe;
  readonly revision: number;
  readonly image: SourceImage;
  readonly key: string;
  readonly png: Uint8Array<ArrayBuffer> | null;
}

/** A recipe's base point and extent in its master's texels. */
function masterFrame(recipe: SpriteRecipe) {
  const width = spriteMasterWidth(recipe.widthMeters);
  const texel = recipe.crop.width / width;
  const height = Math.ceil(recipe.crop.height / texel);
  return {
    texel,
    anchorX: (recipe.anchor.x + 0.5 - recipe.crop.x) / texel - 0.5,
    anchorY: recipe.anchor.y === undefined ? height - 0.5 : (recipe.anchor.y + 0.5 - recipe.crop.y) / texel - 0.5,
  };
}

/** The recipe with its base point at master texel `(x, y)`. */
function withAnchor(recipe: SpriteRecipe, x: number, y: number): SpriteRecipe {
  const { texel } = masterFrame(recipe);
  const fine = (value: number) => Math.round(value * 1e9) / 1e9;
  return {
    ...recipe,
    anchor: { x: fine(recipe.crop.x + (x + 0.5) * texel - 0.5), y: fine(recipe.crop.y + (y + 0.5) * texel - 0.5) },
  };
}

/**
 * The controls of an original or product picture: its height above the ground (m, with texels), its base point across
 * and its ground row (master texels; by number, by a click on a picture, or by the arrow keys one texel at a time), its
 * shadow and its dither. Each change is one edit writing the recipe and the course images its import makes. The first
 * change of an original picture first makes its product picture in the same edit: the original's body PNG and recipe
 * (`originalProductSource`), its images, and the course's placements renamed to it; `made` hears the new name.
 */
export function createProductControls(
  context: EditorContext,
  importInWorker: SpriteImporter,
  made: (name: string) => void,
) {
  const fields = {
    height: make('input', '', { type: 'number', step: 'any', size: '6' }),
    across: make('input', '', { type: 'number', step: '1', size: '6' }),
    ground: make('input', '', { type: 'number', step: '1', size: '6' }),
  };
  const texels = make('span', '', { class: 'hint' });
  const shadow = make('input', '', { type: 'checkbox' });
  const dither = make('select');
  dither.append(...['none', ...SPRITE_DITHERS.filter((d) => d !== 'none')].map((d) => make('option', d, { value: d })));
  const note = make('p', '', { role: 'status', class: 'hint' });
  const originalHint = make('p', 'An original picture: its first change makes its product picture.', { class: 'hint' });
  const element = make('div', '', { class: 'product-controls' });
  const labelled = (text: string, control: HTMLElement, after: (HTMLElement | string)[] = []) => {
    const label = make('label', `${text} `);
    label.append(control, ...after);
    return label;
  };
  element.append(
    originalHint,
    labelled('Height above the ground (m)', fields.height, [' ', texels]),
    ' ',
    labelled('Base point across', fields.across),
    ' ',
    labelled('ground row', fields.ground),
    ' ',
    labelled('Shadow', shadow),
    ' ',
    labelled('Dither', dither),
    note,
  );
  element.hidden = true;

  let reading: Reading | null = null;
  // The reading each field was drawn from, which its edit is made from.
  const drawnFrom = new Map<HTMLElement, Reading | null>();
  // An original's product source, made once per original image revision.
  const firsts = new Map<string, Promise<{ png: Uint8Array<ArrayBuffer>; recipe: SpriteRecipe; image: SourceImage }>>();

  const read = async (target: ControlTarget): Promise<Reading | null> => {
    const { picture } = target;
    if (picture.kind === 'product' && target.source) return { target, ...target.source, png: null };
    if (picture.kind !== 'original' || !picture.asset) return null;
    const path = imagePathIn(context.paths(), picture.name);
    const key = `${path} ${context.revision(path)} ${picture.mirrored}`;
    if (!firsts.has(key))
      firsts.set(
        key,
        originalProductSource(picture.asset, picture.name, picture.mirrored).then(async (first) => ({
          ...first,
          image: await decodeSpritePng(first.png, PNG),
        })),
      );
    const first = await firsts.get(key)!;
    const name = `product-${picture.name}`;
    return {
      target,
      name,
      recipe: first.recipe,
      revision: context.revision(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`),
      image: first.image,
      key: `${name} ${await contentDigest(first.png)}`,
      png: first.png,
    };
  };

  /** One edit of `from`'s recipe, with the images its import makes; an original's product picture made with it. */
  const edit = async (from: Reading, change: (recipe: SpriteRecipe) => SpriteRecipe, label: string) => {
    try {
      const recipe = readSpriteRecipe(JSON.parse(JSON.stringify(change(from.recipe))));
      const { master } = await importInWorker(from.key, from.image, recipe, from.name);
      const paths = context.paths();
      const images = importedImageFiles(recipe, master);
      const taken = images.map((image) => imagePathIn(paths, imageNameOfPath(image.path)!)).find(inOriginalsPlace);
      if (taken) throw new RangeError(`content/${taken} is an original picture, which no page writes`);
      const base = `${SPRITE_SOURCES_DIRECTORY}/${from.name}`;
      const files: (readonly [string, Uint8Array<ArrayBuffer> | null, number])[] = [
        [`${base}.json`, new TextEncoder().encode(formatSavedJson(recipe)), from.revision],
        ...images.map((image) => [image.path, image.bytes, context.revision(image.path)] as const),
      ];
      const { picture, course } = from.target;
      if (from.png) {
        // The first edit of an original: its PNG, and every placement of the course renamed to the product picture.
        files.push([`${base}.png`, from.png, context.revision(`${base}.png`)]);
        const renames = new Map([[picture.name, from.name]]);
        if (picture.mirrored) renames.set(`${picture.name}-mirrored`, `${from.name}-mirrored`);
        const coursePath = coursePathIn(paths, course);
        const document = await context.readFile(coursePath);
        const renamed = renameCoursePictures(JSON.parse(new TextDecoder().decode(document.bytes)) as Json, renames);
        if (!renamed.ok) throw new RangeError(`${course}: ${renamed.reason}`);
        files.push([
          coursePath,
          new TextEncoder().encode(formatSavedJson(savedCourseDocument(renamed.document))),
          document.revision,
        ]);
        context.setFiles(files, `Make ${from.name}: ${label}`);
        note.textContent = `Made ${from.name}; ${renamed.changes.length} names in ${course} now name it.`;
        made(from.name);
      } else {
        context.setFiles(files, `${label} (${from.name})`);
        note.textContent = '';
      }
    } catch (error) {
      note.textContent = `${from.name}: ${error instanceof Error ? error.message : error}`;
    }
  };

  const field = (
    input: HTMLInputElement,
    apply: (recipe: SpriteRecipe, value: number) => SpriteRecipe,
    label: string,
  ) =>
    confirmField(
      input,
      finiteNumber,
      (value, from) => from && void edit(from, (recipe) => apply(recipe, value), label),
      () => drawnFrom.get(input) ?? null,
      () => void draw(),
    );
  field(
    fields.height,
    (recipe, height) => {
      const { anchorY } = masterFrame(recipe);
      if (!(height > 0)) throw new RangeError('A height above the ground is more than 0');
      return {
        ...recipe,
        widthMeters: (recipe.widthMeters * height * SPRITE_SOURCE_TEXELS_PER_METER) / (anchorY + 0.5),
      };
    },
    'Set height',
  );
  field(fields.across, (recipe, x) => withAnchor(recipe, x, masterFrame(recipe).anchorY), 'Set base point');
  field(fields.ground, (recipe, y) => withAnchor(recipe, masterFrame(recipe).anchorX, y), 'Set ground row');
  shadow.addEventListener('change', () => {
    const from = drawnFrom.get(shadow);
    if (!from) return;
    const { shadow: _, ...rest } = from.recipe;
    void edit(from, () => (shadow.checked ? { ...rest, shadow: 'board' } : rest), 'Set shadow');
  });
  dither.addEventListener('change', () => {
    const from = drawnFrom.get(dither);
    if (!from) return;
    const { dither: _, ...rest } = from.recipe;
    const chosen = dither.value as SpriteRecipe['dither'];
    void edit(from, () => (chosen === 'none' ? rest : { ...rest, dither: chosen }), 'Set dither');
  });

  const draw = () => {
    if (!reading) return;
    const { anchorX, anchorY } = masterFrame(reading.recipe);
    const values = {
      height: String(Math.round(((anchorY + 0.5) / SPRITE_SOURCE_TEXELS_PER_METER) * 1e4) / 1e4),
      across: String(Math.round(anchorX * 1e3) / 1e3),
      ground: String(Math.round(anchorY * 1e3) / 1e3),
    };
    for (const [key, input] of Object.entries(fields))
      if (document.activeElement !== input) {
        input.value = values[key as keyof typeof values];
        drawnFrom.set(input, reading);
      }
    texels.textContent = `(${Math.round((anchorY + 0.5) * 100) / 100} texels)`;
    shadow.checked = reading.recipe.shadow === 'board';
    dither.value = reading.recipe.dither ?? 'none';
    drawnFrom.set(shadow, reading);
    drawnFrom.set(dither, reading);
  };

  return {
    element,
    /** Show the controls of `target`, or none. */
    async show(target: ControlTarget | null) {
      const next = target ? await read(target).catch(() => null) : null;
      reading = next;
      element.hidden = !next;
      originalHint.hidden = !next?.png;
      draw();
    },
    /** Move the base point by whole texels, from the reading shown. */
    move(dx: number, dy: number) {
      const from = reading;
      if (!from || (!dx && !dy)) return;
      const { anchorX, anchorY } = masterFrame(from.recipe);
      void edit(from, (recipe) => withAnchor(recipe, anchorX + dx, anchorY + dy), 'Move base point');
    },
  };
}
