import { TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import { halveRgb555 } from '../image/rgb555.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';
import { createMenu, SCREEN_BACKGROUND, writeCentred, writeChoice, type MenuDefinition } from './menu.js';

/** A line of a picture menu: its text row, text and palette. */
export interface PictureMenuLine {
  readonly row: number;
  readonly text: string;
  readonly palette: number;
}

/** Where a picture menu draws: its picture, its darkened band of text rows, its choice's row and its lines. */
export interface PictureMenuLayout {
  /** The picture filling the frame; null draws the plain background. */
  readonly picture: TilePicture | null;
  /** The first and last text rows drawn at half brightness behind the text. */
  readonly band: readonly [first: number, last: number];
  /** The row of the current item, YELLOW (DARK when it offers nothing) with WHITE `<` and `>`. */
  readonly choiceRow: number;
  /** The lines shown with the item at `index`. */
  lines(index: number): readonly PictureMenuLine[];
}

/** Halve the frame's pixels on text rows `first` through `last`. */
export function halveTextRows(frame: SoftwareSurface, first: number, last: number) {
  for (let i = first * TEXT_TILE_SIZE * frame.width; i < (last + 1) * TEXT_TILE_SIZE * frame.width; i++)
    frame.pixels[i] = halveRgb555(frame.pixels[i]!);
}

/**
 * A carousel menu drawn over a picture without a title: SELECT CLASS and SELECT MUSIC. The picture fills the frame, a
 * band of text rows behind the text is at half brightness, the current item stands on its row between its arrows and
 * the item's lines follow. Commands are the carousel's ([menu part](./menu.ts)).
 */
export function createPictureMenuScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  definition: MenuDefinition,
  layout: PictureMenuLayout,
  initial = 0,
): Screen {
  const menu = createMenu(definition, initial);
  return {
    live: false,
    tick() {},
    command: (command) => menu.command(command),
    leave: () => menu.leave(),
    render() {
      if (layout.picture) layout.picture.draw(frame, 0, 0);
      else frame.clear(SCREEN_BACKGROUND);
      halveTextRows(frame, ...layout.band);
      text.clear();
      const items = definition.items(),
        item = items[menu.index];
      if (item) {
        const palette = item.disabled ? TEXT_PALETTES.DARK : TEXT_PALETTES.YELLOW;
        writeChoice(text, layout.choiceRow, item.label, palette, items.length > 1);
        for (const line of layout.lines(menu.index)) writeCentred(text, line.row, line.text, line.palette);
      }
      text.draw(frame);
      present();
    },
  };
}
