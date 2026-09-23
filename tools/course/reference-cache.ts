import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { atomicWrite } from './authoring-io.js';

const referenceCacheDirectory = new URL('../../.cache/course-reference/', import.meta.url);
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Vehicle values are an independent key component; editing one profile cannot invalidate its peers. */
export function referenceCacheKey(
  courseBuildSha256: string | null,
  vehicleSha256: string,
  driver: unknown,
  physicsSha256: string,
) {
  return digest({ courseBuildSha256, vehicleSha256, driver, physicsSha256 });
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
