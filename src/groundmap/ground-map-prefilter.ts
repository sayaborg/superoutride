import { rgba, unpackRgba } from '../graphics/software-surface.js';

export interface GroundMapTexelLevel {
  readonly lateralTexels: number;
  readonly chainageTexels: number;
  readonly pixels: Uint32Array;
}

/** One exact 2-by-4 averaging step, shared by bounded compiler batches and diagnostics. */
export function downsampleGroundMap2x4(source: GroundMapTexelLevel): GroundMapTexelLevel {
  validateLevel(source);
  if (source.lateralTexels % 2 !== 0 || source.chainageTexels % 4 !== 0) {
    throw new RangeError('GroundMap prefilter step requires even lateral and multiple-of-4 chainage dimensions');
  }

  const lateralTexels = source.lateralTexels / 2;
  const chainageTexels = source.chainageTexels / 4;
  const pixels = new Uint32Array(lateralTexels * chainageTexels);

  for (let sOut = 0; sOut < chainageTexels; sOut += 1) {
    for (let lOut = 0; lOut < lateralTexels; lOut += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let ds = 0; ds < 4; ds += 1) {
        const sIn = sOut * 4 + ds;
        const row = sIn * source.lateralTexels;
        for (let dl = 0; dl < 2; dl += 1) {
          const color = source.pixels[row + lOut * 2 + dl]!;
          const channels = unpackRgba(color);
          r += channels.r;
          g += channels.g;
          b += channels.b;
          a += channels.a;
        }
      }
      pixels[sOut * lateralTexels + lOut] = rgba(r / 8, g / 8, b / 8, a / 8);
    }
  }

  return { lateralTexels, chainageTexels, pixels };
}

function validateLevel(level: GroundMapTexelLevel): void {
  if (!Number.isInteger(level.lateralTexels) || level.lateralTexels <= 0) {
    throw new RangeError('lateralTexels must be a positive integer');
  }
  if (!Number.isInteger(level.chainageTexels) || level.chainageTexels <= 0) {
    throw new RangeError('chainageTexels must be a positive integer');
  }
  if (level.pixels.length !== level.lateralTexels * level.chainageTexels) {
    throw new RangeError('GroundMap texel buffer size mismatch');
  }
}
