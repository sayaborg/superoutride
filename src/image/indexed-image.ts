import { AdmissionError, readArray, readNumber } from '../core/admission.js';
import { readRgb555 } from './rgb555.js';

/** Shared sprite/tile source symbols. The owned runtime pattern packs two symbols per byte. */
export class IndexedPattern {
  readonly #bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;

  constructor(width: number, height: number, indices: readonly number[]) {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      !Number.isSafeInteger(width * height)
    )
      throw new RangeError('indexed pattern dimensions must be positive safe integers');
    if (!Array.isArray(indices) || indices.length !== width * height)
      throw new RangeError('indexed pattern symbols must cover its complete lattice');
    this.width = width;
    this.height = height;
    const bytes = new Uint8Array(Math.ceil(indices.length / 2));
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i]!;
      if (!Number.isInteger(index) || index < 0 || index > 15)
        throw new RangeError('indexed pattern symbols must be in 0..15');
      bytes[i >>> 1]! |= index << ((1 - (i & 1)) * 4);
    }
    this.#bytes = bytes;
    this.byteLength = bytes.byteLength;
    Object.freeze(this);
  }

  /** Trusted raster addresses only; buffers never escape this read-only boundary. */
  indexAt(offset: number): number {
    return (this.#bytes[offset >>> 1]! >>> ((1 - (offset & 1)) * 4)) & 15;
  }
}

/** Slot zero is unused, not an opaque color. Equal opaque slots may retain different meanings. */
export function readIndexedPalette(value: unknown, path = ''): readonly number[] {
  return readArray(value, path, readRgb555, { length: 16 });
}

/** One saved pattern symbol: zero is transparent, 1 through 15 opaque palette slots. */
export function readPatternSymbol(value: unknown, path: string): number {
  return readNumber(value, path, { min: 0, max: 15, integer: true });
}

/**
 * A frame's saved pattern symbols: exactly `length` of them, each read as `readPatternSymbol` reads one, and `accept`ed
 * (a symbol it refuses fails with its message). A failure is reported at the first failing symbol's path; a valid frame
 * builds no path.
 */
export function readPatternSymbols(
  value: unknown,
  path: string,
  length: number,
  accept?: { readonly test: (symbol: number) => boolean; readonly message: string },
): readonly number[] {
  if (!Array.isArray(value)) throw new AdmissionError('invalid_shape', path, 'Expected an array');
  if (value.length !== length) throw new AdmissionError('invalid_shape', path, `Expected exactly ${length} entries`);
  for (let i = 0; i < value.length; i++) {
    const symbol: unknown = value[i];
    if (typeof symbol !== 'number' || !Number.isInteger(symbol) || symbol < 0 || symbol > 15)
      readPatternSymbol(symbol, `${path}/${i}`);
    else if (accept && !accept.test(symbol)) throw new AdmissionError('invalid_value', `${path}/${i}`, accept.message);
  }
  return value as readonly number[];
}
