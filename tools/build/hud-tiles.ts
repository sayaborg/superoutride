import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { createNodeContentStore } from './node-content-store.js';
import { reportError, requireInput } from '../course/authoring-io.js';
import { drawHudPictures } from '../graphics/hud-pictures.js';

/**
 * The HUD tiles command: draw every HUD picture from its source and recipe (`content/hud-picture-sources/`) and
 * write a check sheet of each, `dist/hud-pictures/<name>.png`, its frames in order over a grey ground, which nothing
 * reads.
 */
const USAGE = 'Usage: npm run hud-tiles';
const store = createNodeContentStore();

try {
  requireInput(process.argv.length === 2, '/arguments', USAGE);
  const { recipes, drawn } = await drawHudPictures(store, PNG);
  const directory = new URL('../../dist/hud-pictures/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const sheets: string[] = [];
  for (const [name, { frames, palette }] of drawn) {
    const size = recipes.size,
      columns = frames.length === 33 ? 11 : 8,
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
    await writeFile(new URL(`${name}.png`, directory), PNG.sync.write(sheet));
    sheets.push(`dist/hud-pictures/${name}.png`);
  }
  console.log(JSON.stringify({ ok: true, sheets }));
} catch (error) {
  reportError(
    error instanceof RangeError
      ? { diagnostics: [{ kind: 'tool', code: 'invalid_input', path: '/arguments', message: error.message }] }
      : error,
  );
}
