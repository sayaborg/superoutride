import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { readZip, type ZipFile } from '../road-data/shared/zip.js';
import { RomSet } from '../road-data/shared/rom-set.js';
import {
  assembleEnduroRacerPrograms,
  assembleEnduroRacerSprites,
  ENDURO_RACER_ROMS,
} from '../road-data/enduro-racer/enduro-racer-rom.js';
import { readSpritePalette, sizeSetPixels } from '../road-data/enduro-racer/enduro-racer-sprites.js';

/** Zips K dropped: each file's name and bytes, which the worker keeps with those dropped before. */
export interface RomZipsRequest {
  readonly id: number;
  readonly kind: 'zips';
  readonly zips: readonly { readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> }[];
}

/**
 * The ROM's own pixels of the size set at `address` (ENDURO RACER's picture names, `enduror-<address>`) in palette
 * `palette`, reflected across when `mirrored`.
 */
export interface RomExtractRequest {
  readonly id: number;
  readonly kind: 'extract';
  readonly address: number;
  readonly palette: number;
  readonly mirrored: boolean;
}

/** The zips kept, and whether they make the original's ROM set (or what is missing, in the set's words). */
export interface RomZipsAnswer {
  readonly id: number;
  readonly zips: readonly string[];
  readonly ready: boolean;
  readonly missing: string | null;
}

/** An extract's pixels as straight-alpha RGBA, `width` by `height`. */
export interface RomExtractAnswer {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * The sprite editor's ROM extracts off the page's thread, from the zips K drops (MAME's `enduror` and `endurobl`):
 * read by road data's own ROM reading (`readZip`, `RomSet`, `assembleEnduroRacerPrograms`,
 * `assembleEnduroRacerSprites`, `sizeSetPixels`, `readSpritePalette`), kept in this worker alone and gone with the page.
 */
const zips = new Map<string, ReadonlyMap<string, ZipFile>>();
let rom: { readonly main: Uint8Array; readonly words: Uint32Array } | null = null;

const fail = (id: number, error: unknown) =>
  self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });

self.addEventListener('message', async ({ data }: MessageEvent<RomZipsRequest | RomExtractRequest>) => {
  if (data.kind === 'zips') {
    try {
      for (const { name, bytes } of data.zips) zips.set(name, await readZip(bytes, name));
    } catch (error) {
      return fail(data.id, error);
    }
    // The set is the dropped zips together, as the road data tool reads ENDURO RACER's two sets.
    let missing: string | null = null;
    try {
      const set = new RomSet(ENDURO_RACER_ROMS.sets.join(' and '), [...zips.values()]);
      rom = { main: assembleEnduroRacerPrograms(set).main, words: assembleEnduroRacerSprites(set) };
    } catch (error) {
      rom = null;
      missing = error instanceof Error ? error.message : String(error);
    }
    const answer: RomZipsAnswer = { id: data.id, zips: [...zips.keys()].sort(), ready: !!rom, missing };
    return self.postMessage(answer);
  }
  if (!rom) return fail(data.id, 'No ROM set is read');
  try {
    const { width, height, pixels } = sizeSetPixels(rom.main, rom.words, data.address);
    const colors = readSpritePalette(rom.main, data.palette).rgb555;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        // Pens 0 and 15 are transparent; every other pen, pen 10 included, in the palette's color.
        const pen = pixels[y * width + (data.mirrored ? width - 1 - x : x)]!;
        if (pen === 0 || pen === 15) continue;
        const { r, g, b } = unpackRgba(rgb555ToRgba(colors[pen]!));
        rgba.set([r, g, b, 255], (y * width + x) * 4);
      }
    const answer: RomExtractAnswer = { id: data.id, width, height, rgba };
    self.postMessage(answer, { transfer: [rgba.buffer] });
  } catch (error) {
    fail(data.id, error);
  }
});
