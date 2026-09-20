import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { atomicWrite } from './authoring-io.mjs';

export const referenceCacheDirectory = new URL('../../.cache/course-reference/', import.meta.url);
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Vehicle values are an independent key component; editing one profile cannot invalidate its peers. */
export function referenceCacheKey(courseBuildSha256, vehicleSha256, driver, physicsSha256) {
  return digest({ courseBuildSha256, vehicleSha256, driver, physicsSha256 });
}
export async function cachedReference(kind, key, generate, root = referenceCacheDirectory) {
  const file = new URL(`${kind}/${key}.json`, root);
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.key === key && saved.sha256 === digest(saved.value)) return { value: saved.value, hit: true };
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const value = await generate();
  await atomicWrite(file.pathname, JSON.stringify({ key, sha256: digest(value), value }) + '\n');
  return { value, hit: false };
}
