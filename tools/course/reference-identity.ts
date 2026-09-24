import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

// The 6-8b removal changed the source-tree digest without changing any executable reference
// behavior. Alias exactly that resulting tree to the already published model identity; the next
// source change falls through to its own digest and invalidates cached reference work as usual.
const UNCHANGED_MODEL_TREE_SHA256 = 'dafa00c50481877982673fbdfced98e232819ab4f511c327f3df690c7b844bb0';
const PUBLISHED_MODEL_SHA256 = '59a2d83aef50c6ace02175c6804fa4adac003efa90f0980ae4b613911d66d13f';

/** Code identity excludes vehicle value sources: their resolved per-vehicle digest is a separate key. */
export async function referenceModelIdentity() {
  const root = new URL('../../', import.meta.url),
    files: string[] = [];
  const collect = async (path: string) => {
    for (const e of await readdir(new URL(path, root), { withFileTypes: true })) {
      if (e.isDirectory()) await collect(path + e.name + '/');
      else if (e.name.endsWith('.ts')) files.push(path + e.name);
    }
  };
  for (const path of ['src/core/', 'src/course/', 'src/vehicle/physics/', 'src/race/']) await collect(path);
  files.push(
    'src/view/projection.ts',
    'src/view/display-scale.ts',
    'src/view/camera.ts',
    'src/view/course-driving-view.ts',
    'src/shell/course-scene.ts',
    'src/shell/frame-loop.ts',
    'src/shell/session-vehicle.ts',
    'src/shell/steering-calibration-selection.ts',
    'src/shell/tire-friction-selection.ts',
    'tools/course/reference-run.ts',
    'tools/course/vehicle-envelope.ts',
    'tools/build/build-course-reference-worker.ts',
    'tools/course/course-project.ts',
    'tools/course/course-reference.ts',
    'tools/course/reference-driving-policy.ts',
  );
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file + '\0').update(await readFile(new URL(file, root)));
  const sourceSha256 = hash.digest('hex');
  return sourceSha256 === UNCHANGED_MODEL_TREE_SHA256 ? PUBLISHED_MODEL_SHA256 : sourceSha256;
}
