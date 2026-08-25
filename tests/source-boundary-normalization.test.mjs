import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = path.join(repositoryRoot, 'src');
const devRoot = path.join(srcRoot, 'dev');

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(target));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(target);
    }
  }
  return files;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

test('general source layers do not depend on src/dev', async () => {
  const topLevelEntries = await readdir(srcRoot, { withFileTypes: true });
  const generalDirectories = topLevelEntries
    .filter((entry) => entry.isDirectory() && entry.name !== 'dev')
    .map((entry) => path.join(srcRoot, entry.name));

  for (const directory of generalDirectories) {
    for (const sourceFile of await collectTypeScriptFiles(directory)) {
      const source = await import('node:fs/promises').then(({ readFile }) => readFile(sourceFile, 'utf8'));
      const importSpecifiers = [
        ...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g),
      ].map((match) => match[1]);

      for (const specifier of importSpecifiers) {
        if (!specifier.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(sourceFile), specifier);
        assert.equal(
          resolved === devRoot || resolved.startsWith(`${devRoot}${path.sep}`),
          false,
          `${path.relative(repositoryRoot, sourceFile)} must not import ${specifier}`,
        );
      }
    }
  }
});

test('source-boundary authority paths have no compatibility shims', async () => {
  const oldAuthorityPaths = [
    'src/core/debug-course.ts',
    'src/dev/m5-camera.ts',
    'src/visual/m3-debug-visual.ts',
    'src/world/m4-debug-world.ts',
  ];
  const newAuthorityPaths = [
    'src/dev/debug-course.ts',
    'src/camera/m5-camera.ts',
    'src/dev/m3-debug-visual.ts',
    'src/dev/m4-debug-world.ts',
  ];

  for (const relativePath of oldAuthorityPaths) {
    assert.equal(
      await pathExists(path.join(repositoryRoot, relativePath)),
      false,
      `${relativePath} must not remain as a compatibility shim`,
    );
  }
  for (const relativePath of newAuthorityPaths) {
    assert.equal(
      await pathExists(path.join(repositoryRoot, relativePath)),
      true,
      `${relativePath} must be the current authority`,
    );
  }
});
