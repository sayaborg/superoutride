import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { unpackRgba } from '../../src/image/rgb555.js';
import {
  HUD_DRAWN_TILE_NAMES,
  HUD_PICTURE_TILES,
  HUD_PICTURES,
  HUD_TILES,
  TEXT_PALETTES,
  TEXT_TILE_SIZE,
  type HudPicture,
  type TextTilesDocument,
} from '../../src/image/text-tiles.js';
import type { ContentStore } from '../authoring/content-store.js';
import { requireInput } from '../course/authoring-io.js';
import {
  HUD_PICTURE_RECIPES_FILE,
  HUD_PICTURE_SOURCES_DIRECTORY,
  readHudPictureRecipes,
  type HudPictureRecipe,
  type HudPictureRecipes,
  type SteeringWheelRecipe,
  type TopBridgeRecipe,
} from './hud-picture-recipe.js';
import { decodeSpritePng } from './sprite-png.js';

/** An 8-bit RGB picture as decoded from a source, with its alpha. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Packed little-endian RGBA, as `rgba` writes it. */
  readonly pixels: Uint32Array;
}

/** One drawn HUD picture: its frames' palette indices (0 transparent), `size` by `size` each, and its 15 colors. */
export interface DrawnHudPicture {
  readonly frames: readonly Uint8Array[];
  /** RGB555 colors of slots 1 to 15. */
  readonly palette: readonly number[];
}

type Channels = readonly [Float32Array, Float32Array, Float32Array];

/** The image's red, green, blue and alpha planes. */
function planes({ pixels }: RgbaImage) {
  const out = [0, 1, 2, 3].map(() => new Float32Array(pixels.length));
  pixels.forEach((color, i) => {
    const { r, g, b, a } = unpackRgba(color);
    out[0]![i] = r;
    out[1]![i] = g;
    out[2]![i] = b;
    out[3]![i] = a;
  });
  return { rgb: [out[0]!, out[1]!, out[2]!] as Channels, alpha: out[3]! };
}

/** Bilinear sample of `plane` at pixel-centre coordinates (x, y); outside it, `outside` or the nearest edge. */
function sample(plane: Float32Array, width: number, height: number, x: number, y: number, outside?: number): number {
  if (outside !== undefined && (x < -1 || y < -1 || x > width || y > height)) return outside;
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const at = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= width || py >= height) {
      if (outside !== undefined) return outside;
      px = Math.min(width - 1, Math.max(0, px));
      py = Math.min(height - 1, Math.max(0, py));
    }
    return plane[py * width + px]!;
  };
  return (
    (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
    (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
  );
}

/** Binary erosion (`dilate` false) or dilation by a structuring element of offsets; outside the image is false. */
function morph(
  mask: Uint8Array,
  width: number,
  height: number,
  offsets: readonly (readonly [number, number])[],
  dilate: boolean,
) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = dilate ? 0 : 1;
      for (const [dx, dy] of offsets) {
        const px = x + dx,
          py = y + dy;
        const set = px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px] === 1;
        if (dilate ? set : !set) {
          value = dilate ? 1 : 0;
          break;
        }
      }
      out[y * width + x] = value;
    }
  return out;
}
const CROSS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const disk = (radius: number) => {
  const offsets: [number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
  return offsets;
};
const open = (mask: Uint8Array, width: number, height: number, offsets: readonly (readonly [number, number])[]) =>
  morph(morph(mask, width, height, offsets, false), width, height, offsets, true);

/** The pixels of `mask` 4-connected to a pixel of `seed` through `mask`. */
function propagate(seed: Uint8Array, mask: Uint8Array, width: number) {
  const out = new Uint8Array(mask.length),
    queue = new Int32Array(mask.length);
  let head = 0,
    tail = 0;
  for (let i = 0; i < mask.length; i++)
    if (seed[i] && mask[i]) {
      out[i] = 1;
      queue[tail++] = i;
    }
  while (head < tail) {
    const i = queue[head++]!,
      x = i % width;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width])
      if (j >= 0 && j < mask.length && mask[j] && !out[j]) {
        out[j] = 1;
        queue[tail++] = j;
      }
  }
  return out;
}

/**
 * Each pixel takes the color of its nearest pixel of `mask` (breadth first, 8-connected), so filtering never mixes in
 * what lies outside.
 */
