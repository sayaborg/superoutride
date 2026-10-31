import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

// A tracked symbolic link replaces whatever stands at its path on checkout; at an ignored directory's path (a link
// sharing `reference-media/` between working trees) Git would then delete the files it ignored there.
test('the repository tracks no symbolic link', () => {
  const links = execFileSync('git', ['ls-files', '--stage'], { cwd: repositoryRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('120000 '))
    .map((line) => line.split('\t')[1]);
  assert.deepEqual(links, []);
});
