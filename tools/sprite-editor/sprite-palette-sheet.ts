import { slotWords, paintSlots } from './slot-pixels.js';
import { make } from '../browser-shared/dom.js';
import { SPRITE_DITHERS } from '../graphics/sprite-colors.js';
import type { OpenSource } from './sprite-comparison.js';
import type { MasterBytes } from './sprite-import-bytes.js';
import type { SpriteImporter } from './sprite-importer.js';

/** The longer side of a sheet's picture, in screen pixels at most. */
const SIZE = 160;

/**
 * A product picture's palettes and dithers side by side: its master in each named palette, and, once the Dithers section
 * is open, the open source imported with each dither (`none`, `ordered`, `diffusion`) in its default palette, the
 * recipe's own dither marked. Nothing is imported for the dithers while the section is closed.
 */
export function createPaletteSheet(importInWorker: SpriteImporter) {
  const palettes = make('div', '', { class: 'sheet-row' });
  const dithers = make('div', '', { class: 'sheet-row' });
  const ditherSection = make('details');
  ditherSection.append(make('summary', 'Dithers'), dithers);
  const element = make('div', '', { class: 'palette-sheet' });
  element.append(make('h2', 'Palettes'), palettes, ditherSection);
  element.hidden = true;
  // The source shown, the one whose dithers are shown or being made, and each drawing of the dithers numbered: a drawing
  // overtaken by a later one (another source, or the same one shown again) stops.
  let shown: OpenSource | null = null,
    dithered: OpenSource | null = null,
    drawings = 0;
  const showDithers = async () => {
    const source = shown;
    if (!source || !ditherSection.open || dithered === source) return;
    dithered = source;
    const drawing = ++drawings;
    dithers.replaceChildren();
    for (const dither of SPRITE_DITHERS) {
      const recipe = { ...source.recipe, dither };
      const made = await importInWorker(source.key, source.image, recipe, source.name).catch(() => null);
      if (drawing !== drawings) return;
      const chosen = (source.recipe.dither ?? 'none') === dither;
      if (made)
        dithers.append(
          figure(
            made.master,
            made.master.palettes[made.master.defaultPalette]!.colors,
            chosen ? `${dither} (the recipe's)` : dither,
          ),
        );
    }
  };
  ditherSection.addEventListener('toggle', () => void showDithers());
  return {
    element,
    async show(source: OpenSource | null) {
      const master = source?.made?.master;
      shown = source && master ? source : null;
      element.hidden = !shown;
      if (!source || !master) return;
      palettes.replaceChildren(
        ...Object.entries(master.palettes).map(([name, { colors }]) => figure(master, colors, name)),
      );
      // The dithers shown are another source's until they are made again, while the section is open.
      dithered = null;
      drawings++;
      dithers.replaceChildren();
      await showDithers();
    },
  };
}

/** A master's level 0 in `colors`, fitted into the sheet's size by whole or fractional texels, with its caption. */
function figure(master: MasterBytes, colors: readonly number[], caption: string): HTMLElement {
  const { width, height } = master;
  const data = new ImageData(width, height);
  paintSlots(data, { width, height, indices: master.levels[0]!.indices }, slotWords(colors));
  const scratch = new OffscreenCanvas(width, height);
  scratch.getContext('2d')!.putImageData(data, 0, 0);
  const scale = Math.min(SIZE / width, SIZE / height);
  const zoom = scale >= 1 ? Math.floor(scale) : scale;
  const canvas = make('canvas', '', {
    width: String(Math.ceil(width * zoom)),
    height: String(Math.ceil(height * zoom)),
  });
  const graphics = canvas.getContext('2d')!;
  graphics.imageSmoothingEnabled = zoom < 1;
  graphics.drawImage(scratch, 0, 0, canvas.width, canvas.height);
  const box = make('figure');
  box.append(canvas, make('div', caption, { class: 'hint' }));
  return box;
}
