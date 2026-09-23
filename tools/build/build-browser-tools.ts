import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Four browser tools and their worklet entries form one self-contained, versioned output tree. */
export async function buildBrowserTools(): Promise<void> {
  const root = new URL('../../', import.meta.url);
  await build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: [
      'tools/graphics/sprite-tool.ts',
      'tools/graphics/sprite-lod.ts',
      'tools/audio/audio-browser.ts',
      'tools/audio/tire-browser.ts',
      'tools/audio/exhaust-processor.ts',
      'tools/audio/tire-processor.ts',
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
  for (const name of [
    'graphics/sprite-tool.html',
    'graphics/sprite-tool.css',
    'graphics/sprite-lod.html',
    'audio/audio-browser.html',
    'audio/tire-browser.html',
  ]) {
    const target = new URL(`dist/tools/${name}`, root);
    await mkdir(new URL('./', target), { recursive: true });
    const source = await readFile(new URL(`tools/${name}`, root), 'utf8');
    await writeFile(target, source.replace('href="../../?mode=', 'href="../../../../?mode='));
  }
}