function extend(colors: Channels, mask: Uint8Array, width: number) {
  const source = new Int32Array(mask.length).fill(-1),
    queue = new Int32Array(mask.length);
  let head = 0,
    tail = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      source[i] = i;
      queue[tail++] = i;
    }
  while (head < tail) {
    const i = queue[head++]!,
      x = i % width;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= width) continue;
        const j = i + dy * width + dx;
        if (j >= 0 && j < mask.length && source[j] === -1) {
          source[j] = source[i]!;
          queue[tail++] = j;
        }
      }
  }
  return colors.map((plane) => plane.map((_, i) => (source[i]! >= 0 ? plane[source[i]!]! : 0))) as unknown as Channels;
}

/** Circular Gaussian smoothing of a periodic sequence. */
function smoothCircular(values: Float64Array, sigma: number) {
  const radius = Math.ceil(4 * sigma),
    weights = Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)));
  const total = weights.reduce((a, b) => a + b);
  const n = values.length;
  return values.map(
    (_, i) => weights.reduce((sum, w, k) => sum + w * values[(((i + k - radius) % n) + n) % n]!, 0) / total,
  );
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * The rim's outer and inner edges at `angles` equal angles about the rim centre: going inward from the image's edge,
 * the first solid pixel and the first gap after it. An inner edge whose rim thickness is a quarter or more from the
 * median is replaced by those either side, read linearly round the circle.
 */
function rimEdges(solid: Float32Array, width: number, height: number, cx: number, cy: number, angles: number) {
  const outer = new Float64Array(angles),
    inner = new Float64Array(angles).fill(NaN);
  const reach = Math.floor(Math.min(cx, cy, width - cx, height - cy)) - 1;
  for (let i = 0; i < angles; i++) {
    const theta = (2 * Math.PI * i) / angles,
      cos = Math.cos(theta),
      sin = Math.sin(theta);
    const inside = (r: number) => sample(solid, width, height, cx + r * cos, cy + r * sin, 0) > 0.5;
    let r = reach;
    while (r > 0 && !inside(r)) r--;
    outer[i] = r;
    while (r > 0 && inside(r)) r--;
    if (r > 0 && r < outer[i]!) inner[i] = r;
  }
  const thickness = Array.from(outer, (o, i) => o - inner[i]!).filter(Number.isFinite);
  const typical = median(thickness);
  const good: number[] = [];
  inner.forEach((value, i) => {
    if (Math.abs(outer[i]! - value - typical) < typical * 0.25) good.push(i);
    else inner[i] = NaN;
  });
  for (let i = 0; i < angles; i++) {
    if (Number.isFinite(inner[i])) continue;
    const after = good.find((g) => g > i) ?? good[0]! + angles,
      before = [...good].reverse().find((g) => g < i) ?? good[good.length - 1]! - angles;
    const t = (i - before) / (after - before);
    inner[i] = inner[(before + angles) % angles]! * (1 - t) + inner[after % angles]! * t;
  }
  return { outer, inner };
}

/**
 * A supersampled frame reduced to `size` by `size`: premultiplied box filtering, opaque where alpha reaches the
 * threshold.
 */
interface Frame {
  readonly rgb: Float32Array;
  readonly opaque: Uint8Array;
}
function reduce(rgb: Channels, alpha: Float32Array, size: number, factor: number, threshold: number): Frame {
  const span = size * factor,
    out = new Float32Array(size * size * 3),
    opaque = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let a = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < factor; sy++)
        for (let sx = 0; sx < factor; sx++) {
          const i = (y * factor + sy) * span + x * factor + sx,
            w = alpha[i]!;
          a += w;
          for (let c = 0; c < 3; c++) sum[c]! += rgb[c]![i]! * w;
        }
      const o = y * size + x;
      for (let c = 0; c < 3; c++) out[o * 3 + c] = a > 1e-3 ? sum[c]! / a : 0;
      opaque[o] = a / (factor * factor) >= threshold ? 1 : 0;
    }
  return { rgb: out, opaque };
}

