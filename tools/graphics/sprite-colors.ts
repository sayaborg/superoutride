import {
  IMAGE_OPAQUE_COVERAGE,
  integrateImageBox,
  linearToRgb555,
  rgb555LinearChannel,
} from '../../src/image/image-filter.js';
import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { generateSpritePalette } from './sprite-palette.js';
import type { SourceImage } from './sprite-source-compiler.js';

/** How a master's colors are chosen from the source's: the nearest, an ordered (4×4 Bayer) or an error-diffusion dither. */
export const SPRITE_DITHERS = ['none', 'ordered', 'diffusion'] as const;
export type SpriteDither = (typeof SPRITE_DITHERS)[number];

export type LinearSample = ReturnType<typeof integrateImageBox>;
export interface ImageTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}
type Color = readonly [number, number, number];
const color = (code: number): Color => [
  rgb555LinearChannel(code >>> 10),
  rgb555LinearChannel((code >> 5) & 31),
  rgb555LinearChannel(code & 31),
];
const distance = (a: Color, b: Color) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const nearest = (value: Color, colors: readonly Color[]) => {
  let best = 0,
    error = Infinity;
  colors.forEach((c, i) => {
    const e = distance(value, c);
    if (e < error) {
      best = i;
      error = e;
    }
  });
  return best;
};
const sampleColor = (s: LinearSample): Color => [s.red, s.green, s.blue];

/** The existing linear-light area integral, with transparent padding outside a registered source. */
export function sampleSpriteSource(
  image: SourceImage,
  width: number,
  height: number,
  transform: ImageTransform,
): LinearSample[] {
  if (
    !(
      transform.scale > 0 &&
      Number.isFinite(transform.scale) &&
      Number.isFinite(transform.x) &&
      Number.isFinite(transform.y)
    ) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 1048576
  )
    throw new RangeError('Invalid source transform or master extent');
  const samples: LinearSample[] = [];
  const area = 1 / transform.scale ** 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, (x - transform.x) / transform.scale),
        y0 = Math.max(0, (y - transform.y) / transform.scale);
      const x1 = Math.min(image.width, (x + 1 - transform.x) / transform.scale),
        y1 = Math.min(image.height, (y + 1 - transform.y) / transform.scale);
      samples.push(
        x1 > x0 && y1 > y0
          ? integrateImageBox(image.pixels, image.width, x0, y0, x1, y1, area, 1)
          : { coverage: 0, red: 0, green: 0, blue: 0 },
      );
    }
  return samples;
}

/** The distinct colors of `samples` in first-appearance order, their counts, and the distinct color each sample holds. */
function distinctColors(samples: readonly LinearSample[]) {
  const bits = new Float64Array(3),
    words = new Uint32Array(bits.buffer);
  let size = 1024;
  while (size < samples.length * 2) size *= 2;
  const table = new Int32Array(size).fill(-1);
  const values = new Float64Array(samples.length * 3),
    counts = new Float64Array(samples.length),
    holds = new Int32Array(samples.length);
  let distinct = 0;
  samples.forEach((s, at) => {
    bits[0] = s.red;
    bits[1] = s.green;
    bits[2] = s.blue;
    let hash = 0x811c9dc5;
    for (let w = 0; w < 6; w++) hash = Math.imul(hash ^ words[w]!, 0x01000193);
    let slot = (hash >>> 0) & (size - 1);
    for (;;) {
      const found = table[slot]!;
      if (found < 0) {
        table[slot] = distinct;
        values.set(bits, distinct * 3);
        counts[distinct] = 1;
        holds[at] = distinct++;
        return;
      }
      if (values[found * 3] === s.red && values[found * 3 + 1] === s.green && values[found * 3 + 2] === s.blue) {
        counts[found]!++;
        holds[at] = found;
        return;
      }
      slot = (slot + 1) & (size - 1);
    }
  });
  return { values: values.subarray(0, distinct * 3), counts: counts.subarray(0, distinct), holds };
}

/**
 * Minimize undithered reconstruction error with deterministic starts and RGB555-constrained Lloyd refinement. Equal
 * opaque samples are counted once with their number (first-appearance order, so ties fall as over every sample), and
 * each Lloyd pass both scores its colors and gathers their centroids.
 */
