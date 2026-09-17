import { mkdtemp, open, unlink, copyFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { compileBakedGroundMapAsset } from '../../dist/groundmap/ground-map-asset-compiler.js';

/** File-backed compiler workspace. Never accumulates source images or output payloads in RAM. */
export async function compileGroundMapFiles(binaryPath, source, density, kMax, chunkMeters = 32, options) {
  const directory = await mkdtemp(join(dirname(binaryPath), '.ground-map-'));
  const handles = new Map();
  const sizes = new Map();
  async function handle(key) {
    if (!handles.has(key)) handles.set(key, await open(join(directory, key), 'w+'));
    return handles.get(key);
  }
  const storage = {
    async append(key, bytes) {
      const file = await handle(key);
      const start = sizes.get(key) ?? 0;
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await file.write(bytes, offset, bytes.byteLength - offset, start + offset);
        if (bytesWritten === 0) throw new Error('GroundMap spool write made no progress');
        offset += bytesWritten;
      }
      sizes.set(key, start + bytes.byteLength);
    },
    async read(key, start, bytes) {
      if (!handles.has(key) || start + bytes.byteLength > sizes.get(key))
        throw new Error('GroundMap spool read outside file');
      const file = handles.get(key);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesRead } = await file.read(bytes, offset, bytes.byteLength - offset, start + offset);
        if (bytesRead === 0) throw new Error('GroundMap spool ended before requested bytes');
        offset += bytesRead;
      }
    },
    async remove(key) {
      await handles.get(key)?.close();
      handles.delete(key);
      sizes.delete(key);
      await unlink(join(directory, key));
    },
  };
  try {
    const metadata = await compileBakedGroundMapAsset(source, density, kMax, storage, chunkMeters, options);
    await copyFile(join(directory, 'asset'), binaryPath);
    return metadata;
  } finally {
    try {
      await Promise.all([...handles.values()].map((file) => file.close()));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