/** A small deterministic generator for k-means seeding. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

/** `count` colors for the frames' opaque pixels: k-means from k-means++ seeds, rounded to RGB555. */
function quantize(frames: readonly Frame[], count: number) {
  const points: number[] = [];
  for (const { rgb, opaque } of frames)
    opaque.forEach((set, i) => set && points.push(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!));
  const n = points.length / 3,
    random = lcg(1);
  const distance = (p: number, centres: Float64Array, k: number) =>
    (points[p * 3]! - centres[k * 3]!) ** 2 +
    (points[p * 3 + 1]! - centres[k * 3 + 1]!) ** 2 +
    (points[p * 3 + 2]! - centres[k * 3 + 2]!) ** 2;
  const centres = new Float64Array(count * 3),
    nearest = new Float64Array(n).fill(Infinity);
  for (let k = 0; k < count; k++) {
    let pick = Math.floor(random() * n);
    if (k) {
      const total = nearest.reduce((a, b) => a + b);
      let target = random() * total;
      for (pick = 0; pick < n - 1 && (target -= nearest[pick]!) > 0; pick++);
    }
    for (let c = 0; c < 3; c++) centres[k * 3 + c] = points[pick * 3 + c]!;
    for (let p = 0; p < n; p++) nearest[p] = Math.min(nearest[p]!, distance(p, centres, k));
  }
  const label = new Int32Array(n);
  for (let iteration = 0; iteration < 40; iteration++) {
    const sums = new Float64Array(count * 4);
    for (let p = 0; p < n; p++) {
      let best = 0;
      for (let k = 1; k < count; k++) if (distance(p, centres, k) < distance(p, centres, best)) best = k;
      label[p] = best;
      for (let c = 0; c < 3; c++) sums[best * 4 + c]! += points[p * 3 + c]!;
      sums[best * 4 + 3]! += 1;
    }
    for (let k = 0; k < count; k++)
      if (sums[k * 4 + 3]) for (let c = 0; c < 3; c++) centres[k * 3 + c] = sums[k * 4 + c]! / sums[k * 4 + 3]!;
  }
  const to5 = (value: number) => Math.round((Math.min(255, Math.max(0, value)) / 255) * 31);
  const palette = Array.from(
    { length: count },
    (_, k) => [to5(centres[k * 3]!), to5(centres[k * 3 + 1]!), to5(centres[k * 3 + 2]!)] as const,
  );
  const indices = frames.map(({ rgb, opaque }) =>
    Uint8Array.from(opaque, (set, i) => {
      if (!set) return 0;
      let best = 0,
        bestDistance = Infinity;
      palette.forEach(([r, g, b], k) => {
        const d =
          (rgb[i * 3]! - (r * 255) / 31) ** 2 +
          (rgb[i * 3 + 1]! - (g * 255) / 31) ** 2 +
          (rgb[i * 3 + 2]! - (b * 255) / 31) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = k;
        }
      });
      return best + 1;
    }),
  );
  return {
    frames: indices,
    palette: palette.map(([r, g, b]) => (r << 10) | (g << 5) | b),
  };
}

/**
 * A steering wheel's frames: the source's white background, the gaps between rim and spokes and the lightening holes
 * cut out, the rim's edges made perfect circles, the hub moved onto the rim centre, and the result turned by each
 * frame's angle and reduced to the picture's size, the rim's outer diameter filling it.
 */
