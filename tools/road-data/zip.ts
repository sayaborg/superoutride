import { crc32 } from '../authoring/crc32.js';
import { requireInput } from '../authoring/authoring-error.js';

/** A file of a zip archive: its name (without folders), its contents and their CRC-32. */
export interface ZipFile {
  readonly name: string;
  readonly crc: number;
  readonly data: Uint8Array;
}

/** Deflated bytes inflated by the platform's `DecompressionStream`, in Node and the browser alike. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The files of a zip archive's bytes, by name: each stored or deflated file inflated and checked against the CRC-32
 * its central directory records. It reads no file and needs no Node module.
 */
export async function readZip(bytes: Uint8Array): Promise<Map<string, ZipFile>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of central directory record: the last of its signature, within its comment's reach of the end.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--)
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  requireInput(end >= 0, '/zip', 'The file is not a zip archive');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, ZipFile>();
  for (let i = 0; i < count; i++) {
    requireInput(view.getUint32(at, true) === 0x02014b50, '/zip', 'The zip archive has a broken central directory');
    const method = view.getUint16(at + 10, true),
      crc = view.getUint32(at + 16, true),
      compressed = view.getUint32(at + 20, true),
      size = view.getUint32(at + 24, true),
      nameLength = view.getUint16(at + 28, true),
      extraLength = view.getUint16(at + 30, true),
      commentLength = view.getUint16(at + 32, true),
      local = view.getUint32(at + 42, true);
    const path = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (path.endsWith('/')) continue;
    const name = path.slice(path.lastIndexOf('/') + 1);
    requireInput(
      view.getUint32(local, true) === 0x04034b50,
      `/zip/${name}`,
      'The zip archive has a broken file header',
    );
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compressed);
    requireInput(method === 0 || method === 8, `/zip/${name}`, `Compression method ${method} is not read`);
    const data = method === 0 ? raw : await inflateRaw(raw);
    requireInput(data.length === size && crc32(data) === crc, `/zip/${name}`, 'The file does not match its CRC-32');
    files.set(name, { name, crc, data });
  }
  return files;
}
