import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { make } from '../browser-shared/dom.js';
import { SPRITE_DITHERS } from '../graphics/sprite-colors.js';
import type { OpenSource } from './sprite-comparison.js';
import type { SpriteImporter } from './sprite-importer.js';

/** The longer side of a sheet's picture, in screen pixels at most. */
const SIZE = 160;

/**
 * A product picture's palettes and dithers side by side: its master in each named palette, and the open source imported
 * with each dither (`none`, `ordered`, `diffusion`) in its default palette, the recipe's own dither marked.
 */
export function createPaletteSheet(importInWorker: SpriteImporter) {
  const palettes = make('div', '', { class: 'sheet-row' });
  const dithers = make('div', '', { class: 'sheet-row' });
  const element = make('div', '', { class: 'palette-sheet' });
  element.append(make('h2', 'Palettes'), palettes, make('h2', 'Dithers'), dithers);
  element.hidden = true;
  let shown = 0;
  return {
    element,
    async show(source: OpenSource | null) {
      const showing = ++shown;
      const master = source?.made?.master;
      element.hidden = !source || !master;
      if (!source || !master) return;
      palettes.replaceChildren(
        ...Object.entries(master.palettes).map(([name, { colors }]) => figure(master, colors, name)),
      );
      dithers.replaceChildren();
      for (const dither of SPRITE_DITHERS) {
        const recipe = { ...source.recipe, dither };
        const made = await importInWorker(source.key, source.image, recipe, source.name).catch(() => null);
        if (showing !== shown) return;
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
    },
  };
}

/** A master's level 0 in `colors`, fitted into the sheet's size by whole or fractional texels, with its caption. */
function figure(master: SpriteLodDocument, colors: readonly number[], caption: string): HTMLElement {
  const { width, height } = master;
  const indices = master.levels[0]!.indices;
  const data = new ImageData(width, height);
  indices.forEach((slot, i) => {
    if (!slot) return;
    const { r, g, b } = unpackRgba(rgb555ToRgba(colors[slot]!));
    data.data.set([r, g, b, 255], i * 4);
  });
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
