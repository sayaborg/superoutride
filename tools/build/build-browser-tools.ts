import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The browser-tools build: the workbench, the sprite editor and the course viewer form one self-contained, versioned
 * output tree under dist/tools, with the license of the PNG codec they bundle beside each editing page. It delivers no
 * content; the content build owns dist/delivery.
 */
const root = new URL('../../', import.meta.url);
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: [
    'tools/workbench/workbench.ts',
    'tools/sprite-editor/sprite-editor.ts',
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
  ['sprite-editor', 'sprite-editor.html'],
  ['sprite-editor', 'sprite-editor.css'],
  ['course-viewer', 'course-viewer.html'],
  ['course-viewer', 'course-viewer.css'],
])
  await copyFile(new URL(`tools/${tool}/${name}`, root), new URL(`dist/tools/${tool}/${name}`, root));
// The bundled PNG codec's license travels with each editing page.
for (const tool of ['workbench', 'sprite-editor'])
  await copyFile(
    new URL('node_modules/pngjs/LICENSE', root),
    new URL(`dist/tools/${tool}/png-codec-LICENSE.txt`, root),
  );
