import { rgb555ToRgba } from './rgb555.js';

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
    this.#bytes = new Uint8Array(Math.ceil(indices.length / 2));
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i]!;
      if (!Number.isInteger(index) || index < 0 || index > 15)
        throw new RangeError('indexed pattern symbols must be in 0..15');
      this.#bytes[i >>> 1]! |= index << ((1 - (i & 1)) * 4);
    }
    this.byteLength = this.#bytes.byteLength;
    Object.freeze(this);
  }

  /** Trusted raster addresses only; buffers never escape this read-only boundary. */
  indexAt(offset: number): number {
    return (this.#bytes[offset >>> 1]! >>> ((1 - (offset & 1)) * 4)) & 15;
  }
}

/** Slot zero is unused, not an opaque color. Equal opaque slots may retain different meanings. */
export function readIndexedPalette(value: unknown): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 16 ||
    Array.from(value).some((v) => !Number.isInteger(v) || v < 0 || v > 0x7fff)
  )
    throw new RangeError('indexed palette must contain 16 RGB555 entries, with unused slot zero');
  return Object.freeze([...value]);
}

export function indexedPaletteRgba(palette: readonly number[]): readonly number[] {
  return Object.freeze(palette.map((color, index) => (index === 0 ? 0 : rgb555ToRgba(color))));
}
