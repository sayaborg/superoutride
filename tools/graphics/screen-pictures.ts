import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { unpackRgba } from '../../src/image/rgb555.js';
import {
  compileTilePicture,
  TILE_PICTURE_FORMAT,
  TILE_PICTURE_TILE_SIZE,
  type TilePictureDocument,
} from '../../src/image/tile-picture.js';
import type { ContentStore } from '../authoring/content-store.js';
import { decodeSpritePng } from './sprite-png.js';
import {
  readScreenPictureRecipes,
  SCREEN_PICTURE_RECIPES_FILE,
  SCREEN_PICTURE_SOURCES_DIRECTORY,
  type ScreenPictureRecipe,
} from './screen-picture-recipe.js';

/** A filtered pixel at or above this alpha is opaque; below it is index 0. */
const ALPHA_THRESHOLD = 128;
/** The opaque colors of one tile: its 16-entry palette less the transparent slot 0. */
const TILE_COLORS = 15;

/** A straight-alpha 8-bit RGBA raster, four bytes a pixel. */
interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Float64Array;
}

/** The source pixels each target pixel covers along one axis, with the share of the target pixel each covers. */
function areaWeights(source: number, target: number): readonly (readonly [index: number, weight: number])[][] {
  const scale = source / target;
  return Array.from({ length: target }, (_, i) => {
    const start = i * scale,
      end = (i + 1) * scale,
      weights: [number, number][] = [];
    for (let s = Math.floor(start); s < Math.min(source, Math.ceil(end)); s++) {
      const covered = Math.min(end, s + 1) - Math.max(start, s);
      if (covered > 0) weights.push([s, covered / scale]);
    }
    return weights;
  });
}

/**
 * Scale a straight-alpha source to `width` × `height` by the area filter: each target pixel averages the source area it
 * covers, colors weighted by their alpha so transparent pixels lend no color, and keeps straight alpha.
 */
function scaleByArea(source: { width: number; height: number; pixels: Uint32Array }, width: number, height: number) {
  const columns = areaWeights(source.width, width),
    rows = areaWeights(source.height, height);
  const data = new Float64Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (const [sy, wy] of rows[y]!)
        for (const [sx, wx] of columns[x]!) {
          const pixel = unpackRgba(source.pixels[sy * source.width + sx]!),
            w = wx * wy * pixel.a;
          r += pixel.r * w;
          g += pixel.g * w;
          b += pixel.b * w;
          a += w;
        }
      const i = (y * width + x) * 4;
      data.set(a > 0 ? [r / a, g / a, b / a, a] : [0, 0, 0, 0], i);
    }
  return data;
}

/** Place the source in the picture by the recipe's fit; the picture outside a contained source is transparent. */
function fitSource(source: { width: number; height: number; pixels: Uint32Array }, recipe: ScreenPictureRecipe) {
  const width = recipe.columns * TILE_PICTURE_TILE_SIZE,
    height = recipe.rows * TILE_PICTURE_TILE_SIZE;
  const scale = Math.min(width / source.width, height / source.height);
  const [w, h] =
    recipe.fit === 'fill'
      ? [width, height]
      : [Math.min(width, Math.round(source.width * scale)), Math.min(height, Math.round(source.height * scale))];
  const scaled = scaleByArea(source, w, h);
  const data = new Float64Array(width * height * 4);
  const left = Math.floor((width - w) / 2),
    top = Math.floor((height - h) / 2);
  for (let y = 0; y < h; y++) data.set(scaled.subarray(y * w * 4, (y + 1) * w * 4), ((top + y) * width + left) * 4);
  return { width, height, data } satisfies Raster;
}

type Color = readonly [number, number, number];
const channel5 = (value: number) => Math.round((value * 31) / 255);
const pack = ([r, g, b]: Color) => (r << 10) | (g << 5) | b;

/**
 * At most `limit` colors for `colors` by median cut: the box with the widest channel range splits at the median of
 * that channel, at a value boundary, until there are `limit` boxes or none spans more than one value; each box's color
 * is its colors' rounded mean. Ties take the first box and channel, so the result is deterministic.
 */