function steeringWheelFrames(
  image: RgbaImage,
  picture: SteeringWheelRecipe,
  recipe: HudPictureRecipes,
  turn: HudPicture,
): Frame[] {
  const { width, height } = image,
    method = recipe.steeringWheel;
  const { rgb: source } = planes(image);
  // The background: white areas wide enough to hold the opening disk, regrown through white; thin stitching stays.
  const white = Uint8Array.from(source[0], (_, i) =>
    Math.min(source[0][i]!, source[1][i]!, source[2][i]!) >= method.white ? 1 : 0,
  );
  const background = propagate(open(white, width, height, disk(method.openingRadius)), white, width);
  const solid = open(
    background.map((set) => 1 - set),
    width,
    height,
    CROSS,
  );
  let eroded = solid;
  for (let i = 0; i < method.erosion; i++) eroded = morph(eroded, width, height, CROSS, false);
  const alpha = Float32Array.from(eroded);
  const colors = extend(source, eroded, width);
  const [cx, cy] = picture.rimCentre;
  const leather = method.rimLeather;
  for (let i = 0; i < alpha.length; i++) {
    let r = colors[0][i]!,
      g = colors[1][i]!,
      b = colors[2][i]!;
    [r, g, b] = [r, g, b].map((v) => 255 * (v / 255) ** picture.gamma) as [number, number, number];
    const x = i % width,
      y = (i - x) / width;
    if (Math.hypot(x - cx, y - cy) > leather.radius && Math.max(r, g, b) - Math.min(r, g, b) < leather.saturation)
      [r, g, b] = [r, g, b].map((v) => 255 * (v / 255) ** leather.exponent * leather.scale) as [number, number, number];
    colors[0][i] = r;
    colors[1][i] = g;
    colors[2][i] = b;
  }
  const edges = rimEdges(Float32Array.from(solid), width, height, cx, cy, method.edgeAngles);
  const outer = smoothCircular(edges.outer, method.outerSmoothing),
    inner = smoothCircular(edges.inner, method.innerSmoothing);
  const meanOuter = outer.reduce((a, b) => a + b) / outer.length,
    meanInner = inner.reduce((a, b) => a + b) / inner.length;
  const [hubX, hubY] = picture.hubOffset;
  const { size, supersampling: factor } = recipe,
    span = size * factor,
    angles = method.edgeAngles;
  return Array.from({ length: turn.frames }, (_, frame) => {
    const turned = (frame - turn.upright) * turn.step;
    const frameRgb = [0, 1, 2].map(() => new Float32Array(span * span)) as unknown as Channels,
      frameAlpha = new Float32Array(span * span);
    for (let y = 0; y < span; y++)
      for (let x = 0; x < span; x++) {
        const u = ((x + 0.5) / span) * 2 - 1,
          v = ((y + 0.5) / span) * 2 - 1;
        const at = Math.atan2(v, u) - turned;
        const t = ((((at / (2 * Math.PI)) % 1) + 1) % 1) * angles,
          i0 = Math.floor(t) % angles,
          i1 = (i0 + 1) % angles,
          f = t - Math.floor(t);
        const ro = outer[i0]! * (1 - f) + outer[i1]! * f,
          ri = inner[i0]! * (1 - f) + inner[i1]! * f;
        // The radius on perfect circles of the mean radii, and the measured radius it shows in the source.
        const r = Math.hypot(u, v) * meanOuter;
        const rs = r <= meanInner ? (r * ri) / meanInner : ri + ((r - meanInner) * (ro - ri)) / (meanOuter - meanInner);
        const hub = Math.min(1, Math.max(0, 1 - r / meanInner));
        const sx = cx + rs * Math.cos(at) + hubX * hub,
          sy = cy + rs * Math.sin(at) + hubY * hub;
        let a = sample(alpha, width, height, sx, sy, 0);
        // The rim's band is opaque and nothing lies outside it.
        if (r > meanInner + 3 && r <= meanOuter - 2) a = 1;
        if (r > meanOuter - 2) a = 0;
        const o = y * span + x;
        frameAlpha[o] = a;
        for (let c = 0; c < 3; c++) frameRgb[c]![o] = sample(colors[c]!, width, height, sx, sy);
      }
    return reduce(frameRgb, frameAlpha, size, factor, recipe.alphaThreshold);
  });
}

/** A top bridge's frames: the source turned about its centre by each frame's angle, its width filling the picture. */
function topBridgeFrames(image: RgbaImage, picture: TopBridgeRecipe, recipe: HudPictureRecipes, turn: HudPicture) {
  const { width, height } = image;
  const { rgb, alpha } = planes(image);
  const premultiplied = rgb.map((plane) => plane.map((value, i) => (value * alpha[i]!) / 255)) as unknown as Channels;
  const opacity = alpha.map((value) => value / 255);
  const { size, supersampling: factor } = recipe,
    span = size * factor,
    [cx, cy] = picture.centre,
    scale = width / size;
  return Array.from({ length: turn.frames }, (_, frame) => {
    const turned = (frame - turn.upright) * turn.step,
      cos = Math.cos(turned),
      sin = Math.sin(turned);
    const frameRgb = [0, 1, 2].map(() => new Float32Array(span * span)) as unknown as Channels,
      frameAlpha = new Float32Array(span * span);
    for (let y = 0; y < span; y++)
      for (let x = 0; x < span; x++) {
        const u = ((x + 0.5) / factor - size / 2) * scale,
          v = ((y + 0.5) / factor - size / 2) * scale;
        // Turned clockwise on screen: the source point is the output point turned back.
        const sx = cx - 0.5 + u * cos + v * sin,
          sy = cy - 0.5 - u * sin + v * cos;
        const a = sample(opacity, width, height, sx, sy, 0),
          o = y * span + x;
        frameAlpha[o] = a;
        for (let c = 0; c < 3; c++)
          frameRgb[c]![o] = a > 1e-6 ? sample(premultiplied[c]!, width, height, sx, sy, 0) / a : 0;
      }
    return reduce(frameRgb, frameAlpha, size, factor, recipe.alphaThreshold);
  });
}