export function optimizeSpritePalette(samples: readonly LinearSample[], width: number, height: number) {
  const opaque = samples.filter((s) => s.coverage >= IMAGE_OPAQUE_COVERAGE);
  // The distinct opaque colors, three channels each, in first-appearance order, with how many samples hold each and
  // which each sample holds: an open-addressed table over the channels' bits.
  const { values, counts, holds } = distinctColors(opaque);
  const distinct = counts.length;
  const codes555 = Uint32Array.from({ length: distinct }, (_, i) =>
    rgb555ToRgba(linearToRgb555(values[i * 3]!, values[i * 3 + 1]!, values[i * 3 + 2]!)),
  );
  let next = 0;
  const pixels = Uint32Array.from(samples, (s) =>
    s.coverage >= IMAGE_OPAQUE_COVERAGE ? codes555[holds[next++]!]! : 0,
  );
  const baseline = generateSpritePalette({ width, height, pixels }, { x: 0, y: 0, width, height }, 15);
  const palette = new Float64Array(45);
  const load = (codes: readonly number[]) => {
    codes.forEach((code, slot) => palette.set(color(code), slot * 3));
    return codes.length;
  };
  // One pass over the distinct colors against `codes`: the squared error, each slot's weighted sums, the farthest color.
  const sums = new Float64Array(60);
  const pass = (codes: readonly number[]) => {
    const slots = load(codes);
    sums.fill(0);
    let error = 0,
      largest = -1,
      farthest = 0;
    for (let i = 0; i < distinct; i++) {
      const r = values[i * 3]!,
        g = values[i * 3 + 1]!,
        b = values[i * 3 + 2]!;
      let slot = 0,
        least = Infinity;
      for (let k = 0; k < slots; k++) {
        const d = (r - palette[k * 3]!) ** 2 + (g - palette[k * 3 + 1]!) ** 2 + (b - palette[k * 3 + 2]!) ** 2;
        if (d < least) {
          least = d;
          slot = k;
        }
      }
      const n = counts[i]!;
      error += least * n;
      if (least > largest) {
        largest = least;
        farthest = i;
      }
      const s = slot * 4;
      sums[s] = sums[s]! + r * n;
      sums[s + 1] = sums[s + 1]! + g * n;
      sums[s + 2] = sums[s + 2]! + b * n;
      sums[s + 3] = sums[s + 3]! + n;
    }
    return { error, farthest };
  };
  const at = (i: number): Color => [values[i * 3]!, values[i * 3 + 1]!, values[i * 3 + 2]!];
  const baselineError = distinct ? pass(baseline.slice(1)).error : 0;
  let best = baseline.slice(1),
    error = baselineError;
  if (!distinct) return { palette: baseline, baselineError, error, opaquePixels: 0 };
  // Snapping in linear light is the constrained centroid, not rounding an encoded channel.
  const channel = (v: number) => {
    let best = 0;
    for (let i = 1; i < 32; i++)
      if (Math.abs(rgb555LinearChannel(i) - v) < Math.abs(rgb555LinearChannel(best) - v)) best = i;
    return best;
  };
  const encode = (v: Color) => (channel(v[0]) << 10) | (channel(v[1]) << 5) | channel(v[2]);
  const starts = [best];
  // Each seed adds the color farthest from those chosen; each color's distance to its nearest seed is kept, so a new
  // seed is measured once against every color.
  const least = new Float64Array(distinct);
  for (const first of [0, Math.floor(opaque.length / 2), opaque.length - 1]) {
    const seed = [encode(sampleColor(opaque[first]!))];
    least.fill(Infinity);
    while (seed.length < 15) {
      const [r, g, b] = color(seed.at(-1)!);
      let largest = -1,
        farthest = 0;
      for (let i = 0; i < distinct; i++) {
        const d = (values[i * 3]! - r) ** 2 + (values[i * 3 + 1]! - g) ** 2 + (values[i * 3 + 2]! - b) ** 2;
        if (d < least[i]!) least[i] = d;
        if (least[i]! > largest) {
          largest = least[i]!;
          farthest = i;
        }
      }
      seed.push(encode(at(farthest)));
    }
    starts.push(seed);
  }
  // Lloyd passes keep each color's slot and a lower bound on its distance to every other slot, lowered by how far the
  // others moved: while the distance to its own slot, measured exactly each pass, is strictly below that bound, that
  // slot is its one nearest and no other is measured. Otherwise every slot is, as in `pass`; results are `pass`'s.
  const assigned = new Int32Array(distinct),
    lower = new Float64Array(distinct),
    previous = new Float64Array(45);
  let bounded = false;
  const lloydPass = (codes: readonly number[]) => {
    const slots = load(codes);
    let moved = 0;
    if (bounded)
      for (let k = 0; k < slots; k++)
        moved = Math.max(
          moved,
          Math.sqrt(
            (palette[k * 3]! - previous[k * 3]!) ** 2 +
              (palette[k * 3 + 1]! - previous[k * 3 + 1]!) ** 2 +
              (palette[k * 3 + 2]! - previous[k * 3 + 2]!) ** 2,
          ),
        );
    previous.set(palette);
    sums.fill(0);
    let error = 0,
      largest = -1,
      farthest = 0;
    for (let i = 0; i < distinct; i++) {
      const r = values[i * 3]!,
        g = values[i * 3 + 1]!,
        b = values[i * 3 + 2]!;
      let slot = assigned[i]!,
        least = (r - palette[slot * 3]!) ** 2 + (g - palette[slot * 3 + 1]!) ** 2 + (b - palette[slot * 3 + 2]!) ** 2;
      const bound = lower[i]! - moved;
      if (!bounded || !(Math.sqrt(least) < bound)) {
        slot = 0;
        least = Infinity;
        let second = Infinity;
        for (let k = 0; k < slots; k++) {
          const d = (r - palette[k * 3]!) ** 2 + (g - palette[k * 3 + 1]!) ** 2 + (b - palette[k * 3 + 2]!) ** 2;
          if (d < least) {
            second = least;
            least = d;
            slot = k;
          } else if (d < second) second = d;
        }
        assigned[i] = slot;
        lower[i] = Math.sqrt(second);
      } else lower[i] = bound;
      const n = counts[i]!;
      error += least * n;
      if (least > largest) {
        largest = least;
        farthest = i;
      }
      const s = slot * 4;
      sums[s] = sums[s]! + r * n;
      sums[s + 1] = sums[s + 1]! + g * n;
      sums[s + 2] = sums[s + 2]! + b * n;
      sums[s + 3] = sums[s + 3]! + n;
    }
    bounded = true;
    return { error, farthest };
  };
  for (let codes of starts) {
    // Each iteration's colors are scored by the pass that gathers the next ones, as before.
    bounded = false;
    let gathered = lloydPass(codes);
    for (let iteration = 0; iteration < 96; iteration++) {
      const next = codes.map((_, slot) =>
        encode(
          sums[slot * 4 + 3]
            ? [
                sums[slot * 4]! / sums[slot * 4 + 3]!,
                sums[slot * 4 + 1]! / sums[slot * 4 + 3]!,
                sums[slot * 4 + 2]! / sums[slot * 4 + 3]!,
              ]
            : at(gathered.farthest),
        ),
      );
      gathered = lloydPass(next);
      if (gathered.error < error) {
        best = next;
        error = gathered.error;
      }
      if (next.every((v, i) => v === codes[i])) break;
      codes = next;
    }
  }
  return { palette: [0, ...best.sort((a, b) => a - b)], baselineError, error, opaquePixels: opaque.length };
}