function medianCut(colors: readonly Color[], limit: number): Color[] {
  const range = (box: readonly Color[], c: number) => {
    let low = 31,
      high = 0;
    for (const color of box) [low, high] = [Math.min(low, color[c]!), Math.max(high, color[c]!)];
    return high - low;
  };
  const boxes: Color[][] = [[...colors]];
  while (boxes.length < limit) {
    let best = -1,
      bestChannel = 0,
      bestRange = 0;
    boxes.forEach((box, i) => {
      for (let c = 0; c < 3; c++) {
        const r = range(box, c);
        if (r > bestRange) [best, bestChannel, bestRange] = [i, c, r];
      }
    });
    if (best < 0) break;
    const box = boxes[best]!.sort((a, b) => a[bestChannel]! - b[bestChannel]! || pack(a) - pack(b));
    const median = box[box.length >> 1]![bestChannel]!;
    let split = box.findIndex((color) => color[bestChannel]! >= median);
    if (split === 0) split = box.findIndex((color) => color[bestChannel]! > median);
    boxes.splice(best, 1, box.slice(0, split), box.slice(split));
  }
  return boxes.map((box) => {
    const sum = box.reduce((s, color) => [s[0]! + color[0], s[1]! + color[1], s[2]! + color[2]], [0, 0, 0]);
    return [Math.round(sum[0]! / box.length), Math.round(sum[1]! / box.length), Math.round(sum[2]! / box.length)];
  });
}

/**
 * Draw one screen picture from its source: fit and scale it by the area filter, cut alpha below 128 to index 0, and
 * give each tile up to 15 RGB555 colors by median cut over its opaque pixels, each pixel taking the nearest color. There
 * is no dithering. Identical patterns and palettes are saved once.
 */
export function drawScreenPicture(
  name: string,
  source: { width: number; height: number; pixels: Uint32Array },
  recipe: ScreenPictureRecipe,
): TilePictureDocument {
  const raster = fitSource(source, recipe);
  const patterns: { indices: number[] }[] = [],
    palettes: number[][] = [],
    tiles: [number, number][] = [];
  const patternIds = new Map<string, number>(),
    paletteIds = new Map<string, number>();
  const size = TILE_PICTURE_TILE_SIZE;
  for (let row = 0; row < recipe.rows; row++)
    for (let column = 0; column < recipe.columns; column++) {
      const pixels: (Color | null)[] = [];
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = ((row * size + y) * raster.width + column * size + x) * 4;
          const d = raster.data;
          pixels.push(
            Math.round(d[i + 3]!) < ALPHA_THRESHOLD
              ? null
              : [channel5(d[i]!), channel5(d[i + 1]!), channel5(d[i + 2]!)],
          );
        }
      const opaque = pixels.filter((pixel): pixel is Color => pixel !== null);
      const nearest = (color: Color, palette: readonly Color[]) => {
        let best = 0,
          distance = Infinity;
        palette.forEach((candidate, i) => {
          const d = (candidate[0] - color[0]) ** 2 + (candidate[1] - color[1]) ** 2 + (candidate[2] - color[2]) ** 2;
          if (d < distance) [best, distance] = [i, d];
        });
        return best;
      };
      const cut = opaque.length ? medianCut(opaque, TILE_COLORS) : [];
      // Only the colors some pixel takes, in value order, so equal tiles save equal palettes.
      const used = [...new Set(opaque.map((color) => pack(cut[nearest(color, cut)]!)))].sort((a, b) => a - b);
      const indices = pixels.map((pixel) => (pixel === null ? 0 : 1 + used.indexOf(pack(cut[nearest(pixel, cut)]!))));
      const saved = [0, ...used, ...Array<number>(TILE_COLORS - used.length).fill(0)];
      const patternKey = indices.join(','),
        paletteKey = saved.join(',');
      if (!patternIds.has(patternKey)) {
        patternIds.set(patternKey, patterns.length);
        patterns.push({ indices });
      }
      if (!paletteIds.has(paletteKey)) {
        paletteIds.set(paletteKey, palettes.length);
        palettes.push(saved);
      }
      tiles.push([patternIds.get(patternKey)!, paletteIds.get(paletteKey)!]);
    }
  return { format: TILE_PICTURE_FORMAT, version: 1, name, columns: recipe.columns, patterns, palettes, tiles };
}

/** Draw every screen picture the recipes name from its source, each admitted as a tile picture. */
export async function drawScreenPictures(store: ContentStore, PNG: typeof PngDecoder) {
  const json = JSON.parse(new TextDecoder().decode(await store.read(SCREEN_PICTURE_RECIPES_FILE))) as unknown;
  const recipes = requireLoaded(admit(`content/${SCREEN_PICTURE_RECIPES_FILE}`, () => readScreenPictureRecipes(json)));
  const drawn = new Map<string, TilePictureDocument>();
  for (const [name, recipe] of [...recipes].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const source = await decodeSpritePng(await store.read(`${SCREEN_PICTURE_SOURCES_DIRECTORY}/${name}.png`), PNG);
    const document = drawScreenPicture(name, source, recipe);
    requireLoaded(admit(`content/screen-pictures/${name}.json`, () => compileTilePicture(document)));
    drawn.set(name, document);
  }
  return drawn;
}