/** Draw one HUD picture from its source by its recipe: its frames and its palette of `recipe.colors` colors. */
export function drawHudPicture(
  image: RgbaImage,
  picture: HudPictureRecipe,
  recipe: HudPictureRecipes,
  turn: HudPicture,
): DrawnHudPicture {
  const frames =
    picture.kind === 'steeringWheel'
      ? steeringWheelFrames(image, picture, recipe, turn)
      : topBridgeFrames(image, picture, recipe, turn);
  return quantize(frames, recipe.colors);
}

/**
 * Draw every HUD picture from its source, in the text tiles' order of HUD pictures, whose frames and turning it
 * follows; the recipes name exactly those pictures, `HUD_PICTURE_TILES` tiles square.
 */
export async function drawHudPictures(store: ContentStore, PNG: typeof PngDecoder) {
  const json = JSON.parse(new TextDecoder().decode(await store.read(HUD_PICTURE_RECIPES_FILE))) as unknown;
  const path = `content/${HUD_PICTURE_RECIPES_FILE}`;
  const recipes = requireLoaded(admit(path, () => readHudPictureRecipes(json)));
  const names = Object.keys(HUD_PICTURES);
  requireInput(
    Object.keys(recipes.pictures).sort().join() === [...names].sort().join(),
    `${path}#/pictures`,
    `The recipes name exactly the HUD pictures: ${names.join(', ')}`,
  );
  requireInput(
    recipes.size === HUD_PICTURE_TILES * TEXT_TILE_SIZE,
    `${path}#/size`,
    `A HUD picture is ${HUD_PICTURE_TILES * TEXT_TILE_SIZE} pixels square`,
  );
  const drawn = new Map<HudPicture, DrawnHudPicture>();
  for (const name of names) {
    const image = await decodeSpritePng(await store.read(`${HUD_PICTURE_SOURCES_DIRECTORY}/${name}.png`), PNG);
    drawn.set(HUD_PICTURES[name]!, drawHudPicture(image, recipes.pictures[name]!, recipes, HUD_PICTURES[name]!));
  }
  return drawn;
}

/**
 * The text tiles document with these drawn HUD part tiles and pictures in place of those it held: the characters, the
 * signal lamps and the named palettes are kept, and the part tiles, then each picture's frames, tile rows from the top
 * left, and palette follow them.
 */
export function withHudTiles(
  document: TextTilesDocument,
  parts: readonly (readonly number[])[],
  drawn: ReadonlyMap<HudPicture, DrawnHudPicture>,
): TextTilesDocument {
  const tiles = HUD_PICTURE_TILES,
    size = tiles * TEXT_TILE_SIZE;
  const patterns = [
    ...document.patterns.slice(0, HUD_TILES[HUD_DRAWN_TILE_NAMES[0]!]!),
    ...parts.map((indices) => ({ indices })),
  ];
  const palettes = document.palettes.slice(0, Object.keys(TEXT_PALETTES).length);
  for (const [picture, { frames, palette }] of drawn) {
    if (patterns.length !== picture.first || palettes.length !== picture.palette)
      throw new Error(`HUD picture ${picture.name} does not follow the part tiles and named palettes`);
    for (const frame of frames)
      for (let row = 0; row < tiles; row++)
        for (let column = 0; column < tiles; column++)
          patterns.push({
            indices: Array.from({ length: TEXT_TILE_SIZE * TEXT_TILE_SIZE }, (_, i) => {
              const x = column * TEXT_TILE_SIZE + (i % TEXT_TILE_SIZE),
                y = row * TEXT_TILE_SIZE + Math.floor(i / TEXT_TILE_SIZE);
              return frame[y * size + x]!;
            }),
          });
    palettes.push([0, ...palette, ...Array<number>(15 - palette.length).fill(0)]);
  }
  return { ...document, patterns, palettes };
}
