import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = path.join(repositoryRoot, 'src');
const devRoot = path.join(srcRoot, 'dev');
const allowedDevCompositionRoots = new Set([
  path.join(srcRoot, 'main-linear.ts'),
  path.join(srcRoot, 'main.ts'),
  path.join(srcRoot, 'main-circuit.ts'),
]);

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

test('only explicit top-level composition roots may depend on src/dev', async () => {
  const violations = [];

  for (const sourceFile of await collectTypeScriptFiles(srcRoot)) {
    if (sourceFile === devRoot || sourceFile.startsWith(`${devRoot}${path.sep}`)) {
      continue;
    }

    const source = await readFile(sourceFile, 'utf8');
    const importSpecifiers = [
      ...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);

    for (const specifier of importSpecifiers) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(sourceFile), specifier);
      if (resolved !== devRoot && !resolved.startsWith(`${devRoot}${path.sep}`)) {
        continue;
      }
      if (!allowedDevCompositionRoots.has(sourceFile)) {
        violations.push(`${path.relative(repositoryRoot, sourceFile)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations.sort(), []);
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
