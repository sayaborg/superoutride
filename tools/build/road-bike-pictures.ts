import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { requireInput, reportError } from '../course/authoring-io.js';
import { createNodeContentStore } from './node-content-store.js';
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
  ROAD_BIKE_BANK_DEGREES,
  ROAD_BIKE_PICTURES,
  roadBikePictureStyle,
  roadBikeSolids,
  type RoadBikeId,
} from '../graphics/road-bike-shapes.js';

/** Road-bike content only: the shared solid/baker/camera own rendering; no existing racing set is rewritten. */
try {
  const [requested, replace, ...extra] = process.argv.slice(2);
  requireInput(
    requested &&
      (replace === undefined || replace === 'replace') &&
      !extra.length &&
      (requested === 'all' || Object.hasOwn(ROAD_BIKE_PICTURES, requested)),
    '/arguments',
    'Usage: npm run road-bike-pictures -- <vehicle ID|all> [replace]',
  );
  const ids = requested === 'all' ? (Object.keys(ROAD_BIKE_PICTURES) as RoadBikeId[]) : [requested as RoadBikeId];
  const saved = await createNodeContentStore().list('sprites');
  const directory = new URL('../../dist/road-bike-pictures/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const id of ids) {
    const name = ROAD_BIKE_PICTURES[id];
    requireInput(
      replace || !saved.includes(`${name}.json`),
      '/arguments',
      'Add replace to overwrite a saved sprite set',
    );
    const file = new URL(`../../content/vehicles/${id}.json`, import.meta.url),
      bytes = await readFile(file);
    const { source } = requireLoaded(
      compileVehicleMechanicsDocument(JSON.parse(bytes.toString()), id, file.pathname, await contentDigest(bytes)),
    );
    const solids = roadBikeSolids(id, source);
    const document = drawVehicleSpriteSet(
      solids,
      roadBikePictureStyle(id),
      CAMERA_DEFINITION,
      (done) => {
        if (done % 8 === 0) console.log(`${id}: ${done}/64 yaw, ${solids.length} banks`);
      },
      ROAD_BIKE_BANK_DEGREES,
    );
    readVehicleSpriteSet(document, name);
    const output = new URL(`../../content/sprites/${name}.json`, import.meta.url);
    await writeFile(
      output,
      formatSavedJson({ format: VEHICLE_SPRITE_SET_FORMAT, version: VEHICLE_SPRITE_SET_VERSION, ...document }),
      { flag: replace ? 'w' : 'wx' },
    );
    await mkdir(directory, { recursive: true });
    const counts: { lod: number; transparent: number; lampPictures: number }[] = [];
    for (let lod = 0; lod < 6; lod++) {
      const frames = solids.flatMap((_, bank) =>
        document.assets.map((row) => document.pictures[row[bank]!]!.sizes[lod]!),
      );
      const { width, height, data } = vehiclePictureSheet(frames, [
        0,
        ...document.palettes.stock!,
        document.brakeLamp.off,
      ]);
      const png = new PNG({ width, height });
      png.data.set(data);
      await writeFile(new URL(`${name}-lod${lod}.png`, directory), PNG.sync.write(png));
      counts.push({
        lod,
        transparent: frames.filter((f) => f.rows.every((r) => !/[1-9a-f]/.test(r))).length,
        lampPictures: frames.filter((f) => f.rows.some((r) => r.includes('f'))).length,
      });
    }
    // Eight sampled directions, neutral bank, four colors and both brake states, preserving native pixel scale.
    const frames = document.assets
      .filter((_, yaw) => yaw % 8 === 0)
      .map((row) => document.pictures[row[(document.bankVariants - 1) / 2]!]!.sizes[0]!);
    for (const [palette, colors] of Object.entries(document.palettes))
      for (const braking of [false, true]) {
        const { width, height, data } = vehiclePictureSheet(frames, [
          0,
          ...colors,
          braking ? document.brakeLamp.on : document.brakeLamp.off,
        ]);
        const png = new PNG({ width, height });
        png.data.set(data);
        await writeFile(
          new URL(`${name}-${palette}-${braking ? 'brake' : 'tail'}.png`, directory),
          PNG.sync.write(png),
        );
      }
    await writeFile(new URL(`${name}-review.json`, directory), `${JSON.stringify({ id, counts }, null, 2)}\n`);
    console.log(JSON.stringify({ id, saved: output.pathname, counts }));
  }
  const available = await createNodeContentStore().list('sprites');
  if (Object.values(ROAD_BIKE_PICTURES).every((name) => available.includes(`${name}.json`))) {
    const overview = [],
      banks = [],
      colorsAndLamps = [],
      reviews = [];
    for (const [id, name] of Object.entries(ROAD_BIKE_PICTURES)) {
      const bytes = await readFile(new URL(`../../content/sprites/${name}.json`, import.meta.url));
      const { library } = assembleVehicleSpriteLibrary(
        [{ name, document: `sprites/${name}.json`, value: JSON.parse(bytes.toString()) }],
        directory.pathname,
      );
      const document = library.sets[name]!;
      const sampled = document.assets.filter((_, yaw) => yaw % 8 === 0);
      const neutral = sampled.map((row) => document.pictures[row[(document.bankVariants - 1) / 2]!]!.sizes[0]!);
      const stock = [0, ...document.palettes.stock!, document.brakeLamp.off];
      overview.push(vehiclePictureSheet(neutral, stock));
      banks.push(
        vehiclePictureSheet(
          Array.from({ length: document.bankVariants }, (_, bank) =>
            sampled.map((row) => document.pictures[row[bank]!]!.sizes[0]!),
          ).flat(),
          stock,
        ),
      );
      for (const colors of Object.values(document.palettes))
        for (const braking of [false, true])
          colorsAndLamps.push(
            vehiclePictureSheet(neutral, [0, ...colors, braking ? document.brakeLamp.on : document.brakeLamp.off]),
          );
      reviews.push({
        id,
        sprite: name,
        sha256: await contentDigest(bytes),
        yawVariants: document.yawVariants,
        bankVariants: document.bankVariants,
        bankDegrees: document.bankDegrees,
        counts: Array.from({ length: 6 }, (_, lod) => ({
          lod,
          transparent: document.pictures.filter((p) => p.sizes[lod]!.rows.every((r) => !/[1-9a-f]/.test(r))).length,
          lampPictures: document.pictures.filter((p) => p.sizes[lod]!.rows.some((r) => r.includes('f'))).length,
        })),
      });
    }
    for (const [name, sheets] of [
      ['overview', overview],
      ['banks', banks],
      ['palettes-and-lamps', colorsAndLamps],
    ] as const) {
      const width = Math.max(...sheets.map((s) => s.width)),
        height = sheets.reduce((sum, s) => sum + s.height, 0);
      const png = new PNG({ width, height });
      for (let i = 0; i < png.data.length; i += 4) png.data.set([96, 104, 104, 255], i);
      let offsetY = 0;
      for (const sheet of sheets) {
        for (let y = 0; y < sheet.height; y++)
          png.data.set(sheet.data.subarray(y * sheet.width * 4, (y + 1) * sheet.width * 4), (offsetY + y) * width * 4);
        offsetY += sheet.height;
      }
      await writeFile(new URL(`${name}.png`, directory), PNG.sync.write(png));
    }
    await writeFile(new URL('review.json', directory), `${JSON.stringify(reviews, null, 2)}\n`);
  }
} catch (error) {
  reportError(error);
}
