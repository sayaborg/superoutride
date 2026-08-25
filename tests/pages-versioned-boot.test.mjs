import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Pages boot resolves either top-level composition through one commit-versioned ESM path', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

  assert.match(index, /new URLSearchParams\(location\.search\)\.get\('mode'\) === 'circuit'/);
  assert.match(index, /const entryName = circuitMode \? 'main-circuit\.js' : 'main\.js'/);
  assert.match(index, /const fallbackEntry = `\.\/dist\/\$\{entryName\}`/);
  assert.match(index, /fetch\(`\.\/version\.txt\?t=\$\{Date\.now\(\)\}`/);
  assert.match(index, /\.\/build\/\$\{version\}\/\$\{entryName\}/);
  assert.match(workflow, /BUILD_ID="\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /cp -R dist\/\. "_site\/build\/\$\{BUILD_ID\}\/"/);
  assert.match(workflow, /printf '%s\\n' "\$\{BUILD_ID\}" > _site\/version\.txt/);
  assert.match(workflow, /cp -R dist _site\/dist/);
});
