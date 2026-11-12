import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/**
 * The game build: the page's composition root and every module it imports form one bundle, `dist/shell/main-course.js`,
 * and the AudioWorklet's module graph another, `dist/audio/vehicle-processor.js`, so the browser fetches two files of the
 * game however deep its imports run. Each stays one directory under the build's root, where it reaches `../delivery/`
 * and `../audio/vehicle-processor.js` as before. The sources are type-checked apart (`tsc --noEmit`); the content build
 * owns dist/delivery and the browser-tools build dist/tools.
 */
const root = new URL('../../', import.meta.url);
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/shell/main-course.ts', 'src/audio/vehicle-processor.ts'],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.json',
});
