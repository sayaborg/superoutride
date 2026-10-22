import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { requireInput, reportError } from '../course/authoring-io.js';
import { createNodeContentStore } from './node-content-store.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { readVehicleSpriteSet } from '../../src/vehicle/vehicle-sprite-library.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { drawVehicleSpriteSet } from '../graphics/vehicle-pictures.js';
import { VEHICLE_SPRITE_SET_FORMAT, VEHICLE_SPRITE_SET_VERSION } from '../graphics/vehicle-sprite-sets.js';
import {
  RACING_PICTURES,
  RACING_PICTURE_STYLE,
  racingVehicleSolids,
  type RacingVehicleId,
} from '../graphics/racing-vehicle-shapes.js';

/** Original provisional racing geometry, baked by the ordinary vehicle picture camera; no external model or RNG. */
try {
  const [requested, replace, ...extra] = process.argv.slice(2);
  requireInput(
    requested &&
      (replace === undefined || replace === 'replace') &&
      !extra.length &&
      (requested === 'all' || Object.hasOwn(RACING_PICTURES, requested)),
    '/arguments',
    'Usage: npm run racing-pictures -- <vehicle ID|all> [replace]',
  );
  const ids =
    requested === 'all' ? (Object.keys(RACING_PICTURES) as RacingVehicleId[]) : [requested as RacingVehicleId];
  const saved = await createNodeContentStore().list('sprites');
  for (const id of ids) {
    requireInput(
      replace || !saved.includes(`${RACING_PICTURES[id]}.json`),
      '/arguments',
      'Add replace to overwrite a saved sprite set',
    );
    const file = new URL(`../../content/vehicles/${id}.json`, import.meta.url);
    const bytes = await readFile(file);
    const { source } = requireLoaded(
      compileVehicleMechanicsDocument(JSON.parse(bytes.toString()), id, file.pathname, await contentDigest(bytes)),
    );
    const solids = racingVehicleSolids(id, source);
    const document = drawVehicleSpriteSet(
      solids,
      RACING_PICTURE_STYLE,
      CAMERA_DEFINITION,
      (done) => {
        if (done % 8 === 0) console.log(`${id}: ${done}/64 yaw, ${solids.length} banks`);
      },
      solids.length > 1 ? 60 : 0,
    );
    readVehicleSpriteSet(document, RACING_PICTURES[id]);
    const output = new URL(`../../content/sprites/${RACING_PICTURES[id]}.json`, import.meta.url);
    await writeFile(
      output,
      formatSavedJson({ format: VEHICLE_SPRITE_SET_FORMAT, version: VEHICLE_SPRITE_SET_VERSION, ...document }),
      { flag: replace ? 'w' : 'wx' },
    );
    const directory = new URL('../../dist/racing-pictures/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const palette = [0, ...document.palettes.race!, document.brakeLamp.off].map((c) => unpackRgba(rgb555ToRgba(c)));
    // Each sheet: banks in declaration order, then all 64 yaws, eight per row, at their native texel size.
    for (let lod = 0; lod < 6; lod++) {
      const frames = solids.flatMap((_, bank) =>
        document.assets.map((row) => document.pictures[row[bank]!]!.sizes[lod]!),
      );
      const extent = (of: (frame: (typeof frames)[number]) => number) => Math.ceil(Math.max(...frames.map(of))) + 2;
      const left = extent((f) => Math.max(f.anchorX, f.shadow.anchorX)),
        right = extent((f) => Math.max(f.width - f.anchorX, f.shadow.width - f.shadow.anchorX));
      const up = extent((f) => Math.max(f.anchorY, f.shadow.anchorY)),
        down = extent((f) => Math.max(f.height - f.anchorY, f.shadow.height - f.shadow.anchorY));
      const cw = left + right,
        ch = up + down,
        sheet = new PNG({ width: cw * 8, height: (ch * frames.length) / 8 });
      for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([96, 104, 104, 255], i);
      frames.forEach((frame, index) => {
        const ox = (index % 8) * cw + left,
          oy = Math.floor(index / 8) * ch + up;
        for (const [picture, shadow] of [
          [frame.shadow, true],
          [frame, false],
        ] as const) {
          const x0 = ox - Math.round(picture.anchorX + 0.5),
            y0 = oy - Math.round(picture.anchorY + 0.5);
          picture.rows.forEach((row, y) =>
            Array.from(row, (digit, x) => {
              const slot = parseInt(digit, 16);
              if (!slot) return;
              const c = palette[slot]!;
              sheet.data.set(shadow ? [40, 46, 46, 255] : [c.r, c.g, c.b, 255], ((y0 + y) * sheet.width + x0 + x) * 4);
            }),
          );
        }
      });
      await writeFile(new URL(`${RACING_PICTURES[id]}-lod${lod}.png`, directory), PNG.sync.write(sheet));
    }
    console.log(`Saved ${output.pathname}; six complete check sheets under dist/racing-pictures/`);
  }
} catch (error) {
  reportError(error);
}
