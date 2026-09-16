import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('actual Pages staging binds HTML to immutable CSS, retaining the complete build and local fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'outride-pages-style-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const [index, styles, workflow] = await Promise.all(
    ['index.html', 'styles.css', '.github/workflows/pages.yml'].map((path) =>
      readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
    ),
  );
  await writeFile(join(root, 'index.html'), index);
  await writeFile(join(root, 'styles.css'), styles);
  await mkdir(join(root, 'dist', 'audio'), { recursive: true });
  await writeFile(join(root, 'dist', 'boot.js'), 'export {};');
  await writeFile(join(root, 'dist', 'audio', 'voice.js'), 'export const voice = 1;');
  const stage = workflow
    .split('      - name: Stage static site\n')[1]
    .split('      - name: Setup Pages')[0]
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^          /, ''))
    .join('\n');
  const sha = '1234567890abcdef1234567890abcdef12345678';
  execFileSync('bash', ['-eu', '-c', stage], { cwd: root, env: { ...process.env, GITHUB_SHA: sha } });
  const published = await readFile(join(root, '_site', 'index.html'), 'utf8');
  assert.ok(published.includes(`href="./build/${sha}/styles.css"`));
  assert.ok(!published.includes('href="./styles.css"'));
  assert.ok(index.includes('href="./styles.css"'), 'local source still works without deployment');
  assert.equal(await readFile(join(root, '_site', 'build', sha, 'styles.css'), 'utf8'), styles);
  assert.equal(
    await readFile(join(root, '_site', 'build', sha, 'audio', 'voice.js'), 'utf8'),
    'export const voice = 1;',
  );
  assert.equal(await readFile(join(root, '_site', 'dist', 'boot.js'), 'utf8'), 'export {};');
  assert.equal((await readFile(join(root, '_site', 'version.txt'), 'utf8')).trim(), sha);
});

test('Pages boot resolves all three top-level compositions through one commit-versioned ESM path', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

  assert.match(index, /const entryName = 'boot\.js'/);
  assert.match(index, /const fallbackEntry = `\.\/dist\/\$\{entryName\}`/);
  assert.match(index, /fetch\(`\.\/version\.txt\?t=\$\{Date\.now\(\)\}`/);
  assert.match(index, /\.\/build\/\$\{version\}\/\$\{entryName\}/);
  assert.match(workflow, /BUILD_ID="\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /cp -R dist\/\. "_site\/build\/\$\{BUILD_ID\}\/"/);
  assert.match(workflow, /printf '%s\\n' "\$\{BUILD_ID\}" > _site\/version\.txt/);
  assert.match(workflow, /cp -R dist _site\/dist/);
});

test('product labels have stable identity independent of package version', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.name, 'super-outride');
  const [index, hud, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/vehicle-debug-hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(index, /<title>SUPER OUTRIDE<\/title>/);
  assert.match(hud, /SUPER OUTRIDE/);
  for (const source of [index, hud]) assert.doesNotMatch(source, /M\d+\.\d+/);
  for (const [name, source] of [
    ['LINEAR', linear],
    ['BRANCHING', branching],
    ['CIRCUIT', circuit],
  ]) {
    assert.match(source, /shell\.present\(/, `${name} must use the shared HUD`);
  }
});
