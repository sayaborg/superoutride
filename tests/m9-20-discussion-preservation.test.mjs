import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const archive = path.join(root, 'docs/research/m9_20_source_reports');
// Pin the recovered inventory as well as its payloads: deleting an entry must not hide a loss.
const manifestSha256 = '658c9fd4d4b74ff7e6e39e30089a9540edc4cd62ae5d6c63314cb67d91639b65';
const readmeSha256 = 'c267da6dcfae1261d3a2965440f94919b3180f5014e91823dffd13d51b4787f3';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readRegularFile(directory, name) {
  const target = path.join(directory, name);
  assert.ok((await lstat(target)).isFile(), `not a regular file: ${name}`);
  return readFile(target);
}

async function verifyArchive(directory) {
  assert.ok((await lstat(directory)).isDirectory(), 'archive must be a directory');
  const bytes = await readRegularFile(directory, 'manifest.json');
  assert.equal(sha256(bytes), manifestSha256, 'recovered manifest identity');
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert.ok(Array.isArray(manifest));
  assert.equal(manifest.length, 8, 'eight recovered reports');
  const names = manifest.map((entry) => entry.path);
  assert.equal(new Set(names).size, names.length);
  for (const entry of manifest) {
    assert.deepEqual(Object.keys(entry).sort(), ['path', 'sha256']);
    assert.match(entry.path, /^[A-Za-z0-9_-]+\.md$/);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sha256(await readRegularFile(directory, entry.path)), entry.sha256, entry.path);
  }
  assert.equal(sha256(await readRegularFile(directory, 'README.md')), readmeSha256,
    'recovered snapshot scope identity');
  assert.deepEqual((await readdir(directory)).sort(), [...names, 'README.md', 'manifest.json'].sort());
  return manifest;
}

test('M9.20 preserves the complete recovered inventory and every original byte hash', async () => {
  const manifest = await verifyArchive(archive);
  const history = await readFile(path.join(root, 'docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md'), 'utf8');
  for (const entry of manifest) {
    assert.ok(history.includes(`](m9_20_source_reports/${entry.path})`),
      `decision history must link original ${entry.path}`);
  }
});

test('M9.20 preservation checks reject missing or rewritten evidence', async (t) => {
  const manifest = JSON.parse(await readFile(path.join(archive, 'manifest.json'), 'utf8'));
  const first = manifest[0].path;
  const cases = [
    ['missing archive', (dir) => rm(dir, { recursive: true })],
    ['missing manifest', (dir) => rm(path.join(dir, 'manifest.json'))],
    ['missing original', (dir) => rm(path.join(dir, first))],
    ['changed original', (dir) => writeFile(path.join(dir, first), 'changed\n')],
    ['removed inventory entry and file', async (dir) => {
      await rm(path.join(dir, first));
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest.slice(1)));
    }],
    ['changed scope notice', (dir) => writeFile(path.join(dir, 'README.md'), 'changed\n')],
    ['unlisted file', (dir) => writeFile(path.join(dir, 'unlisted.md'), 'extra\n')],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const temporary = await mkdtemp(path.join(tmpdir(), 'superoutride-preservation-'));
      const copy = path.join(temporary, 'archive');
      try {
        await cp(archive, copy, { recursive: true });
        await verifyArchive(copy); // The unmodified fixture must first pass.
        await mutate(copy);
        await assert.rejects(verifyArchive(copy));
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    });
  }
});
