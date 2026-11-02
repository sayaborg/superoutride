const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * The CRC-32 (IEEE) of `bytes`, as zip and PNG files check their parts; given `before`, the CRC of the bytes before them,
 * the CRC of both together, so a long run is worked out in parts.
 */
export function crc32(bytes: Uint8Array, before = 0): number {
  let crc = (before ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
