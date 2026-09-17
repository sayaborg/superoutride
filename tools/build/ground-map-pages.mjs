import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createGroundMapPageManifest,
  decodeGroundMapPageManifest,
  GroundMapPageAsset,
} from '../../dist/groundmap/ground-map-pages.js';
import { GroundMapPayloadStore } from '../../dist/groundmap/ground-map-payload-store.js';
import { groundMapDigest } from '../../dist/groundmap/ground-map-digest.js';

/** Publish content-addressed payloads, then the manifest. No full binary readback or range transport. */
export async function publishGroundMapPages(directory, binaryPath, metadata, identity) {
  const manifest = createGroundMapPageManifest(identity, metadata);
  await mkdir(directory, { recursive: true });
  const binary = await open(binaryPath, 'r');
  try {
    for (const payload of manifest.layout.payloads) {
      const bytes = new Uint8Array(payload.byteLength);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesRead } = await binary.read(bytes, offset, bytes.byteLength - offset, payload.offsetBytes + offset);
        if (bytesRead === 0) throw new Error('GroundMap compiler output ended inside payload');
        offset += bytesRead;
      }
      if ((await groundMapDigest(bytes)) !== payload.sha256)
        throw new Error('GroundMap compiler output digest mismatch');
      await writeFile(join(directory, `${payload.sha256}.bin`), bytes);
    }
  } finally {
    await binary.close();
  }
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const sha256 = await groundMapDigest(bytes);
  await writeFile(join(directory, `${sha256}.json`), bytes);
  return sha256;
}

/** Build-side smoke read uses the production resident reader contract, with bounded file transport. */
export async function verifyGroundMapPages(directory, sha256) {
  const bytes = await readFile(join(directory, `${sha256}.json`));
  const manifest = await decodeGroundMapPageManifest(Uint8Array.from(bytes), sha256);
  const asset = new GroundMapPageAsset(manifest);
  const maxPayload = Math.max(...manifest.layout.payloads.map((payload) => payload.byteLength));
  const store = new GroundMapPayloadStore(
    async (identity) => {
      const bytes = await readFile(join(directory, `${identity.sha256}.bin`));
      return Uint8Array.from(bytes).buffer;
    },
    { maxResidentBytes: maxPayload, maxLoadingBytes: maxPayload * 2 },
  );
  for (const level of manifest.layout.levels) {
    for (const row of [0, level.chainageTexels - 1]) {
      const frame = await asset.acquire(store, [{ level: level.level, rowStart: row, rowCount: 1 }]);
      try {
        const { s, l } = frame.reader.texelCenter(level.level, row, 0);
        frame.reader.sampleAtLevel(s, l, level.level);
      } finally {
        frame.release();
      }
    }
  }
}
