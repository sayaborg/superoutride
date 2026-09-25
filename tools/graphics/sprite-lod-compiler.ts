import {
  IMAGE_OPAQUE_COVERAGE,
  evaluatePaletteMixture,
  linearToRgb555,
  type PaletteMixture,
} from '../../src/image/image-filter.js';
import {
  readSpriteLodAsset,
  spriteLodLayout,
  spritePaletteStates,
  type SpriteLodDocument,
} from '../../src/image/sprite.js';

interface MixtureBin {
  readonly mixture: PaletteMixture;
  readonly colors: readonly (readonly number[])[];
  weight: number;
}

/** Direct-master box filtering, with one shared pattern for every declared color and lamp state. */
export function compileSpriteLod(source: SpriteLodDocument): SpriteLodDocument {
  const master = readSpriteLodAsset(source);
  if (master.levels.length !== 1) throw new RangeError('sprite compiler requires exactly one normalized master');
  const original = source.levels[0]!;
  const levels = spriteLodLayout(master.width, master.height).map(({ width, height }, k) => {
    if (k === 0)
      return {
        paletteRgb555: [...original.paletteRgb555],
        indices: [...original.indices],
        mixtures: original.mixtures.map((mixture) => mixture.map(([i, w]) => [i, w] as const)),
      };
    const step = 2 ** k,
      bins: MixtureBin[] = [],
      dictionary = new Map<string, number>();
    const membership = new Int32Array(width * height).fill(-1);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const x0 = x * step,
          y0 = y * step,
          x1 = Math.min(master.width, x0 + step),
          y1 = Math.min(master.height, y0 + step);
        const counts = new Float64Array(16);
        let opaque = 0;
        for (let sy = y0; sy < y1; sy++)
          for (let sx = x0; sx < x1; sx++) {
            const index = original.indices[sy * master.width + sx]!;
            if (index) {
              counts[index] = counts[index]! + 1;
              opaque++;
            }
          }
        if (opaque / ((x1 - x0) * (y1 - y0)) < IMAGE_OPAQUE_COVERAGE) continue;
        const mixture: PaletteMixture = Array.from(counts, (count, index) => [index, count / opaque] as const).filter(
          ([index, weight]) => index > 0 && weight > 0,
        );
        const key = JSON.stringify(mixture);
        let bin = dictionary.get(key);
        if (bin === undefined) {
          bin = bins.length;
          dictionary.set(key, bin);
          bins.push({
            mixture,
            colors: spritePaletteStates(master.palettes).map((palette) => evaluatePaletteMixture(mixture, palette)),
            weight: 0,
          });
        }
        bins[bin]!.weight += opaque;
        membership[y * width + x] = bin;
      }
    const groups = reduceMixtures(bins, spritePaletteStates(master.palettes));
    const indicesByBin = new Uint8Array(bins.length);
    const mixtures: PaletteMixture[] = Array.from({ length: 16 }, () => []);
    const paletteRgb555 = Array<number>(16).fill(0);
    groups.forEach((group, index) => {
      const slot = index + 1;
      mixtures[slot] = centroid(group, bins);
      paletteRgb555[slot] = linearToRgb555(...evaluatePaletteMixture(mixtures[slot]!, original.paletteRgb555));
      for (const bin of group) indicesByBin[bin] = slot;
    });
    return { paletteRgb555, mixtures, indices: Array.from(membership, (bin) => (bin < 0 ? 0 : indicesByBin[bin]!)) };
  });
  return { ...source, levels };
}

/** Deterministic divisive clustering; distance is the worst color error over all palette/lamp states. */
function reduceMixtures(bins: readonly MixtureBin[], palettes: readonly (readonly number[])[]): number[][] {
  if (bins.length <= 15) return bins.map((_, i) => [i]);
  const groups = [bins.map((_, i) => i)];
  while (groups.length < 15) {
    let chosen = -1,
      largestError = -1,
      first = -1;
    groups.forEach((group, i) => {
      if (group.length < 2) return;
      const mixture = centroid(group, bins),
        colors = palettes.map((palette) => evaluatePaletteMixture(mixture, palette));
      let error = 0,
        farthest = -1,
        distance = -1;
      for (const bin of group) {
        const d = colorDistance(bins[bin]!.colors, colors);
        error += bins[bin]!.weight * d;
        if (d > distance) {
          distance = d;
          farthest = bin;
        }
      }
      if (error > largestError) {
        chosen = i;
        largestError = error;
        first = farthest;
      }
    });
    if (chosen < 0) break;
    const group = groups[chosen]!;
    let second = first,
      distance = -1;
    for (const bin of group) {
      const d = colorDistance(bins[first]!.colors, bins[bin]!.colors);
      if (d > distance) {
        distance = d;
        second = bin;
      }
    }
    // Distinct mixtures that are identical in every declared variant may share their centroid.
    if (!(distance > 0)) break;
    const left: number[] = [],
      right: number[] = [];
    for (const bin of group) {
      const a = colorDistance(bins[bin]!.colors, bins[first]!.colors),
        b = colorDistance(bins[bin]!.colors, bins[second]!.colors);
      (a <= b ? left : right).push(bin);
    }
    groups.splice(chosen, 1, left, right);
  }
  return groups;
}

function colorDistance(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number {
  let distance = 0;
  for (let variant = 0; variant < a.length; variant++) {
    let squared = 0;
    for (let channel = 0; channel < 3; channel++) squared += (a[variant]![channel]! - b[variant]![channel]!) ** 2;
    distance = Math.max(distance, squared);
  }
  return distance;
}

function centroid(group: readonly number[], bins: readonly MixtureBin[]): PaletteMixture {
  const weights = new Float64Array(16);
  let total = 0;
  for (const index of group) {
    const bin = bins[index]!;
    total += bin.weight;
    for (const [slot, weight] of bin.mixture) weights[slot] = weights[slot]! + bin.weight * weight;
  }
  return Array.from(weights, (weight, index) => [index, weight / total] as const).filter(
    ([index, weight]) => index > 0 && weight > 0,
  );
}
