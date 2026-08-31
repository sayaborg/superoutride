import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = path.join(repositoryRoot, 'src');

async function collectFiles(directory, suffixes) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target, suffixes));
    else if (entry.isFile() && suffixes.some((suffix) => entry.name.endsWith(suffix))) {
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

test('every TypeScript module is consumed by source tests or tools', async () => {
  const sourceFiles = await collectFiles(sourceRoot, ['.ts']);
  const consumers = [
    ...sourceFiles,
    ...await collectFiles(path.join(repositoryRoot, 'tests'), ['.mjs']),
    ...await collectFiles(path.join(repositoryRoot, 'tools'), ['.mjs']),
  ];
  const incoming = new Map(sourceFiles.map((file) => [file, []]));

  for (const consumer of consumers) {
    const source = await readFile(consumer, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      let resolved = path.resolve(path.dirname(consumer), specifier);
      resolved = resolved.replace(`${path.sep}dist${path.sep}`, `${path.sep}src${path.sep}`);
      resolved = resolved.replace(/\.js$/, '.ts');
      incoming.get(resolved)?.push(consumer);
    }
  }

  const compositionRoots = new Set([
    'src/boot.ts',
    'src/main-linear.ts',
    'src/main.ts',
    'src/main-circuit.ts',
  ].map((relative) => path.join(repositoryRoot, relative)));
  const unconsumed = [...incoming]
    .filter(([file, consumersForFile]) => (
      consumersForFile.length === 0 && !compositionRoots.has(file)
    ))
    .map(([file]) => path.relative(repositoryRoot, file))
    .sort();
  assert.deepEqual(unconsumed, []);
});

test('current entry documents contain no release-candidate residue or broken repository paths', async () => {
  const currentDocuments = [
    'AGENTS.md',
    'README.md',
    'docs/README.md',
    'docs/92_m9_2_selectable_self_steer_gain.md',
  ];
  const missing = [];
  for (const relativeDocument of currentDocuments) {
    const source = await readFile(path.join(repositoryRoot, relativeDocument), 'utf8');
    for (const match of source.matchAll(
      /(?:\.\.\/|docs\/|src\/|tests\/|tools\/|validation\/)[A-Za-z0-9_.\/-]+\.(?:md|txt|ts|mjs|json|html|css)/g,
    )) {
      const reference = match[0];
      const target = /^(?:docs|src|tests|tools)\//.test(reference)
        ? path.join(repositoryRoot, reference)
        : path.resolve(path.dirname(path.join(repositoryRoot, relativeDocument)), reference);
      if (!await pathExists(target)) missing.push(`${relativeDocument}: ${reference}`);
    }
  }
  assert.deepEqual([...new Set(missing)].sort(), []);

  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /M9\.2 Selectable Steering Calibration Candidate/);
  assert.doesNotMatch(readme, /release status remains candidate/);
  const handoff = await readFile(
    path.join(repositoryRoot, 'docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_STEERING_INPUT_AND_SELF_STEER.md'),
    'utf8',
  );
  assert.match(handoff, /resolved historical takeover context/);
  assert.match(handoff, /Original handoff instruction — completed/);
  assert.doesNotMatch(handoff, /This is active takeover context/);
});
