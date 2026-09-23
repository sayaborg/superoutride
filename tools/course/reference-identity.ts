import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

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
  return hash.digest('hex');
}
