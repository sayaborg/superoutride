import { IndexedPattern } from '../../src/image/indexed-image.js';
import type { SpriteFrame, SpriteLodAsset, SpriteLodDocument } from '../../src/image/sprite.js';

/** A frame's slots as bytes, one slot a byte in rows, with its extent and base point. */
export interface FrameBytes {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: Uint8Array<ArrayBuffer>;
}

type AssetLevel = SpriteLodAsset['levels'][number];

/**
 * A course image read once in a worker (`readSpriteLodAsset`), its frames' slots as bytes: what the worker hands the
 * page, which makes the image of it again without reading it again (`assetOfBytes`).
 */
export interface AssetBytes extends Omit<SpriteLodAsset, 'levels'> {
  readonly levels: readonly (Omit<AssetLevel, 'pattern' | 'shadow'> &
    FrameBytes & { readonly shadow: FrameBytes | null })[];
}

/** An import's master, its one level's slots as bytes. */
export type MasterBytes = Omit<SpriteLodDocument, 'levels' | 'shadow'> & {
  readonly levels: readonly [{ readonly paletteRgb555: readonly number[]; readonly indices: Uint8Array<ArrayBuffer> }];
};

/** A frame's slots as bytes. */
function frameBytes(frame: SpriteFrame): FrameBytes {
  const { width, height, anchorX, anchorY, pattern } = frame;
  const indices = new Uint8Array(width * height);
  for (let i = 0; i < indices.length; i++) indices[i] = pattern.indexAt(i);
  return { width, height, anchorX, anchorY, indices };
}

/** An image read in a worker as bytes (its first `levels` levels), with the buffers to hand over. */
export function assetBytes(
  asset: SpriteLodAsset,
  levels = asset.levels.length,
): { readonly asset: AssetBytes; readonly transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  const kept = (frame: FrameBytes) => (transfer.push(frame.indices.buffer), frame);
  return {
    asset: {
      ...asset,
      levels: asset.levels.slice(0, levels).map((level) => {
        const { pattern: _, shadow, ...rest } = level;
        return { ...rest, ...kept(frameBytes(level)), shadow: shadow && kept(frameBytes(shadow)) };
      }),
    },
    transfer,
  };
}

/** An import's master as bytes, with the buffer to hand over. */
export function masterBytes(master: SpriteLodDocument): {
  readonly master: MasterBytes;
  readonly transfer: ArrayBuffer[];
} {
  const { levels, shadow: _, ...rest } = master;
  const level = levels[0]!;
  const indices = Uint8Array.from(level.indices);
  return { master: { ...rest, levels: [{ paletteRgb555: level.paletteRgb555, indices }] }, transfer: [indices.buffer] };
}

/** The image a worker read, made again from its bytes: its frames' patterns made, nothing read again. */
export function assetOfBytes(bytes: AssetBytes): SpriteLodAsset {
  const frame = ({ width, height, anchorX, anchorY, indices }: FrameBytes): SpriteFrame =>
    Object.freeze({ width, height, anchorX, anchorY, pattern: new IndexedPattern(width, height, indices) });
  return Object.freeze({
    ...bytes,
    levels: Object.freeze(
      bytes.levels.map((level) => {
        const { indices: _, shadow, ...rest } = level;
        return Object.freeze({ ...rest, ...frame(level), shadow: shadow && frame(shadow) });
      }),
    ),
  });
}
