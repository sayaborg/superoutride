/**
 * Stored (uncompressed) zip archives: the workbench's one archive form. Reading accepts only stored entries, which is
 * what the workbench writes.
 */
export interface ZipEntry {
  /** A slash-separated path. */
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00, the earliest DOS date: archives carry no time, so equal contents give equal archives.
const DOS_DATE = 0x21;

/** A stored zip of the entries, in their order, with UTF-8 names. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const nameBytes = encoder.encode(name),
      crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.byteLength, true);
    local.setUint32(22, bytes.byteLength, true);
    local.setUint16(26, nameBytes.byteLength, true);
    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(14, DOS_DATE, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, bytes.byteLength, true);
    record.setUint32(24, bytes.byteLength, true);
    record.setUint16(28, nameBytes.byteLength, true);
    record.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, bytes);
    central.push(new Uint8Array(record.buffer), nameBytes);
    offset += 30 + nameBytes.byteLength + bytes.byteLength;
  }
  const centralSize = central.reduce((n, part) => n + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, part) => n + part.byteLength, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** The entries of a stored zip; a compressed or damaged archive is a RangeError naming the problem. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new RangeError('Not a zip archive');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new RangeError('Damaged zip directory');
    const method = view.getUint16(at + 10, true),
      crc = view.getUint32(at + 16, true),
      size = view.getUint32(at + 20, true),
      nameLength = view.getUint16(at + 28, true),
      extraLength = view.getUint16(at + 30, true),
      commentLength = view.getUint16(at + 32, true),
      local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new RangeError(`Compressed zip entry ${name}: the workbench reads only its own archives`);
    const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const content = bytes.slice(data, data + size);
    if (crc32(content) !== crc) throw new RangeError(`Damaged zip entry ${name}`);
    if (!name.endsWith('/')) entries.push({ name, bytes: content });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