/** All three comparisons share the optimized palette; only assignment/dither differs. */
export function quantizeSpriteSamples(
  samples: readonly LinearSample[],
  width: number,
  palette: readonly number[],
  mode: SpriteDither,
) {
  const colors = palette.slice(1).map(color),
    indices = Array<number>(samples.length).fill(0);
  const errors = new Float64Array(samples.length * 3);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    if (sample.coverage < IMAGE_OPAQUE_COVERAGE) continue;
    const x = i % width,
      y = Math.floor(i / width);
    const ordered = mode === 'ordered' ? (bayer[(y % 4) * 4 + (x % 4)]! / 16 - 0.46875) * 0.08 : 0;
    const raw = sampleColor(sample);
    const value: Color = [0, 1, 2].map((k) => raw[k]! + ordered + (mode === 'diffusion' ? errors[i * 3 + k]! : 0)) as [
      number,
      number,
      number,
    ];
    const slot = nearest(value, colors);
    indices[i] = slot + 1;
    if (mode === 'diffusion')
      for (const [dx, dy, weight] of [
        [1, 0, 7 / 16],
        [-1, 1, 3 / 16],
        [0, 1, 5 / 16],
        [1, 1, 1 / 16],
      ] as const) {
        const xx = x + dx,
          target = (y + dy) * width + xx;
        if (xx < 0 || xx >= width || target >= samples.length || samples[target]!.coverage < IMAGE_OPAQUE_COVERAGE)
          continue;
        for (let k = 0; k < 3; k++)
          errors[target * 3 + k] = errors[target * 3 + k]! + (value[k]! - colors[slot]![k]!) * weight;
      }
  }
  return indices;
}
