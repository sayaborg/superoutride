import {
  IMAGE_OPAQUE_COVERAGE,
  integrateImageBox,
  linearToRgb555,
  rgb555LinearChannel,
} from '../../src/image/image-filter.js';
import { rgb555ToRgba } from '../../src/image/rgb555.js';
import type { SpriteDither } from './sprite-import.js';
import { generateSpritePalette } from './sprite-palette.js';
import type { SourceImage } from './sprite-source-compiler.js';

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

/** Minimize undithered reconstruction error with deterministic starts and RGB555-constrained Lloyd refinement. */
export function optimizeSpritePalette(samples: readonly LinearSample[], width: number, height: number) {
  const pixels = Uint32Array.from(samples, (s) =>
    s.coverage >= IMAGE_OPAQUE_COVERAGE ? rgb555ToRgba(linearToRgb555(s.red, s.green, s.blue)) : 0,
  );
  const baseline = generateSpritePalette({ width, height, pixels }, { x: 0, y: 0, width, height }, 15);
  const values = samples.filter((s) => s.coverage >= IMAGE_OPAQUE_COVERAGE).map(sampleColor);
  const score = (codes: readonly number[]) => {
    const colors = codes.map(color);
    return values.reduce((sum, v) => sum + distance(v, colors[nearest(v, colors)]!), 0);
  };
  const baselineError = score(baseline.slice(1));
  let best = baseline.slice(1),
    error = baselineError;
  if (!values.length) return { palette: baseline, baselineError, error, opaquePixels: 0 };
  // Snapping in linear light is the constrained centroid, not rounding an encoded channel.
  const channel = (v: number) => {
    let best = 0;
    for (let i = 1; i < 32; i++)
      if (Math.abs(rgb555LinearChannel(i) - v) < Math.abs(rgb555LinearChannel(best) - v)) best = i;
    return best;
  };
  const encode = (v: Color) => (channel(v[0]) << 10) | (channel(v[1]) << 5) | channel(v[2]);
  const starts = [best];
  for (const first of [0, Math.floor(values.length / 2), values.length - 1]) {
    const seed = [encode(values[first]!)];
    while (seed.length < 15) {
      const colors = seed.map(color);
      let farthest = values[0]!,
        largest = -1;
      for (const v of values) {
        const d = distance(v, colors[nearest(v, colors)]!);
        if (d > largest) {
          largest = d;
          farthest = v;
        }
      }
      seed.push(encode(farthest));
    }
    starts.push(seed);
  }
  for (let codes of starts)
    for (let iteration = 0; iteration < 96; iteration++) {
      const colors = codes.map(color),
        sums = colors.map(() => [0, 0, 0, 0]);
      let farthest = values[0]!,
        largest = -1;
      for (const value of values) {
        const slot = nearest(value, colors),
          sum = sums[slot]!,
          d = distance(value, colors[slot]!);
        if (d > largest) {
          largest = d;
          farthest = value;
        }
        for (let k = 0; k < 3; k++) sum[k] = sum[k]! + value[k]!;
        sum[3] = sum[3]! + 1;
      }
      const next = sums.map((s) => encode(s[3] ? [s[0]! / s[3], s[1]! / s[3], s[2]! / s[3]] : farthest));
      const candidateError = score(next);
      if (candidateError < error) {
        best = next;
        error = candidateError;
      }
      if (next.every((v, i) => v === codes[i])) break;
      codes = next;
    }
  return { palette: [0, ...best.sort((a, b) => a - b)], baselineError, error, opaquePixels: values.length };
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
