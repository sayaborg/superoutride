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


// Discover all maintained documents: a new topic must not escape link/encoding checks.
const currentHandoff = 'docs/NEXT.md';
async function currentDocuments() {
  return ['AGENTS.md', 'README.md',
    ...await collectFiles(path.join(repositoryRoot, 'docs'), ['.md']),
    ...await collectFiles(sourceRoot, ['.md'])].map(file => path.resolve(repositoryRoot, file));
}
function documentReferences(source) {
  return [...source.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)]
    .map(match => match[1]).filter(ref => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref))
    .map(ref => ref.split(/[?#]/)[0]).filter(Boolean);
}

test('all maintained Markdown has valid UTF-8 and existing local link targets', async () => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const missing = [];
  for (const file of await currentDocuments()) {
    const source = decoder.decode(await readFile(file));
    assert.doesNotMatch(source, /\uFFFD/, `encoding damage: ${file}`);
    for (const reference of documentReferences(source)) {
      const target = path.resolve(path.dirname(file), reference);
      if (!await pathExists(target)) missing.push(`${path.relative(repositoryRoot, file)}: ${reference}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every entry points directly to the sole current restart checkpoint', async () => {
  for (const entry of ['AGENTS.md', 'README.md', 'docs/README.md']) {
    const source = await readFile(path.join(repositoryRoot, entry), 'utf8');
    const targets = documentReferences(source).map(ref => path.resolve(repositoryRoot, path.dirname(entry), ref));
    assert.ok(targets.includes(path.join(repositoryRoot, currentHandoff)), `${entry} lacks restart link`);
  }
  const source = await readFile(path.join(repositoryRoot, currentHandoff), 'utf8');
  assert.match(source, /DEV_UNCALIBRATED/);
  assert.doesNotMatch(source, /sandbox:|\/mnt\/data\/|\/private\/tmp\/|file_[0-9a-f]{16,}/,
    'restart must not require a former session directory or attachment');
});
