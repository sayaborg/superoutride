import { contentDigest } from '../../src/core/content-digest.js';
import { imagePathIn } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { readSpriteRecipe, SPRITE_SOURCES_DIRECTORY } from '../graphics/sprite-import.js';
import { REGISTRATION_IOU_LIMIT } from '../graphics/sprite-registration.js';
import { sourceLowResolution } from '../graphics/sprite-source-size.js';
import type { SpriteImporter } from './sprite-importer.js';
import { originalFiles, type UsedPicture } from './sprite-pictures.js';
import type { createProductControls } from './sprite-product-controls.js';

type Controls = ReturnType<typeof createProductControls>;

/**
 * K's generated PNGs into original and product pictures. A PNG dropped on the page chooses its picture by its file
 * name, which starts with the original's name (`enduror-10398…` or `product-enduror-10398…`); one dropped on a picture
 * of the list goes to that picture; exported `-input` and `-guide` files are not taken. Each import registers the PNG
 * to picture 3 (`registeredProductSource`), keeps it at its saved size, chooses its colors once and makes its alternate
 * palettes, and writes it through the controls as one edit (an original's first edit making its product picture).
 * Register again does the same with the saved PNG, keeping the palettes; Make alternate palettes makes them again from
 * the default.
 */
export function createPngImport(context: EditorContext, importInWorker: SpriteImporter, controls: Controls) {
  const file = make('input', '', { type: 'file', accept: 'image/png' });
  const choose = make('button', 'Import PNG…', { type: 'button' });
  const again = make('button', 'Register again', { type: 'button' });
  const alternates = make('button', 'Make alternate palettes', { type: 'button' });
  const status = make('p', '', { role: 'status', class: 'hint' });
  const element = make('div', '', { class: 'png-import' });
  file.hidden = true;
  element.append(choose, ' ', again, ' ', alternates, file, status);
  element.hidden = true;
  let shown: { readonly picture: UsedPicture; readonly course: string } | null = null;

  /** Import `bytes` to `picture`: registered, sized, colored and written as one edit. */
  const importPng = async (
    picture: UsedPicture,
    course: string,
    bytes: Uint8Array<ArrayBuffer>,
    label: string,
    keepPalettes = false,
  ) => {
    try {
      const first = picture.kind === 'original';
      const name = first ? `product-${picture.name}` : picture.source!;
      const recipePath = `${SPRITE_SOURCES_DIRECTORY}/${name}.json`;
      if (!first && !picture.source) throw new RangeError('It has no original');
      // An original whose product picture is there already (the course still naming the original) imports to that one,
      // registered to its picture 3: that product master's frame, so the size K gave it stays. The registration, the
      // reduction, the encoding and the colors are worked out off the page's thread.
      const exists = context.paths().includes(recipePath);
      const current = exists
        ? await context.readFile(recipePath).then((read) => ({
            recipe: readSpriteRecipe(JSON.parse(new TextDecoder().decode(read.bytes))),
            revision: read.revision,
          }))
        : { recipe: null, revision: context.revision(recipePath) };
      const originals = current.recipe ? (current.recipe.basedOn ?? []).map((piece) => piece.image) : [picture.name];
      if (!originals.length) throw new RangeError('It has no original');
      const registered = await importInWorker.register({
        png: bytes,
        name,
        original: picture.name,
        mirrored: picture.mirrored,
        recipe: current.recipe,
        image: current.recipe ? await context.store.read(imagePathIn(context.paths(), name)) : null,
        originals: await originalFiles(context, originals),
        keepPalettes,
      });
      const { png } = registered;
      const key = `${name} ${await contentDigest(png)}`;
      const recipe = registered.recipe;
      await controls.write(
        {
          target: { picture, course, source: null },
          name,
          recipe,
          revision: current.revision,
          image: registered.image,
          key,
          png,
          made: null,
          first,
        },
        label,
      );
      const { iou, edges } = registered;
      status.textContent =
        `${label}: outline IoU ${iou.toFixed(3)} with picture 3 (edges left ${edges.left}, right ${edges.right}, ` +
        `bottom ${edges.bottom} texels); saved at ${registered.image.width} × ${registered.image.height}.` +
        (iou < REGISTRATION_IOU_LIMIT ? ' The outline differs: check it against picture 3.' : '') +
        (sourceLowResolution(recipe) ? ' The PNG holds fewer than two pixels across each texel.' : '');
    } catch (error) {
      status.textContent = `${label}: ${error instanceof Error ? error.message : error}`;
    }
  };

  choose.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (chosen && shown)
      await importPng(shown.picture, shown.course, new Uint8Array(await chosen.arrayBuffer()), `Import ${chosen.name}`);
  });
  again.addEventListener('click', async () => {
    if (!shown?.picture.source) return;
    const bytes = await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${shown.picture.source}.png`);
    await importPng(shown.picture, shown.course, bytes, 'Register again', true);
  });
  alternates.addEventListener('click', async () => {
    const reading = controls.reading();
    const made = reading?.target.source?.made;
    if (!reading || !made || !shown) return;
    const palettes = await importInWorker
      .palettes({
        master: made.master,
        recipe: reading.recipe,
        originals: await originalFiles(
          context,
          (reading.recipe.basedOn ?? []).map((piece) => piece.image),
        ),
      })
      .catch((error: Error) => void (status.textContent = `Make alternate palettes: ${error.message}`));
    if (!palettes) return;
    controls.change((recipe) => ({ ...recipe, palettes }), 'Make alternate palettes');
    status.textContent = `Made palettes ${Object.keys(palettes).join(', ')} from the default.`;
  });

  return {
    element,
    /** Offer the import of `picture`, an original or product picture, or of none. */
    show(picture: UsedPicture | null, course: string | null) {
      shown = picture && course && picture.kind !== 'general' ? { picture, course } : null;
      element.hidden = !shown;
      again.disabled = alternates.disabled = shown?.picture.kind !== 'product';
    },
    /**
     * Take dropped files: each PNG to `onto` when given, else to the course's picture whose original its name starts
     * with (the longest such name); the rest are said and left.
     */
    async drop(
      files: readonly File[],
      pictures: readonly UsedPicture[],
      course: string | null,
      onto: UsedPicture | null,
    ) {
      if (!course) return;
      const left: string[] = [];
      for (const dropped of files) {
        const name = dropped.name.replace(/\.png$/i, '');
        const target =
          onto ??
          pictures
            .filter((picture) => picture.original && name.replace(/^product-/, '').startsWith(picture.original))
            .sort((a, b) => b.original!.length - a.original!.length)[0];
        if (!/\.png$/i.test(dropped.name) || /-(input|guide)$/.test(name) || !target || target.kind === 'general') {
          left.push(dropped.name);
          continue;
        }
        await importPng(target, course, new Uint8Array(await dropped.arrayBuffer()), `Import ${dropped.name}`);
      }
      if (left.length) status.textContent = `${status.textContent ?? ''} Not taken: ${left.join(', ')}.`.trim();
    },
  };
}
