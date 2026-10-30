import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { createNodeContentStore } from './node-content-store.js';
import { reportError } from '../course/authoring-io.js';
import { requireInput } from '../authoring/authoring-error.js';
import { generateVehicleSpriteSet } from '../graphics/vehicle-picture-sources.js';

/**
 * The pictures command: generate one vehicle sprite set from its four views and recipe
 * (`content/vehicle-picture-sources/`) and write it as `content/sprites/<set>.json`. What it writes is as generated; a
 * saved set may be a finished one, so the command replaces a saved set only when told to. It also writes a check sheet of
 * every full-size picture over its shadow, `dist/pictures/<set>.png`, which nothing reads.
 */
const USAGE = 'Usage: npm run pictures -- <set> [replace]';
const store = createNodeContentStore();

const [set, ...args] = process.argv.slice(2);
try {
  requireInput(set && (!args.length || (args.length === 1 && args[0] === 'replace')), '/arguments', USAGE);
  requireInput(
    args.length || !(await store.list('sprites')).includes(`${set}.json`),
    '/arguments',
    `content/sprites/${set}.json is saved and may be a finished set: add "replace" to write the generated set over it`,
  );
  const { document, path, bytes } = await generateVehicleSpriteSet(store, set, PNG, (done, of) =>
    process.stderr.write(`\r${set}: ${done}/${of} directions`),
  );
  process.stderr.write('\n');
  await store.write(path, bytes);

  // The check sheet: eight directions a row, each cell holding the largest full-size picture and its shadow.
  const palette = [0, ...Object.values(document.palettes)[0]!, document.brakeLamp.off].map((color) =>
    unpackRgba(rgb555ToRgba(color)),
  );
  const first = document.pictures.map((picture) => picture.sizes[0]!);
  const extent = (of: (frame: { width: number; height: number; anchorX: number; anchorY: number }) => number) =>
    Math.ceil(Math.max(...first.flatMap((size) => [of(size), of(size.shadow)]))) + 1;
  const left = extent((frame) => frame.anchorX),
    right = extent((frame) => frame.width - frame.anchorX),
    up = extent((frame) => frame.anchorY),
    down = extent((frame) => frame.height - frame.anchorY);
  const cellWidth = left + right,
    cellHeight = up + down,
    columns = 8,
    rows = Math.ceil(first.length / columns);
  const sheet = new PNG({ width: columns * cellWidth, height: rows * cellHeight });
  for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([96, 96, 100, 255], i);
  first.forEach((size, index) => {
    const originX = (index % columns) * cellWidth + left,
      originY = Math.floor(index / columns) * cellHeight + up;
    const put = (frame: typeof size.shadow, paint: (digit: number, at: number) => void) => {
      const x0 = originX - Math.round(frame.anchorX + 0.5),
        y0 = originY - Math.round(frame.anchorY + 0.5);
      frame.rows.forEach((row, y) =>
        Array.from(row, (digit, x) => {
          const value = parseInt(digit, 16);
          if (value) paint(value, ((y0 + y) * sheet.width + x0 + x) * 4);
        }),
      );
    };
    put(size.shadow, (_, at) => sheet.data.set([48, 48, 50, 255], at));
    put(size, (slot, at) => sheet.data.set([palette[slot]!.r, palette[slot]!.g, palette[slot]!.b, 255], at));
  });
  const sheetFile = new URL(`../../dist/pictures/${set}.png`, import.meta.url);
  await mkdir(new URL('./', sheetFile), { recursive: true });
  await writeFile(sheetFile, PNG.sync.write(sheet));
  console.log(
    JSON.stringify({ ok: true, set: `content/${path}`, bytes: bytes.length, sheet: `dist/pictures/${set}.png` }),
  );
} catch (error) {
  // A source's or the PNG decoder's refusal is the caller's input error.
  reportError(
    error instanceof RangeError
      ? { diagnostics: [{ kind: 'tool', code: 'invalid_input', path: '/arguments', message: error.message }] }
      : error,
  );
}
