import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = path.join(repositoryRoot, 'src');
const devRoot = path.join(srcRoot, 'dev');
const allowedDevCompositionRoots = new Set([
  path.join(srcRoot, 'main-linear.ts'),
  path.join(srcRoot, 'main.ts'),
  path.join(srcRoot, 'main-circuit.ts'),
]);

const retiredAuthorityPaths = [
  'src/core/debug-course.ts',
  'src/dev/camera.ts',
  'src/gameplay/race-progress.ts',
  'src/input/steering-filter.ts',
  'src/physics/car-physics.ts',
  'src/physics/motorcycle-physics.ts',
  'src/visual/m3-debug-visual.ts',
  'src/world/m4-debug-world.ts',
];

const currentAuthorityPaths = [
  'src/camera/camera.ts',
  'src/dev/fixtures/raster-courses.ts',
  'src/dev/fixtures/hill-dip-height.ts',
  'src/dev/fixtures/cliff-visual.ts',
  'src/dev/courses/roadside-scenery.ts',
  'src/dev/fixtures/minimal-route-gates.ts',
  'src/dev/fixtures/minimal-route-dag.ts',
  'src/dev/fixtures/minimal-stage-manifest.ts',
];

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(target)));
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
    const importSpecifiers = [...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]);

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
  for (const relativePath of retiredAuthorityPaths) {
    assert.equal(
      await pathExists(path.join(repositoryRoot, relativePath)),
      false,
      `${relativePath} must not remain as a compatibility shim`,
    );
  }
  for (const relativePath of currentAuthorityPaths) {
    assert.equal(
      await pathExists(path.join(repositoryRoot, relativePath)),
      true,
      `${relativePath} must be the current authority`,
    );
  }
});

test('DEV and test-helper file names describe content without milestone identifiers', async () => {
  const files = [
    ...(await collectTypeScriptFiles(devRoot)),
    ...(await readdir(path.join(repositoryRoot, 'tests/helpers'))).map((file) =>
      path.join(repositoryRoot, 'tests/helpers', file),
    ),
  ];
  for (const file of files) {
    assert.doesNotMatch(path.basename(file), /^m\d+(?:-\d+)?-/i);
    if (!file.startsWith(devRoot)) continue;
    const relative = path.relative(devRoot, file);
    assert.match(relative, /^(?:courses|fixtures|diagnostics)[\/]/, relative);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bM[0-9]+(?:[._][0-9]+)?\b|\b(?:[a-z]+)?M[0-9]+[A-Z_]/, relative);
  }
});

test('source modules do not revive retired authorities as pure re-export shims', async () => {
  const violations = [];
  for (const sourceFile of await collectTypeScriptFiles(srcRoot)) {
    const source = await readFile(sourceFile, 'utf8');
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .trim();
    if (executable !== '' && /^(?:export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"][^'"]+['"];?\s*)+$/.test(executable)) {
      violations.push(path.relative(repositoryRoot, sourceFile));
    }
  }
  assert.deepEqual(violations.sort(), []);
});

test('open-route regression fixtures do not hide endpoint defects behind cyclic profiles', async () => {
  const openRouteFixtures = [
    'tests/live-fork-driving-regression.test.mjs',
    'tests/branch-violation-recovery.test.mjs',
    'tests/field-route-progress.test.mjs',
  ];
  for (const relativePath of openRouteFixtures) {
    const source = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /\bnew\s+Cyclic(?:HeightProfile|SurfaceMap|VisualProfile)|\bimport\s+\{\s*Cyclic(?:HeightProfile|SurfaceMap|VisualProfile)/,
      relativePath,
    );
  }
});

test('general source profiles expose one finite domain without cyclic implementations', async () => {
  for (const relativePath of [
    'src/core/height-profile.ts',
    'src/visual/visual-profile.ts',
    'src/groundmap/baked-ground-map.ts',
    'src/groundmap/logical-profile.ts',
    'src/physics/surface-map.ts',
  ]) {
    const source = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
    assert.doesNotMatch(source, /\bwrapPositive\b|\bclass Cyclic\w*/, relativePath);
  }
});
