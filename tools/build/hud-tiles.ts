import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { admit } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import {
  compileTextTiles,
  HUD_PICTURE_TILES,
  TEXT_TILE_SIZE,
  type TextTilesDocument,
} from '../../src/image/text-tiles.js';
import { replaceDocument } from '../authoring/content-store.js';
import { createNodeContentStore } from './node-content-store.js';
import { reportError, requireInput } from '../course/authoring-io.js';
import { drawHudParts } from '../graphics/hud-parts.js';
import { drawHudPictures, withHudTiles } from '../graphics/hud-pictures.js';
import { readNormalFont, readOrnateFonts, readSegmentDigits } from '../graphics/hud-design-sources.js';
import { drawOrnateFonts } from '../graphics/hud-fonts.js';

/**
 * The HUD tiles command: read the fonts from their design sources (`content/hud-design-sources/`), draw the HUD
 * part tiles and every HUD picture from its source and recipe (`content/hud-picture-sources/`) and write them into the
 * text tiles, `content/text-tiles/default.json`, with a check
 * sheet of each picture, `dist/hud-pictures/<name>.png`: its frames in order over a grey ground, which nothing reads.
 */
const USAGE = 'Usage: npm run hud-tiles';
const TEXT_TILES = 'text-tiles/default.json';
const store = createNodeContentStore();

try {
  requireInput(process.argv.length === 2, '/arguments', USAGE);
  const drawn = await drawHudPictures(store, PNG);
  const saved = JSON.parse(new TextDecoder().decode(await store.read(TEXT_TILES))) as TextTilesDocument;
  const ornate = drawOrnateFonts(await readOrnateFonts(store)),
    digits = await readSegmentDigits(store);
  const palettes = new Map([
    ...ornate.palettes,
    ['SEG_VFD', digits.palettes.VFD],
    ['SEG_YELLOW', digits.palettes.YELLOW],
    ['SEG_RED', digits.palettes.RED],
  ]);
  const document = withHudTiles(
    saved,
    { fonts: [...(await readNormalFont(store)), ...ornate.patterns], parts: drawHudParts(digits), palettes },
    drawn,
  );
  requireLoaded(admit(`content/${TEXT_TILES}`, () => compileTextTiles(document)));
  await replaceDocument(store, TEXT_TILES, document);

  const directory = new URL('../../dist/hud-pictures/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const size = HUD_PICTURE_TILES * TEXT_TILE_SIZE,
    sheets: string[] = [];
  for (const [picture, { frames, palette }] of drawn) {
    const columns = picture.turn === 'full' ? 8 : 11,
      rows = Math.ceil(frames.length / columns);
    const colors = palette.map((color) => unpackRgba(rgb555ToRgba(color)));
    const sheet = new PNG({ width: columns * size, height: rows * size });
    for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([96, 96, 100, 255], i);
    frames.forEach((frame, index) => {
      const x0 = (index % columns) * size,
        y0 = Math.floor(index / columns) * size;
      frame.forEach((slot, i) => {
        if (!slot) return;
        const { r, g, b } = colors[slot - 1]!;
        sheet.data.set([r, g, b, 255], ((y0 + Math.floor(i / size)) * sheet.width + x0 + (i % size)) * 4);
      });
    });
    await writeFile(new URL(`${picture.name}.png`, directory), PNG.sync.write(sheet));
    sheets.push(`dist/hud-pictures/${picture.name}.png`);
  }
  console.log(JSON.stringify({ ok: true, textTiles: `content/${TEXT_TILES}`, sheets }));
} catch (error) {
  reportError(
    error instanceof RangeError
      ? { diagnostics: [{ kind: 'tool', code: 'invalid_input', path: '/arguments', message: error.message }] }
      : error,
  );
}
