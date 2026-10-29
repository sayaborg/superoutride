import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The browser-tools build: the workbench and the course viewer form one self-contained, versioned output tree under dist/tools, with the
 * license of the PNG codec it bundles. It delivers no content; the content build owns dist/delivery.
 */
const root = new URL('../../', import.meta.url);
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: [
    'tools/workbench/workbench.ts',
    'tools/browser-shared/compile-worker.ts',
    'tools/workbench/measure-worker.ts',
    'tools/sprite-editor/sprite-import-worker.ts',
    'tools/course-viewer/course-viewer.ts',
    'tools/course-viewer/map-worker.ts',
  ],
  outbase: 'tools',
  outdir: 'dist/tools',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.tools.json',
  chunkNames: 'shared/[name]-[hash]',
  alias: { pngjs: 'pngjs/browser.js' },
});
for (const [tool, name] of [
  ['browser-shared', 'editor-frame.css'],
  ['workbench', 'workbench.html'],
  ['workbench', 'workbench.css'],
  ['course-viewer', 'course-viewer.html'],
  ['course-viewer', 'course-viewer.css'],
])
  await copyFile(new URL(`tools/${tool}/${name}`, root), new URL(`dist/tools/${tool}/${name}`, root));
// The bundled PNG codec's license travels with the workbench.
await copyFile(
  new URL('node_modules/pngjs/LICENSE', root),
  new URL('dist/tools/workbench/png-codec-LICENSE.txt', root),
);
