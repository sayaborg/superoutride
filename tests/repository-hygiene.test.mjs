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

// Current navigation only: archived reports may intentionally name retired/external evidence.
const currentDocuments = [
  'AGENTS.md',
  'README.md',
  'docs/README.md',
  'docs/92_m9_2_selectable_self_steer_gain.md',
  'docs/93_m9_3_tsukuba_circuit.md',
  'docs/115_m9_21_torque_protection.md',
  'docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_21.md',
  'docs/114_m9_20_five_axis_tire.md',
  'docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_20.md',
  'docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md',
  'docs/research/M9_20_PRESERVATION_REPAIR_2026-09-06.md',
  'docs/research/m9_20_source_reports/README.md',
];

function documentReferences(source) {
  const references = new Set();
  // Relative Markdown links include bare filenames and directory links.
  for (const match of source.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const ref = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
    const local = ref.split(/[?#]/)[0];
    if (local) references.add(local);
  }
  const localText = source.replace(/https?:\/\/[^\s`<>]+/g, '');
  for (const match of localText.matchAll(
    /(?:\.\.\/|docs\/|src\/|tests\/|tools\/|validation\/|research\/)[A-Za-z0-9_.\/-]+\.(?:md|txt|ts|mjs|json|html|css)/g,
  )) references.add(match[0]);
  // Literal directory promises were the hole through which the missing archive passed.
  for (const match of localText.matchAll(/`([^`\n]+)`/g)) {
    if (/^(?:\.{1,2}\/|docs\/|src\/|tests\/|tools\/|validation\/|research\/)[A-Za-z0-9_.\/-]*$/.test(match[1])
      && match[1].endsWith('/')) references.add(match[1]);
  }
  // Documentation indexes also use standalone repository-relative filenames in code fences.
  for (const match of localText.matchAll(/^[A-Za-z0-9_.\/-]+\.(?:md|txt|ts|mjs|json|html|css)$/gm)) {
    references.add(match[0]);
  }
  return [...references];
}

test('document reference extraction covers directories, relative links and index filenames', () => {
  const source = '`docs/research/m9_20_source_reports/` [manifest](manifest.json) '
    + '[reports](research/reports/) [external](https://example.invalid/docs/absent.md)\n'
    + '114_m9_20_five_axis_tire.md\n`src/**`';
  assert.deepEqual(documentReferences(source).sort(), [
    'docs/research/m9_20_source_reports/', 'manifest.json', 'research/reports/',
    '114_m9_20_five_axis_tire.md',
  ].sort());
});

test('current entry documents contain no release-candidate residue or broken repository paths', async () => {
  const missing = [];
  for (const relativeDocument of currentDocuments) {
    const source = await readFile(path.join(repositoryRoot, relativeDocument), 'utf8');
    for (const reference of documentReferences(source)) {
      const target = /^(?:docs|src|tests|tools)\//.test(reference)
        ? path.join(repositoryRoot, reference)
        : path.resolve(path.dirname(path.join(repositoryRoot, relativeDocument)), reference);
      if (!await pathExists(target)) missing.push(`${relativeDocument}: ${reference}`);
      else {
        const status = await stat(target);
        assert.ok(reference.endsWith('/') ? status.isDirectory() : status.isFile(),
          `${relativeDocument}: wrong reference kind ${reference}`);
      }
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


test('current documents are valid UTF-8 without the known encoding damage', async () => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const relative of currentDocuments) {
    const source = decoder.decode(await readFile(path.join(repositoryRoot, relative)));
    assert.doesNotMatch(source, /\uFFFD|\u00e2\u20ac|\u00c3\u2014|\u00c3\u2017|band\u00afroll/,
      `encoding damage: ${relative}`);
  }
  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
  assert.match(readme, /320×240/);
  assert.match(readme, /Road bank is absent from raster geometry/);
  assert.match(readme, /camera roll is zero/);
});
