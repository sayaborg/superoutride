import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

/** Saved reference results bind the actual mechanics, planning and traversal implementation. */
export async function referenceModelIdentity() {
  const root = new URL('../../', import.meta.url),
    files = [];
  const collect = async (path) => {
    for (const e of await readdir(new URL(path, root), { withFileTypes: true })) {
      if (e.isDirectory()) await collect(path + e.name + '/');
      else if (e.name.endsWith('.ts')) files.push(path + e.name);
    }
  };
  for (const path of ['src/core/', 'src/physics/', 'src/vehicle/', 'src/gameplay/', 'src/runtime/'])
    await collect(path);
  files.push(
    'src/browser/frame-loop.ts',
    'src/browser/session-vehicle.ts',
    'src/browser/steering-calibration-selection.ts',
    'src/browser/tire-friction-selection.ts',
    'tools/course/reference-run.mjs',
    'tools/course/vehicle-envelope.mjs',
  );
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file + '\0').update(await readFile(new URL(file, root)));
  return hash.digest('hex');
}
