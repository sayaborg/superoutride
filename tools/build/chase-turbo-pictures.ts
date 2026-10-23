import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { compileTextTiles, TEXT_PALETTES } from '../../src/image/text-tiles.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { requireInput, reportError } from '../course/authoring-io.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { readVehicleSpriteSet } from '../../src/vehicle/vehicle-sprite-library.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { drawVehicleSpriteSet } from '../graphics/vehicle-pictures.js';
import { vehiclePictureSheet } from '../graphics/vehicle-picture-sheet.js';
import {
  assembleVehicleSpriteLibrary,
  VEHICLE_SPRITE_SET_FORMAT,
  VEHICLE_SPRITE_SET_VERSION,
} from '../graphics/vehicle-sprite-sets.js';
import {
  CHASE_TURBO_PICTURES,
  chaseTurboPictureStyle,
  chaseTurboSolids,
  type ChaseTurboId,
} from '../graphics/chase-turbo-shapes.js';

const directory = new URL('../../dist/chase-turbo-pictures/', import.meta.url);
type Sheet = ReturnType<typeof vehiclePictureSheet>;
async function save(name: string, sheets: readonly Sheet[]) {
  const width = Math.max(...sheets.map((s) => s.width)),
    height = sheets.reduce((sum, s) => sum + s.height, 0);
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([96, 104, 104, 255], i);
  let offset = 0;
  for (const sheet of sheets) {
    for (let y = 0; y < sheet.height; y++)
      png.data.set(sheet.data.subarray(y * sheet.width * 4, (y + 1) * sheet.width * 4), (offset + y) * width * 4);
    offset += sheet.height;
  }
  await writeFile(new URL(`${name}.png`, directory), PNG.sync.write(png));
}
try {
  const [requested, replace, ...extra] = process.argv.slice(2);
  requireInput(
    requested &&
      (requested === 'all' || requested === 'review' || Object.hasOwn(CHASE_TURBO_PICTURES, requested)) &&
      (replace === undefined || replace === 'replace') &&
      !extra.length,
    '/arguments',
    'Usage: npm run chase-turbo-pictures -- <vehicle ID|all|review> [replace]',
  );
  await mkdir(directory, { recursive: true });
  const tiles = compileTextTiles(
    JSON.parse(await readFile(new URL('../../content/text-tiles/default.json', import.meta.url), 'utf8')),
  );
  const label = (sheet: Sheet, text: string): Sheet => {
    const height = sheet.height + 24,
      data = new Uint8Array(sheet.width * height * 4),
      glyphs = tiles.encode(text.replaceAll('_', ' '));
    const pixels = new Uint16Array(sheet.width * 8);
    glyphs.forEach((glyph, index) => tiles.paint(pixels, index * 8, sheet.width, glyph, TEXT_PALETTES.WHITE));
    for (let i = 0; i < sheet.width * 24; i++) data.set([32, 38, 42, 255], i * 4);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < glyphs.length * 8; x++)
        if (pixels[y * sheet.width + x]) {
          const c = unpackRgba(rgb555ToRgba(pixels[y * sheet.width + x]!));
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
              data.set([c.r, c.g, c.b, 255], ((4 + y * 2 + dy) * sheet.width + 8 + x * 2 + dx) * 4);
        }
    data.set(sheet.data, sheet.width * 24 * 4);
    return { width: sheet.width, height, data };
  };

  const ids =
    requested === 'all' || requested === 'review'
      ? (Object.keys(CHASE_TURBO_PICTURES) as ChaseTurboId[])
      : [requested as ChaseTurboId];
  const overview: Sheet[] = [],
    review = [];
  for (const id of ids) {
    const name = CHASE_TURBO_PICTURES[id],
      spriteFile = new URL(`../../content/sprites/${name}.json`, import.meta.url);
    let document, output;
    if (requested === 'review') {
      output = await readFile(spriteFile, 'utf8');
      document = assembleVehicleSpriteLibrary(
        [{ name, document: spriteFile.pathname, value: JSON.parse(output) }],
        directory.pathname,
      ).library.sets[name]!;
    } else {
      const file = new URL(`../../content/vehicles/${id}.json`, import.meta.url),
        bytes = await readFile(file);
      const { source } = requireLoaded(
        compileVehicleMechanicsDocument(JSON.parse(bytes.toString()), id, file.pathname, await contentDigest(bytes)),
      );
      document = drawVehicleSpriteSet(chaseTurboSolids(id, source), chaseTurboPictureStyle(id), CAMERA_DEFINITION);
      readVehicleSpriteSet(document, name);
      output = formatSavedJson({ format: VEHICLE_SPRITE_SET_FORMAT, version: VEHICLE_SPRITE_SET_VERSION, ...document });
      await writeFile(spriteFile, output, { flag: replace ? 'w' : 'wx' });
    }
    const stock = [0, ...document.palettes.stock!, document.brakeLamp.off];
    const frames = document.assets
      .filter((_, yaw) => yaw % 8 === 0)
      .map((row) => document.pictures[row[0]!]!.sizes[0]!);
    const sheet = label(vehiclePictureSheet(frames, stock), id);
    overview.push(sheet);
    await save(name, [sheet]);
    const lods = [];
    for (let lod = 0; lod < 6; lod++) {
      const sizes = document.pictures.map((p) => p.sizes[lod]!);
      await save(`${name}-lod${lod}`, [vehiclePictureSheet(sizes, stock)]);
      lods.push({
        lod,
        transparent: sizes.filter((p) => p.rows.every((r) => !/[1-9a-f]/.test(r))).length,
        lampPictures: sizes.filter((p) => p.rows.some((r) => r.includes('f'))).length,
      });
    }
    await save(
      `${name}-palettes-and-lamps`,
      Object.values(document.palettes).flatMap((colors) =>
        [false, true].map((braking) =>
          vehiclePictureSheet(frames, [0, ...colors, braking ? document.brakeLamp.on : document.brakeLamp.off]),
        ),
      ),
    );
    review.push({
      id,
      sprite: name,
      sha256: await contentDigest(new TextEncoder().encode(output)),
      yawVariants: document.yawVariants,
      bankVariants: document.bankVariants,
      lods,
    });
    console.log(JSON.stringify(review.at(-1)));
  }
  if (requested === 'all' || requested === 'review') {
    await save('overview', overview);
    await save('chase-hq', overview.slice(0, 7));
    await save('turbo-outrun', overview.slice(7));
  }
  await writeFile(
    new URL(requested === 'all' || requested === 'review' ? 'review.json' : `${requested}-review.json`, directory),
    JSON.stringify(review, null, 2) + '\n',
  );
} catch (error) {
  reportError(error);
}
