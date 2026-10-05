import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { atomicWrite } from './authoring-io.js';

const referenceCacheDirectory = new URL('../../.cache/course-reference/', import.meta.url);
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/**
 * Vehicle values are an independent key component; editing one vehicle definition cannot invalidate its peers.
 * `procedureSha256` identifies what produced the value: the reference run for runs, the measurement for envelopes.
 */
export function referenceCacheKey(courseBuildSha256: string | null, vehicleSha256: string, procedureSha256: string) {
  return digest({ courseBuildSha256, vehicleSha256, procedureSha256 });
}
export async function cachedReference<T>(
  kind: string,
  key: string,
  generate: () => T | Promise<T>,
  root = referenceCacheDirectory,
): Promise<{ value: T; hit: boolean }> {
  const file = new URL(`${kind}/${key}.json`, root);
  try {
    const saved: { key: string; sha256: string; value: T } = JSON.parse(await readFile(file, 'utf8'));
    if (saved.key === key && saved.sha256 === digest(saved.value)) return { value: saved.value, hit: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const value = await generate();
  await atomicWrite(file.pathname, JSON.stringify({ key, sha256: digest(value), value }) + '\n');
  return { value, hit: false };
}
