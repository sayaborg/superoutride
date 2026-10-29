import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { SpriteLodAsset } from '../../src/image/sprite.js';
import { spriteLayers } from './sprite-layers.js';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A zlib stream of stored (uncompressed) deflate blocks: one encoding of the data, whoever writes it. */
function storedZlib(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  out.set([0x78, 0x01]);
  let at = 2;
  for (let block = 0; block < blocks; block++) {
    const part = data.subarray(block * 65535, Math.min(data.length, (block + 1) * 65535));
    out.set(
      [
        block === blocks - 1 ? 1 : 0,
        part.length & 255,
        part.length >> 8,
        ~part.length & 255,
        (~part.length >> 8) & 255,
      ],
      at,
    );
    out.set(part, at + 5);
    at += 5 + part.length;
  }
  let a = 1,
    b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  new DataView(out.buffer).setUint32(at, ((b << 16) | a) >>> 0);
  return out;
}

/**
 * A raster of palette slots as an 8-bit indexed PNG (its 16 RGB555 slot colors, slot 0 transparent), its image data
 * in stored deflate blocks: the same raster gives the same bytes in Node and the browser, so their SHA-256 names it.
 */
export function indexedPng(
  raster: { readonly width: number; readonly height: number; readonly indices: readonly number[] },
  palette: readonly number[],
): Uint8Array<ArrayBuffer> {
  const { width, height, indices } = raster;
  if (!(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0))
    throw new RangeError('An indexed PNG needs a positive extent');
  if (palette.length !== 16 || indices.length !== width * height || indices.some((i) => !(i >= 0 && i < 16)))
    throw new RangeError('An indexed PNG takes 16 slot colors and one slot per texel');
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 3, 0, 0, 0], 8);
  const colors = new Uint8Array(48);
  palette.forEach((code, slot) => {
    const { r, g, b } = unpackRgba(rgb555ToRgba(code));
    colors.set([r, g, b], slot * 3);
  });
  const rows = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rows[y * (width + 1) + 1 + x] = indices[y * width + x]!;
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('PLTE', colors),
    chunk('tRNS', Uint8Array.of(0)),
    chunk('IDAT', storedZlib(rows)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

/**
 * An original picture's body PNG: its master less its shadow frame (`spriteLayers`), in its default palette. A product
 * picture's `basedOn.bodySha256` is this PNG's SHA-256, and a product PNG with that digest is the original not yet
 * redrawn.
 */
export function spriteBodyPng(asset: SpriteLodAsset): Uint8Array<ArrayBuffer> {
  return indexedPng(spriteLayers(asset.levels[0]!).body, asset.palettes[asset.defaultPalette]!.colors);
}
