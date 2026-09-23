import { rgba } from '../../dist/image/rgb555.js';
import { SPRITE_SOURCE_PIXEL_LIMIT } from '../../dist/image/sprite-source-compiler.js';

export const SPRITE_PNG_BYTE_LIMIT = 32 * 1024 * 1024;

/** Same pinned pngjs decoder in Node and the authoring browser; no canvas color conversion. */
export async function decodeSpritePng(bytes, PNG, pixelLimit = SPRITE_SOURCE_PIXEL_LIMIT, axisLimit = Infinity) {
  if (!(bytes instanceof Uint8Array) || bytes.length > SPRITE_PNG_BYTE_LIMIT)
    throw new RangeError('PNG exceeds 32 MiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (
    bytes.length < 33 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => bytes[i] !== b) ||
    view.getUint32(8) !== 13 ||
    type(12) !== 'IHDR'
  )
    throw new RangeError('PNG requires a valid signature and IHDR');
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (
    bytes[24] !== 8 ||
    width < 1 ||
    height < 1 ||
    width * height > pixelLimit ||
    width > axisLimit ||
    height > axisLimit
  )
    throw new RangeError(
      `PNG must be 8-bit, contain at most ${pixelLimit} pixels and fit ${axisLimit} pixels per axis`,
    );
  let offset = 8;
  for (; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    if (offset + length + 12 > bytes.length) throw new RangeError('truncated PNG chunk');
    if (type(offset + 4) === 'acTL') throw new RangeError('animated PNG input is not supported');
    offset += length + 12;
  }
  if (offset !== bytes.length) throw new RangeError('truncated PNG chunk');
  // prepare sRGB sources before import: pngjs does not apply gamma/ICC conversion here.
  const decoded = await new Promise((resolve, reject) => {
    new PNG({ checkCRC: true }).parse(bytes, (error, value) => (error ? reject(error) : resolve(value)));
  });
  const pixels = new Uint32Array(width * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = rgba(...decoded.data.subarray(i * 4, i * 4 + 4));
  return { width, height, pixels };
}
